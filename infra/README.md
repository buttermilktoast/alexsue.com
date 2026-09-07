# Live status pipeline

The phone pushes a health sample to a Lambda; the Lambda folds it into a
running baseline and writes one JSON object to S3; the site polls that object
every fifteen minutes. There is no history and no database — the object
carries its own accumulator forward under `_baseline`.

```
iOS Shortcut ──POST──> Lambda Function URL ──PutObject──> S3 status.json
                                                              │
                                          alexsue.com ──GET───┘  (every 15 min)
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
  "stepsBySource": { "phone": "318;294", "watch": "401;259" },
  "heartRate": 62,
  "workout": { "type": "Outdoor Run", "minutes": 32, "endedAt": "2026-09-02T17:00:00Z" }
}
```

`stepsBySource` holds one raw sample list per source. Each is totalled and the
**largest total wins** — never the sum, which double-counts a walk the phone
and the watch both recorded. A source that is empty or unparseable drops out
rather than voiding the push, so a day with the watch on the charger reads the
phone's count instead of zero. `stepsLast24hBySource` and
`stepsYesterdayBySource` work identically for the baseline inputs.

The flat `steps`, `stepsLast24h` and `stepsYesterday` fields still work and are
read as a single source. `restingHeartRate` is accepted as an alias for
`heartRate`.

Values outside these bounds are discarded rather than stored:

| Field | Accepted range |
|---|---|
| `steps` (each source) | 0 – 100,000 |
| `heartRate` | 30 – 220 |
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

### Shortcut 1: alexsue.com Dashboard

Use [the shortcut installation guide](../shortcuts/README.md). Push v9
preserves the user's tested preview and replaces only its final display with
the upload action. It sends today's separate phone/watch values and latest
Heart Rate. The endpoint selects the larger device total, an approximation
rather than Apple Health's merged total.

```sh
python3 shortcuts/build.py \
  --from-shortcut '/path/to/Send Health Data.shortcut' \
  --from-preview '/path/to/Dashboard Preview v8.shortcut'
```

The working watch name is `alex’s Apple Watch` with a curly apostrophe; the
straight-apostrophe name previously returned no data. Source picker values
must use `Values.Enumeration`. v6 used `Values.String`, which iOS ignored.
Do not activate Push v6 or v8. Validate alexsue.com Dashboard on the phone, then retarget
existing personal automations. Importing does not update automations.

Signed exports can be decoded using `shortcuts/read_shortcut.py` without
running them. Generated files embed the push token and remain git-ignored.

### Optional: a better baseline

The baseline prefers a rolling 24-hour total over inferring the day from the
last push, because HealthKit cannot be read while the device is locked and a
late-night automation frequently never runs at all. To supply one, add separate phone/watch queries with the date filter set to `is within the last 1 day`, into
variables `phone24h` and `watch24h`, and extend the body:

```
{"stepsBySource":{"phone":"[phoneToday]","watch":"[watchToday]"},"stepsLast24hBySource":{"phone":"[phone24h]","watch":"[watch24h]"},"heartRate":"[heart]"}
```

This uses the same larger-source approximation. It prevents adding both
devices together, but does not repair already-inflated baseline history.

### Shortcut 2: adding the workout

Workouts are optional in the payload, and the Lambda carries the last one
forward until it ages out after 72 hours — so this can be added once the
basic push works.

This requires a workout-reading action supplied by another app; the earlier
instructions incorrectly described **Find Workouts** as a built-in action.
Apple documents [Apple Watch workout start/end triggers](https://support.apple.com/guide/shortcuts/event-triggers-apd932ff833f/ios),
which launch automations but do not establish access to completed workout records.
The free [Actions app](https://sindresorhus.com/actions) provides an iOS-only
**Find Workout** action that returns workout type, duration, and other details.

If you use that app, inspect one returned workout with **Quick Look** first.
Map its type to `type`, its end date formatted as ISO 8601 to `endedAt`, and its
duration converted to whole minutes to `minutes`. Check the duration's unit in
the action output before converting it. This optional route has not been tested
on a device here.

Only include the `workout` object when a workout was returned; otherwise send
the ordinary steps/heart-rate payload:

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

For hourly updates, use 24 daily Time of Day automations, one at each hour
from 00:00 through 23:00, running alexsue.com Dashboard. The generated
`alexsue.com Dashboard.shortcut` embeds those 24 triggers while preserving
v9's actions; importing and activating the triggers still needs on-device
verification. See [hourly installation and verification](../shortcuts/README.md#hourly-variant).

### If a push does not land

```sh
aws logs tail /aws/lambda/alexsue-status-push --since 15m --format short
```

- **401** — token mismatch; check for a missing `Bearer ` prefix or a trailing
  space in the header value.
- **No log entry at all** — the request never reached the function. See the
  function URL permissions section above.
- **200 but the site is unchanged** — the object updated, but the page only
  polls every fifteen minutes and ignores anything older than three hours.
  Reload it.

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
