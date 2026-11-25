#!/usr/bin/env bash
# Creates (or updates) the /home/ headline pipeline: an S3 bucket holding one
# public feeds.json, a Lambda that refreshes it, and an EventBridge Scheduler
# schedule that runs the Lambda every 30 minutes.
#
# Safe to re-run: every step either creates the resource or updates it in
# place. Re-run it after editing src/home/sources.json -- the source list is
# packaged into the function.

set -euo pipefail

REGION="${REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${BUCKET:-alexsue-home-feeds}"
KEY="${OBJECT_KEY:-feeds.json}"
FUNCTION="${FUNCTION:-alexsue-home-feeds}"
ROLE="${ROLE:-${FUNCTION}-role}"
SCHEDULE="${SCHEDULE:-${FUNCTION}}"
SCHEDULER_ROLE="${SCHEDULER_ROLE:-${FUNCTION}-scheduler-role}"
RATE="${RATE:-rate(30 minutes)}"
RUNTIME="${RUNTIME:-python3.14}"
LOG_GROUP="/aws/lambda/${FUNCTION}"
ORIGINS='["https://alexsue.com","https://www.alexsue.com","http://localhost:5173","http://localhost:4173"]'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

say() { printf '\n== %s\n' "$1"; }

say "Bucket: s3://${BUCKET} (${REGION})"
if ! aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  if [ "$REGION" = "us-east-1" ]; then
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" >/dev/null
  else
    aws s3api create-bucket --bucket "$BUCKET" --region "$REGION" \
      --create-bucket-configuration "LocationConstraint=${REGION}" >/dev/null
  fi
  echo "created"
else
  echo "already exists"
fi

# ACLs stay blocked; the object is made readable by bucket policy only.
aws s3api put-public-access-block --bucket "$BUCKET" \
  --public-access-block-configuration \
  "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=false,RestrictPublicBuckets=false" \
  >/dev/null

say "Public read on ${KEY} only"
cat > "$work/bucket-policy.json" <<POLICY
{
  "Version": "2012-10-17",
  "Statement": [{
    "Sid": "PublicReadFeedsObject",
    "Effect": "Allow",
    "Principal": "*",
    "Action": "s3:GetObject",
    "Resource": "arn:aws:s3:::${BUCKET}/${KEY}"
  }]
}
POLICY
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "file://$work/bucket-policy.json"
echo "applied"

say "CORS for the site origins"
cat > "$work/cors.json" <<CORS
{
  "CORSRules": [{
    "AllowedOrigins": ${ORIGINS},
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3000
  }]
}
CORS
aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "file://$work/cors.json"
echo "applied"

say "Execution role: ${ROLE}"
if ! aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  cat > "$work/trust.json" <<'TRUST'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "lambda.amazonaws.com" },
    "Action": "sts:AssumeRole"
  }]
}
TRUST
  aws iam create-role --role-name "$ROLE" \
    --assume-role-policy-document "file://$work/trust.json" >/dev/null
  aws iam attach-role-policy --role-name "$ROLE" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "created"
else
  echo "already exists"
fi

# ListBucket lets S3 answer a GET for the missing key with NoSuchKey rather
# than AccessDenied, so the first run into an empty bucket starts fresh.
cat > "$work/s3-access.json" <<ACCESS
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::${BUCKET}/${KEY}"
    },
    {
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::${BUCKET}"
    }
  ]
}
ACCESS
aws iam put-role-policy --role-name "$ROLE" --policy-name feeds-object-access \
  --policy-document "file://$work/s3-access.json"
ROLE_ARN="$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)"

# 48 runs a day add up; Lambda's own log group never expires.
say "Log group: ${LOG_GROUP} (30-day retention)"
aws logs create-log-group --log-group-name "$LOG_GROUP" --region "$REGION" 2>/dev/null \
  && echo "created" || echo "already exists"
aws logs put-retention-policy --log-group-name "$LOG_GROUP" --region "$REGION" \
  --retention-in-days 30

say "Packaging function"
zip -qj "$work/function.zip" "$here/home_feeds.py" "$here/handler.py" "$root/src/home/sources.json"
echo "home_feeds.py handler.py sources.json ($(python3 -c 'import json,sys; print(len(json.load(open(sys.argv[1]))))' "$root/src/home/sources.json") sources)"

ENV_VARS="Variables={BUCKET=${BUCKET},OBJECT_KEY=${KEY}}"
# A run fetches ~20 feeds plus article pages for missing thumbnails; most
# finish in well under a minute, the ceiling is for a slow publisher or two.
TIMEOUT=180
MEMORY=512

