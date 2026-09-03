# Live status pipeline

The phone pushes a health sample to a Lambda; the Lambda folds it into a
running baseline and writes one JSON object to S3; the site polls that object
hourly. There is no history and no database — the object carries its own
accumulator forward under `_baseline`.

```
iOS Shortcut ──POST──> Lambda Function URL ──PutObject──> S3 status.json
                                                              │
                                          alexsue.com ──GET───┘  (hourly)
```

## Deploy

```sh
./infra/deploy.sh
```

Creates the bucket, the public-read policy scoped to `status.json` alone, the
CORS rule, the execution role, the function, and its Function URL. Re-running
updates in place and preserves the push token. It prints the endpoint, the
token, and the public URL when it finishes.

Then set `VITE_STATUS_URL` as a **repository variable** (Settings → Secrets and
variables → Actions → Variables) to the printed S3 URL, and redeploy the site.
Without it the live rows are simply absent — the section falls back to the
hand-written rows.

## Push contract

`POST` to the Function URL with `Authorization: Bearer <token>`. Every field is
optional; whatever is omitted carries forward from the previous object.

```json
{
  "steps": 6412,
  "restingHeartRate": 62,
  "workout": { "type": "Outdoor Run", "minutes": 32, "endedAt": "2026-09-02T17:00:00Z" }
}
```

Values outside these bounds are discarded rather than stored:

| Field | Accepted range |
|---|---|
| `steps` | 0 – 100,000 |
| `restingHeartRate` | 30 – 120 |
| `workout.minutes` | 0 – 1,440 |

## How the baseline works

`_baseline` holds an exponentially weighted moving average with a 14-day
half-life, folded **once per completed day** — never on a mid-day push, since
steps accumulate through the day and folding a partial total would drag the
average down. Percentages stay hidden until the baseline has 7 days behind it.

Tune via Lambda environment variables: `EWMA_HALF_LIFE_DAYS`,
`MIN_BASELINE_DAYS`, `LOCAL_TZ` (day boundaries), `MAX_AGE_SECONDS` (browser
cache lifetime on the object).

If a bad sample ever gets through and skews the baseline, fix it by hand — the
object is the database:

```sh
aws s3 cp s3://<bucket>/status.json - | jq '._baseline.stepsAvg = 10500' > fixed.json
aws s3 cp fixed.json s3://<bucket>/status.json \
  --content-type application/json --cache-control max-age=300
```

## The phone side

**iOS time-of-day automations fire once per day, not hourly.** For a handful of
pushes a day, create three personal automations in Shortcuts (say 09:00, 15:00,
21:00), each: *Find Health Samples* → *Get Contents of URL* (POST, JSON body,
`Authorization` header). Turn off "Ask Before Running".

For genuine hourly granularity, an app like Health Auto Export can do scheduled
REST pushes on an interval; point it at the same endpoint with the same header.

## Tests

The fold, merge, clamping and timezone logic live in `lambda/status.mjs` with
no AWS dependency:

```sh
node --test infra/lambda/status.test.mjs
```

`index.mjs` is only the I/O shell around it, and imports the AWS SDK bundled
into the Lambda Node runtime — nothing to `npm install`, the zip is two files.

## Cost and exposure

Roughly free: a few Lambda invocations a day against a 1M/month free tier, and
S3 GETs at $0.0004/1000. Reserved concurrency is set to 2, which caps the bill
if anyone finds the URL and also serialises the read-modify-write so two pushes
cannot clobber each other.

The Function URL is `NONE` auth — public, guarded by the bearer token compared
in constant time. The S3 object is world-readable by design; treat everything
in it, `_baseline` included, as published.
