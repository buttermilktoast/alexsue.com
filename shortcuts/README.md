# alexsue.com Dashboard

## Build from the committed template

`dashboard.template.json` contains the verified actions and hourly schedule,
with `Bearer {TOKEN}` in place of the credential and `{ENDPOINT}` in place of
the Function URL. This file, the scripts, and `.env.example` can be committed.
The installable `.shortcut` files and the real `.env` remain git-ignored
because they contain the token.

On a new checkout, copy `.env.example` to `.env` and fill in both settings.
`infra/deploy.sh` prints them as `Push token` and `Push endpoint`. The URL is
not a credential, but this repo is public and the address is kept out of it.
Then run on macOS:

```sh
python3 shortcuts/build.py
```

This produces `shortcuts/alexsue.com Dashboard.shortcut` with the credential
inserted and the signature, actions, and schedule verified. The current
local `.env` has already been populated from the working shortcut.
An exported `PUSH_TOKEN` or `PUSH_ENDPOINT` overrides `.env`, and `--endpoint`
overrides both; `--env-file` selects another file.
The loader reads values literally without executing shell code. Never name
this secret `VITE_PUSH_TOKEN`, which would expose it to the website build.

Push v9 is built directly from the user's working exported Preview v8. It
preserves every action except the final Show Result, which is replaced by
Get Contents of URL using the existing endpoint and token. Signing verifies
that all serialized actions survive unchanged.

Only the final signed shortcut is retained; older push, preview, import-check,
and unsigned exports were removed. Build and verification scripts remain.

## Confirmed source selection

The working watch source is `alex’s Apple Watch` (curly apostrophe, U+2019).
The earlier source was `alex's Apple Watch` (straight apostrophe, U+0027).
The selected names look similar but are different strings. The iOS export
stores Source under `Values.Enumeration`, not `Values.String`.

The user observed Phone **1,730** and Watch **1,886** in the working preview.
The server uses the larger of the two totals, so those inputs produce 1,886.
A trailing `;0` does not change a source's total. The earlier Health reading
was 1,924; comparisons should be made at the same time on the phone.

This is an approximation, not deduplication. Two daily totals cannot reveal
which samples overlap. Apple describes HealthKit's statistical queries and
source merging in [Getting started with HealthKit](https://developer.apple.com/videos/play/wwdc2020/10664/).

## Install

1. AirDrop `alexsue.com Dashboard.shortcut` to the iPhone and add it in Shortcuts.
2. Run it unlocked, allowing Steps and Heart Rate read access if requested.
3. Verify the received values in Lambda/S3 before retargeting automations.
4. Update each existing automation's Run Shortcut action to alexsue.com Dashboard. Old
   versions can overwrite the corrected total if their automations still run.

The push returns the server response without a blocking popup. It does not
install or retarget personal automations. No server deployment is needed;
the deployed Lambda's per-source maximum support was verified.

## Hourly variant

v11 corrects v10's :28:34 scheduling error. These time-only dates use year
zero, where Apple's date library applies Honolulu's historical UTC−10:31:26
offset. v10 incorrectly used modern UTC−10. Disable/remove v10's schedule
when installing alexsue.com Dashboard (the verified v11 build). Foundation conversion checks cover all 24 local hours.

`alexsue.com Dashboard.shortcut` preserves the working Push v9 actions
exactly and embeds 24 Time of Day triggers, one at every hour from 00:00
through 23:00, encoded for Pacific/Honolulu. The signed file was
unpacked and checked for exact action and trigger equality after signing.

AirDrop the hourly file to the iPhone and add it in Shortcuts. Inspect its
automations to confirm all 24 times are present and enabled, with **Run
Immediately** selected. Run it once unlocked to confirm Health permissions,
then check that a push arrives at the next hour. Disable older dashboard
automations once the hourly schedule works to avoid duplicate pushes.

Embedded trigger activation has not been verified on the iPhone. Signing
proves the file retains the schedule, not that importing enables it. If the
import does not create the schedule, create 24 daily Time of Day personal
automations at 00:00, 01:00, …, 23:00, each running alexsue.com Dashboard with
Run Immediately. See [Apple's automation setup guide](https://support.apple.com/guide/shortcuts/apdfbdbd7123/ios).

Rebuild while preserving the working push:

```sh
python3 shortcuts/build.py
python3 -m unittest discover -s shortcuts -p 'test_*.py'
```

## Build from the tested preview

```sh
python3 shortcuts/build.py \
  --from-shortcut '/path/to/Send Health Data.shortcut' \
  --from-preview '/path/to/Dashboard Preview v8.shortcut'
python3 -m unittest discover -s shortcuts -p 'test_*.py'
```

`--from-shortcut` reuses credentials without printing them. `--from-preview`
preserves the tested Health queries, variable wiring, and source selections.
Without that option, the generator uses the corrected source defaults.
`--preview` generates a local display version without credentials or HTTP.

## Inspection

```sh
python3 shortcuts/read_shortcut.py '/path/to/export.shortcut'
```

The reader verifies and unpacks signed AEA profile 0 files without executing
the shortcut. Its report redacts HTTP headers, though arbitrary text fields
in other shortcuts may contain private data. Generated signed/unsigned files
are git-ignored and push exports contain the token.

## Earlier failures

- The original Send Health Data concatenated heart rate twice and steps into
  its heart field. Its step query combined all sources.
- v5 omitted date filters and used invalid filter fields.
- Push v6 used an ignored Source String field. Both device queries returned
  3,616 when Health showed 1,924. Do not use Push v6.
- Preview v6 used a bare output attachment in Show Result and displayed blank.
  Preview v7 fixed the display, but retained the source-filter bug.
- Preview v8 fixed the enumeration field. The user then selected the watch
  with the curly apostrophe, which returned 1,886. Generated Push v8 predates
  that exported selection; use alexsue.com Dashboard instead.

Health queries still require on-device validation; structural tests and
signing alone cannot establish their runtime results. Historical baseline
values are not retroactively repaired by changing the shortcut.
