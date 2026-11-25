# Home page headlines

`alexsue.com/home/` reads one public JSON object, refreshed every 30 minutes by
a scheduled Lambda. The object is both what the page reads and the store: each
run reads the last snapshot back, so a publisher that fails keeps its previous
headlines (marked stale) instead of vanishing. No database, no history.

```
EventBridge Scheduler ──every 30 min──> Lambda ──PutObject──> S3 feeds.json
                                                                   │
                                     alexsue.com/home/ ──GET───────┘
```

This replaced a GitHub Actions cron, which GitHub ran only two or three times
a day against an hourly schedule.

## Files

- `home_feeds.py` — fetching and parsing (standard library only, so the zip has
  no dependencies). `collect(sources, previous, now)` returns the snapshot.
- `handler.py` — the Lambda shell: read the previous snapshot from S3, collect,
  write it back with a 60-second `Cache-Control`, log a one-line summary.
- `scripts/update-home-feeds.py` runs the same code against
  `public/home/feeds.json` for local development; the page falls back to that
  file when `VITE_FEEDS_URL` is unset.

## Deploy

```sh
./infra/feeds/deploy.sh
gh variable set VITE_FEEDS_URL --body 'https://alexsue-home-feeds.s3.us-east-1.amazonaws.com/feeds.json'
```

Creates or updates the bucket (public read on `feeds.json` only, CORS for the
site and localhost), the function and its role, a 30-day log group, and the
schedule with its own role. **Re-run it after editing `src/home/sources.json`**:
the source list is packaged into the function, so the site and the Lambda
otherwise disagree about which sources exist.

The function runs one at a time (reserved concurrency 1) and a failed run is
not retried — the next one is never more than 30 minutes away.

## Google News fallback

A source with `googleNews` set falls back to a Google News search of that site
when its own feeds fail (CNN has no usable feed and always comes this way).
The snapshot marks those with `via: "Google News"` and the card shows
"· via Google News" beside the category. Their links go through
news.google.com, and they have no thumbnails.

## Checking on it

```sh
aws lambda invoke --function-name alexsue-home-feeds --log-type Tail \
  --query LogResult --output text /dev/null | base64 --decode   # run now
aws logs tail /aws/lambda/alexsue-home-feeds --since 2h          # recent runs
```

Each run ends with a JSON line listing `stale` and `viaGoogleNews` sources.

## Tests and teardown

```sh
python3 -m unittest discover -s infra/feeds
./infra/feeds/teardown.sh        # prompts for the bucket name; --yes skips
```

Cost: 48 runs a day of about 5 seconds at 512 MB stays inside the Lambda and
Scheduler free tiers; S3 serves one ~60 KB object.
