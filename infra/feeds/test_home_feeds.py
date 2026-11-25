"""python3 -m unittest discover -s infra/feeds"""

from datetime import UTC, datetime
import json
import unittest
from unittest import mock

import handler
import home_feeds

NOW = datetime(2026, 11, 24, 12, tzinfo=UTC)

RSS = b"""<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Newer story</title><link>https://example.com/b</link><pubDate>Tue, 24 Nov 2026 10:00:00 GMT</pubDate></item>
  <item><title>Older story</title><link>https://example.com/a</link><pubDate>Mon, 23 Nov 2026 10:00:00 GMT</pubDate></item>
</channel></rss>"""

GOOGLE = b"""<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item><title>Big story - CNN</title><link>https://news.google.com/rss/articles/x</link>
    <pubDate>Tue, 24 Nov 2026 11:00:00 GMT</pubDate><source url="https://www.cnn.com">CNN</source></item>
</channel></rss>"""

SITE = {"id": "site", "name": "Site", "site": "https://example.com/", "feeds": ["https://example.com/feed"]}
CNN = {"id": "cnn", "name": "CNN", "site": "https://www.cnn.com/", "feeds": [], "googleNews": "cnn.com"}


def serve(responses):
    def fetch(url):
        for prefix, body in responses.items():
            if url.startswith(prefix):
                return body, url
        raise OSError(f"unreachable: {url}")
    return fetch


class Collect(unittest.TestCase):
    def setUp(self):
        patches = [mock.patch.object(home_feeds, "add_publisher_thumbnails", lambda *args: None)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    def test_fresh_and_google_news_sources(self):
        fetch = serve({"https://example.com/": RSS, "https://news.google.com/": GOOGLE})
        with mock.patch.object(home_feeds, "fetch", fetch):
            snapshot = home_feeds.collect([SITE, CNN], {}, NOW)
        site, cnn = snapshot["feeds"]["site"], snapshot["feeds"]["cnn"]
        self.assertEqual([item["title"] for item in site["items"]], ["Newer story", "Older story"])
        self.assertIsNone(site["via"])
        self.assertEqual(cnn["via"], "Google News")
        self.assertEqual(cnn["items"][0]["title"], "Big story")
        self.assertEqual(snapshot["generatedAt"], NOW.isoformat())

    def test_failed_source_keeps_previous_items_marked_stale(self):
        earlier = {"generatedAt": "2026-11-24T09:00:00+00:00", "feeds": {
            "site": {"items": [{"title": "Kept", "url": "https://example.com/k", "date": None}],
                     "via": None, "updatedAt": "2026-11-24T09:00:00+00:00", "stale": False}}}
        with mock.patch.object(home_feeds, "fetch", serve({})):
            snapshot = home_feeds.collect([SITE], earlier, NOW)
        self.assertTrue(snapshot["feeds"]["site"]["stale"])
        self.assertEqual(snapshot["feeds"]["site"]["items"][0]["title"], "Kept")
        # Nothing new arrived, so the page should read the collection as delayed.
        self.assertEqual(snapshot["generatedAt"], "2026-11-24T09:00:00+00:00")

    def test_nothing_refreshed_and_nothing_earlier(self):
        with mock.patch.object(home_feeds, "fetch", serve({})):
            with self.assertRaises(home_feeds.NoFeeds):
                home_feeds.collect([SITE], {}, NOW)

    def test_age_check_uses_the_call_time(self):
        later = datetime(2027, 1, 1, tzinfo=UTC)
        with mock.patch.object(home_feeds, "fetch", serve({"https://example.com/": RSS})):
            with self.assertRaises(home_feeds.NoFeeds):
                home_feeds.collect([SITE], {}, later)


class MissingKey(Exception):
    response = {"Error": {"Code": "NoSuchKey"}}


class FakeS3:
    def __init__(self, stored=None):
        self.stored = stored
        self.put = None

    def get_object(self, Bucket, Key):
        if self.stored is None:
            raise MissingKey()
        return {"Body": mock.Mock(read=lambda: self.stored)}

    def put_object(self, **kwargs):
        self.put = kwargs


class Run(unittest.TestCase):
    def setUp(self):
        patch = mock.patch.object(home_feeds, "add_publisher_thumbnails", lambda *args: None)
        patch.start()
        self.addCleanup(patch.stop)

    def test_first_run_into_an_empty_bucket(self):
        s3 = FakeS3()
        fetch = serve({"https://example.com/": RSS, "https://news.google.com/": GOOGLE})
        with mock.patch.object(home_feeds, "fetch", fetch), mock.patch("builtins.print"):
            summary = handler.run(s3, "bucket", "feeds.json", [SITE, CNN], NOW)
        self.assertEqual(summary["viaGoogleNews"], ["cnn"])
        self.assertEqual(summary["stale"], [])
        self.assertEqual(s3.put["ContentType"], "application/json; charset=utf-8")
        self.assertEqual(s3.put["CacheControl"], handler.CACHE_CONTROL)
        self.assertIn("site", json.loads(s3.put["Body"])["feeds"])

    def test_carries_the_stored_snapshot_forward(self):
        stored = json.dumps({"feeds": {"site": {"items": [{"title": "Kept", "url": "https://example.com/k"}],
                                                 "updatedAt": "2026-11-24T09:00:00+00:00"}}}).encode()
        s3 = FakeS3(stored)
        with mock.patch.object(home_feeds, "fetch", serve({})), mock.patch("builtins.print"):
            summary = handler.run(s3, "bucket", "feeds.json", [SITE], NOW)
        self.assertEqual(summary["stale"], ["site"])

    def test_other_s3_errors_are_not_swallowed(self):
        class Denied(Exception):
            response = {"Error": {"Code": "AccessDenied"}}
        s3 = FakeS3()
        s3.get_object = mock.Mock(side_effect=Denied())
        with self.assertRaises(Denied):
            handler.run(s3, "bucket", "feeds.json", [SITE], NOW)


if __name__ == "__main__":
    unittest.main()
