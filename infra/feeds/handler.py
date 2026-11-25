"""Scheduled Lambda: refresh the /home/ headlines and publish them to S3.

EventBridge Scheduler invokes this every 30 minutes. The S3 object is both what
the page reads and the store: the previous snapshot is read back so a source
that fails this time keeps its last headlines (marked stale) instead of
disappearing. No database, no history.
"""

import json
import os
from pathlib import Path

from home_feeds import collect

SOURCES_FILE = Path(__file__).with_name("sources.json")
CACHE_CONTROL = "public, max-age=60"


def read_previous(client, bucket, key):
    try:
        body = client.get_object(Bucket=bucket, Key=key)["Body"].read()
    except Exception as error:
        # botocore's ClientError, matched by shape so tests need no boto3.
        code = getattr(error, "response", {}).get("Error", {}).get("Code")
        if code in {"NoSuchKey", "404"}:
            return {}
        raise
    try:
        return json.loads(body)
    except ValueError:
        print(json.dumps({"warning": "previous snapshot unreadable, starting fresh"}))
        return {}


def run(client, bucket, key, sources, now=None):
    previous = read_previous(client, bucket, key)
    snapshot = collect(sources, previous, now)
    client.put_object(
        Bucket=bucket,
        Key=key,
        Body=(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")) + "\n").encode(),
        ContentType="application/json; charset=utf-8",
        CacheControl=CACHE_CONTROL,
    )
    feeds = snapshot["feeds"]
    summary = {
        "generatedAt": snapshot["generatedAt"],
        "sources": len(feeds),
        "stale": sorted(id for id, feed in feeds.items() if feed.get("stale")),
        "viaGoogleNews": sorted(id for id, feed in feeds.items() if feed.get("via") == "Google News"),
    }
    print(json.dumps(summary))
    return summary


def handler(event, context):
    import boto3  # provided by the Lambda runtime

    sources = json.loads(SOURCES_FILE.read_text())
    return run(boto3.client("s3"), os.environ["BUCKET"], os.environ.get("OBJECT_KEY", "feeds.json"), sources)
