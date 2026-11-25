"""Fetch the public feeds for /home/ and keep the last usable snapshot per source.

Shared by the scheduled Lambda (handler.py, which keeps the snapshot in S3) and
scripts/update-home-feeds.py (which writes public/home/feeds.json for local
development). Standard library only, so the Lambda zip needs no dependencies.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
import json
import re
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen
from xml.etree import ElementTree

MAX_BYTES = 5 * 1024 * 1024
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
    if not value or not value.strip():
        return None
    try:
        url = urljoin(base, value.strip())
        parsed = urlsplit(url)
    except ValueError:
        return None
    if parsed.scheme in {"http", "https"} and parsed.hostname and not parsed.username and not parsed.password:
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


class FeedImages(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.previews = []

    def handle_starttag(self, name, attrs):
        values = dict(attrs)
        if name == "img" and "1" not in (values.get("width"), values.get("height")):
            self.images.append(values.get("data-src") or values.get("data-lazy-src") or values.get("src"))
        if name == "meta" and (values.get("property") or values.get("name")) in {
            "og:image", "og:image:secure_url", "twitter:image"
        }:
            self.previews.append(values.get("content"))


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
    images = FeedImages()
    images.feed(field(item, "encoded", "content", "description", "summary"))
    for element in item.iter():
        if tag(element) in {"content", "thumbnail", "enclosure"}:
            images.images.append(element.get("url"))
    return pick_comic_image(images.images + images.previews, base)


def thumbnail_url(value, base):
    url = web_url(value, base)
    if not url or not url.startswith("https:"):
        return None
    path = urlsplit(url).path.lower()
    if any(part in path for part in ("gravatar", "spacer.", "pixel.", "placeholder.", "favicon.")):
        return None
    return url


def story_thumbnail(item, base):
    thumbnails = []
    images = []
    for element in item.iter():
        if "1" in (element.get("width"), element.get("height")):
            continue
        kind = tag(element)
        mime_type = element.get("type", "").lower()
        if kind == "thumbnail":
            thumbnails.append(element.get("url"))
        elif kind in {"content", "enclosure", "link"}:
            value = element.get("url") or element.get("href") or ""
            if (
                mime_type.startswith("image/")
                or element.get("medium") == "image"
                or (not mime_type and re.search(r"\.(jpe?g|png|webp|avif|gif)(?:[?#]|$)", value, re.I))
            ):
                images.append(value)
        elif kind == "img":
            images.append(element.get("data-src") or element.get("src"))
        elif kind == "image":
            images.append(element.get("url") or field(element, "url"))
    for attr in ("description", "summary", "encoded", "content"):
        html = FeedImages()
        html.feed(field(item, attr))
        images.extend(html.images)
    for value in thumbnails + images:
        url = thumbnail_url(value, base)
        if url:
            return url
    return None


class StayOnPublisher(HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        return None


def add_publisher_thumbnails(items, source, previous):
    publisher = urlsplit(source["site"]).hostname.removeprefix("www.")
    cached = {item["url"]: item["thumbnail"] for item in previous.get("items", []) if item.get("thumbnail")}
    opener = build_opener(StayOnPublisher())
    for item in items:
        if item.get("thumbnail"):
            continue
        url = item["url"]
        if url in cached:
            item["thumbnail"] = cached[url]
            continue
        article = urlsplit(url)
        hostname = article.hostname
        if article.scheme != "https" or not (hostname == publisher or hostname.endswith(f".{publisher}")):
            continue
        try:
            if article.port not in (None, 443):
                continue
            request = Request(url, headers={"User-Agent": "DailyBrief RSS reader (+https://alexsue.com/home/)"})
            with opener.open(request, timeout=4) as response:
                if response.headers.get_content_type() != "text/html":
                    continue
                head = response.read(192 * 1024).decode("utf-8", errors="replace")
            images = FeedImages()
            images.feed(re.split(r"</head\s*>", head, maxsplit=1, flags=re.I)[0])
            for candidate in images.previews:
                thumbnail = thumbnail_url(candidate, url)
                if thumbnail:
                    item["thumbnail"] = thumbnail
                    break
        except (OSError, ValueError):
            # A preview failure should never hide a headline.
            continue


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
        else:
            thumbnail = story_thumbnail(element, url)
            if thumbnail:
                item["thumbnail"] = thumbnail
        items.append(item)
    items.sort(key=lambda item: item["date"] or "", reverse=True)
    return items[:10]


def refresh_source(source, previous, now):
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
            if source["id"] != "foxtrot" and newest and datetime.fromisoformat(newest) < now - timedelta(days=14):
                raise ValueError("latest headline is over two weeks old")
            if source["id"] == "foxtrot" and not items[0]["image"]:
                try:
                    page, article = fetch(items[0]["url"])
                    images = FeedImages()
                    images.feed(page.decode("utf-8", errors="replace"))
                    items[0]["image"] = pick_comic_image(images.images + images.previews, article)
                except (OSError, ValueError):
                    pass
            via = "Google News" if urlsplit(base).hostname == "news.google.com" else None
            if not via and source["id"] not in {"foxtrot", "hackernews"}:
                add_publisher_thumbnails(items, source, previous.get(source["id"], {}))
            thumbnails = sum(bool(item.get("thumbnail")) for item in items)
            details = f" ({thumbnails} with thumbnails)" if source["id"] != "foxtrot" else ""
            print(f"{source['name']}: {len(items)} items{details}" + (f" via {via}" if via else ""), flush=True)
            return source["id"], {"items": items, "via": via, "updatedAt": now.isoformat(), "stale": False}
        except (OSError, ValueError, ElementTree.ParseError) as error:
            print(f"{source['name']} ({url}): {error}", file=sys.stderr, flush=True)
    return source["id"], {**previous.get(source["id"], {"items": []}), "stale": True}


class NoFeeds(RuntimeError):
    """Nothing could be refreshed and there is no earlier snapshot to fall back on."""


def collect(sources, previous_snapshot=None, now=None):
    """Refresh every source; a source that fails keeps its last items, marked stale.

    `now` is taken per call, never at import: a warm Lambda container reuses
    the module, and a frozen clock would date every later run to the first one.
    """
    now = now or datetime.now(UTC)
    previous = previous_snapshot.get("feeds") if isinstance(previous_snapshot, dict) else None
    previous = previous if isinstance(previous, dict) else {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        feeds = dict(pool.map(lambda source: refresh_source(source, previous, now), sources))
    snapshots = [feed["updatedAt"] for feed in feeds.values() if feed.get("updatedAt")]
    if not snapshots:
        raise NoFeeds("No feeds could be refreshed and there is no previous snapshot.")
    return {"generatedAt": max(snapshots), "feeds": feeds}