say "Function: ${FUNCTION}"
if aws lambda get-function --function-name "$FUNCTION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION" \
    --zip-file "fileb://$work/function.zip" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION"
  aws lambda update-function-configuration --function-name "$FUNCTION" \
    --runtime "$RUNTIME" --handler handler.handler \
    --environment "$ENV_VARS" --timeout "$TIMEOUT" --memory-size "$MEMORY" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION"
  echo "updated"
else
  # The freshly created role can take a few seconds to become assumable.
  for attempt in 1 2 3 4 5 6; do
    if aws lambda create-function --function-name "$FUNCTION" \
        --runtime "$RUNTIME" --handler handler.handler --role "$ROLE_ARN" \
        --zip-file "fileb://$work/function.zip" \
        --environment "$ENV_VARS" --timeout "$TIMEOUT" --memory-size "$MEMORY" >/dev/null 2>&1; then
      echo "created"
      break
    fi
    [ "$attempt" = 6 ] && { echo "create-function failed after retries"; exit 1; }
    echo "waiting for role propagation (attempt ${attempt})"
    sleep 5
  done
  aws lambda wait function-active --function-name "$FUNCTION"
fi
FUNCTION_ARN="$(aws lambda get-function --function-name "$FUNCTION" \
  --query Configuration.FunctionArn --output text)"

# One run at a time, so two never read-modify-write the snapshot together.
# A failed run is not retried and a queued one is dropped after 15 minutes:
# the next scheduled run is never more than 30 minutes away, and retrying
# only means fetching every publisher again.
aws lambda put-function-concurrency --function-name "$FUNCTION" \
  --reserved-concurrent-executions 1 >/dev/null
aws lambda put-function-event-invoke-config --function-name "$FUNCTION" \
  --maximum-retry-attempts 0 --maximum-event-age-in-seconds 900 >/dev/null

say "Scheduler role: ${SCHEDULER_ROLE}"
if ! aws iam get-role --role-name "$SCHEDULER_ROLE" >/dev/null 2>&1; then
  cat > "$work/scheduler-trust.json" <<TRUST
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Service": "scheduler.amazonaws.com" },
    "Action": "sts:AssumeRole",
    "Condition": { "StringEquals": { "aws:SourceAccount": "${ACCOUNT}" } }
  }]
}
TRUST
  aws iam create-role --role-name "$SCHEDULER_ROLE" \
    --assume-role-policy-document "file://$work/scheduler-trust.json" >/dev/null
  echo "created"
else
  echo "already exists"
fi
cat > "$work/invoke.json" <<INVOKE
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": "lambda:InvokeFunction",
    "Resource": ["${FUNCTION_ARN}", "${FUNCTION_ARN}:*"]
  }]
}
INVOKE
aws iam put-role-policy --role-name "$SCHEDULER_ROLE" --policy-name invoke-feeds-function \
  --policy-document "file://$work/invoke.json"
SCHEDULER_ROLE_ARN="$(aws iam get-role --role-name "$SCHEDULER_ROLE" --query Role.Arn --output text)"

say "Schedule: ${SCHEDULE} (${RATE})"
cat > "$work/target.json" <<TARGET
{
  "Arn": "${FUNCTION_ARN}",
  "RoleArn": "${SCHEDULER_ROLE_ARN}",
  "RetryPolicy": { "MaximumRetryAttempts": 0 }
}
TARGET
if aws scheduler get-schedule --name "$SCHEDULE" --region "$REGION" >/dev/null 2>&1; then
  ACTION=update-schedule
else
  ACTION=create-schedule
fi
for attempt in 1 2 3 4 5 6; do
  if aws scheduler "$ACTION" --name "$SCHEDULE" --region "$REGION" \
      --schedule-expression "$RATE" --flexible-time-window Mode=OFF \
      --state ENABLED --target "file://$work/target.json" >/dev/null 2>"$work/scheduler.err"; then
    echo "${ACTION%-schedule}d"
    break
  fi
  [ "$attempt" = 6 ] && { cat "$work/scheduler.err"; exit 1; }
  echo "waiting for role propagation (attempt ${attempt})"
  sleep 5
done

FEEDS_URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/${KEY}"

cat <<SUMMARY

Done.

  Public feeds : ${FEEDS_URL}
  Schedule     : ${RATE}

Run it once now instead of waiting for the schedule:

  aws lambda invoke --function-name ${FUNCTION} --log-type Tail \\
    --query LogResult --output text /dev/null | base64 --decode

Point the site at it (GitHub repo variable, then redeploy):

  gh variable set VITE_FEEDS_URL --body '${FEEDS_URL}'
SUMMARY
