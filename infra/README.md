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

## Teardown

```sh
./infra/teardown.sh          # prompts for the bucket name
./infra/teardown.sh --yes    # no prompt
```

Removes the function (its URL, resource policy and reserved concurrency go
with it), the role and its policies, the bucket and its contents, and the
CloudWatch log group — which Lambda creates implicitly and does *not* delete
along with the function, so it is the one thing that would otherwise linger.

Nothing here has a retention lock or a slow disable-then-delete cycle, so the
whole thing goes in one pass. Safe against a partial deploy: each step skips
what is already gone.

Two things live outside AWS and must be undone by hand: the `VITE_STATUS_URL`
repository variable, and the push token stored in the Shortcut on your phone.

**The baseline is destroyed with the bucket** and cannot be rebuilt, since the
pipeline keeps no history. If you plan to redeploy, save it first:

```sh
aws s3 cp s3://<bucket>/status.json ./status-backup.json
```

## Function URL permissions

A public function URL needs **two** resource-policy statements, not one:
`lambda:InvokeFunctionUrl`, and `lambda:InvokeFunction` conditioned on
`lambda:InvokedViaFunctionUrl`. This became a requirement in October 2025. The
console and SAM add both for you; over the CLI they are separate calls.

With only the first, every request — even one with no auth header at all —
returns a blanket `403 Forbidden` from Lambda's own auth layer and never
reaches the handler, so nothing appears in CloudWatch. `deploy.sh` applies
both statements on every run, so a half-configured function repairs itself.

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

Retrieve the push token first — it is stored only in the Lambda's environment:

```sh
aws lambda get-function-configuration --function-name alexsue-status-push \
  --query 'Environment.Variables.PUSH_TOKEN' --output text
```

There is no HealthKit credential. HealthKit has no server API and no key;
authorization is the on-device permission sheet, which iOS shows the first
time the shortcut runs. The push token is the only secret involved.

### Shortcut 1: steps and resting heart rate

Build this in the Shortcuts app (not as an automation yet, so it can be tested
by hand). Actions in order:

1. **Find All Health Samples Where** — Type `Steps`, Filter `Start Date`
   `is today`. **No limit** — a limit of 1 returns only the most recent
   sample, which is a handful of steps rather than the day's total.
2. **Combine Text** — separator `;`. The samples must reach the endpoint on a
   single line: a JSON string cannot contain raw newlines, so pasting a
   multi-line list into the body produces a 400. The total is calculated
   server-side, so no `Calculate Statistics` action is needed.
3. **Find All Health Samples Where** — Type `Resting Heart Rate`, Sort by
   `Start Date`, Order `Latest First`, Limit `1`. Here a limit of 1 is correct:
   it is a point-in-time reading, not something to accumulate.
4. **Text** — the request body, inserting the two variables:
   ```
   {"steps":"[Combined Text]","restingHeartRate":"[Value]"}
   ```
   Quoting these as strings is deliberate. Shortcuts sends values as text, and
   the endpoint coerces them, so quoted numbers are accepted; `steps` may be a
   single number, a `;`-separated list, a newline-separated list, or a JSON
   array, and is totalled on arrival.
5. **Get Contents of URL** — the function URL, Method `POST`, Request Body
   `File` with the Text from step 4 as input. Headers:

   | Key | Value |
   |---|---|
   | `Authorization` | `Bearer <token>` |
   | `Content-Type` | `application/json` |

Run it once from the Shortcuts app. iOS prompts for Health access on first
run — grant Steps and Resting Heart Rate. A successful run returns the stored
object; add a **Quick Look** action at the end while testing to see it.

### Shortcut 2: adding the workout

Workouts are optional in the payload, and the Lambda carries the last one
forward until it ages out after 72 hours — so this can be added once the
basic push works.

Insert before the Text action:

1. **Find Workouts** — Sort by `End Date`, Order `Latest First`, Limit `1`.
2. **Format Date** on its `End Date` — format `ISO 8601`.
3. **Calculate** — its `Duration` ÷ `60`, then **Round** to `0` decimal places.
   Shortcuts reports duration in seconds; the API wants minutes.

Then wrap the Text action in an **If** on whether Find Workouts returned
anything, with a second Text action for the no-workout case — otherwise an
empty result produces malformed JSON:

```
{"steps":[Statistics],"restingHeartRate":[Value],"workout":{"type":"[Type]","minutes":[Rounded],"endedAt":"[Formatted Date]"}}
```

Note which values are quoted: `type` and `endedAt` are strings, `minutes` is a
bare number.

### Turning it into an automation

**iOS time-of-day automations fire once per day, not hourly.** For a few
pushes a day, create one personal automation per time slot (Automation tab →
`+` → Time of Day), each running the shortcut. Three — morning, afternoon,
evening — is plenty; steps accumulate and the evening push is the one that
sets the day's final total for the baseline fold.

Turn **Run Immediately** on and **Notify When Run** off, or every push
produces a banner.

For genuine hourly granularity, an app like Health Auto Export can push to a
REST endpoint on an interval; point it at the same URL with the same header.

### If a push does not land

```sh
aws logs tail /aws/lambda/alexsue-status-push --since 15m --format short
```

- **401** — token mismatch; check for a missing `Bearer ` prefix or a trailing
  space in the header value.
- **No log entry at all** — the request never reached the function. See the
  function URL permissions section above.
- **200 but the site is unchanged** — the object updated, but the page only
  polls hourly and ignores anything older than three hours. Reload it.

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
