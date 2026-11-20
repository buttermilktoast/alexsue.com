#!/usr/bin/env python3
"""Fetch the public feeds for /home/ and keep the last usable snapshot per source."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public/home/feeds.json"
MAX_BYTES = 5 * 1024 * 1024
RUN_TIME = datetime.now(UTC)
GOOGLE_NEWS = "https://news.google.com/rss/search?q=site:{}&hl=en-US&gl=US&ceid=US:en"


def fetch(url):
    request = Request(url, headers={
        "User-Agent": "DailyBrief RSS reader (+https://alexsue.com/home/)",
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    })
    with urlopen(request, timeout=12) as response:
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("feed is too large")
        return data, response.geturl()


def tag(element):
    return element.tag.rsplit("}", 1)[-1]


def parts(element, names):
    return (child for child in element if tag(child) in names)


def field(element, *names):
    for name in names:
        for child in parts(element, {name}):
            value = "".join(child.itertext()).strip()
            if value:
                return value
    return ""


def web_url(value, base):
    url = urljoin(base, value)
    parsed = urlsplit(url)
    if value and parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password:
        return url
    return None


def article_url(item, base):
    for link in parts(item, {"link"}):
        if link.get("rel", "alternate") == "alternate":
            value = web_url(link.get("href") or "".join(link.itertext()).strip(), base)
            if value:
                return value
    return None


def normalize_date(value):
    if not value:
        return None
    try:
        date = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            date = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
    if date.tzinfo is None:
        date = date.replace(tzinfo=UTC)
    return date.astimezone(UTC).isoformat()


class ComicImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []

    def handle_starttag(self, name, attrs):
        values = dict(attrs)
        if name == "img":
            self.images.append(values.get("data-src") or values.get("src"))
        if name == "meta" and values.get("property") == "og:image":
            self.images.append(values.get("content"))


def pick_comic_image(values, base):
    candidates = []
    for value in values:
        if not value:
            continue
        url = web_url(value, base)
        if not url:
            continue
        parsed = urlsplit(url)
        filename = parsed.path.rsplit("/", 1)[-1].lower()
        if parsed.scheme == "https" and filename.endswith((".png", ".jpg", ".jpeg", ".gif", ".webp")):
            if not any(word in filename for word in ("logo", "avatar", "banner", "icon", "gravatar")):
                candidates.append(url)
    return next((url for url in candidates if "foxtrot" in url.lower()), candidates[0] if candidates else None)


def comic_image(item, base):
    images = ComicImages()
    images.feed(field(item, "encoded", "content", "description", "summary"))
    for element in item.iter():
        if tag(element) in {"content", "thumbnail", "enclosure"}:
            images.images.append(element.get("url"))
    return pick_comic_image(images.images, base)


def parse_feed(data, base, source):
    # Feed fragments have no need for entity declarations or external DTDs.
    if re.search(br"<!\s*(?:DOCTYPE|ENTITY)\b", data, re.I):
        raise ValueError("unexpected XML declaration")
    root = ElementTree.fromstring(data)
    if tag(root) not in {"rss", "feed", "RDF"}:
        raise ValueError("response is not RSS or Atom")
    google = urlsplit(base).hostname == "news.google.com"
    items = []
    seen = set()
    for element in root.iter():
        if tag(element) not in {"item", "entry"}:
            continue
        url = article_url(element, base)
        title = " ".join(unescape(field(element, "title")).split())
        publisher = field(element, "source") if google else ""
        if publisher:
            title = title.removesuffix(f" - {publisher}")
        if not title or not url or url in seen:
            continue
        seen.add(url)
        date = normalize_date(field(element, "pubDate", "published", "updated", "date"))
        item = {"title": title[:400], "url": url, "date": date}
        if source["id"] == "foxtrot":
            item["image"] = comic_image(element, url)
        items.append(item)
    items.sort(key=lambda item: item["date"] or "", reverse=True)
    return items[:10]


def refresh_source(source, previous):
    urls = source["feeds"][:]
    if source.get("googleNews"):
        urls.append(GOOGLE_NEWS.format(source["googleNews"]))
    for url in urls:
        try:
            data, base = fetch(url)
            items = parse_feed(data, base, source)
            if not items:
                raise ValueError("no headlines")
            newest = items[0]["date"]
            if source["id"] != "foxtrot" and newest and datetime.fromisoformat(newest) < RUN_TIME - timedelta(days=14):
                raise ValueError("latest headline is over two weeks old")
            if source["id"] == "foxtrot" and not items[0]["image"]:
                try:
                    page, article = fetch(items[0]["url"])
                    images = ComicImages()
                    images.feed(page.decode("utf-8", errors="replace"))
                    items[0]["image"] = pick_comic_image(images.images, article)
                except (OSError, ValueError):
                    pass
            via = "Google News" if urlsplit(base).hostname == "news.google.com" else None
            print(f"{source['name']}: {len(items)} items" + (f" via {via}" if via else ""), flush=True)
            return source["id"], {"items": items, "via": via, "updatedAt": RUN_TIME.isoformat(), "stale": False}
        except (OSError, ValueError, ElementTree.ParseError) as error:
            print(f"{source['name']} ({url}): {error}", file=sys.stderr, flush=True)
    return source["id"], {**previous.get(source["id"], {"items": []}), "stale": True}


def main():
    sources = json.loads((ROOT / "src/home/sources.json").read_text())
    try:
        previous = json.loads(OUTPUT.read_text()).get("feeds", {})
    except (OSError, ValueError):
        previous = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        feeds = dict(pool.map(lambda source: refresh_source(source, previous), sources))
    snapshots = [feed["updatedAt"] for feed in feeds.values() if feed.get("updatedAt")]
    if not snapshots:
        raise SystemExit("No feeds could be refreshed and there is no previous snapshot.")
    snapshot = {"generatedAt": max(snapshots), "feeds": feeds}
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    temporary = OUTPUT.with_suffix(".tmp")
    temporary.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n")
    temporary.replace(OUTPUT)


if __name__ == "__main__":
    main()
