#!/usr/bin/env bash
# Creates (or updates) the status pipeline: an S3 bucket holding one public
# JSON object, and a Lambda behind a Function URL that the phone pushes to.
#
# Safe to re-run: every step either creates the resource or updates it in
# place. The push token is generated once and preserved on later runs.

set -euo pipefail

REGION="${REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${BUCKET:-alexsue-status-${ACCOUNT}}"
KEY="${OBJECT_KEY:-status.json}"
FUNCTION="${FUNCTION:-alexsue-status-push}"
ROLE="${ROLE:-${FUNCTION}-role}"
RUNTIME="${RUNTIME:-nodejs22.x}"
LOCAL_TZ="${LOCAL_TZ:-Pacific/Honolulu}"
ORIGINS='["https://alexsue.com","https://www.alexsue.com","http://localhost:5173"]'

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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
    "Sid": "PublicReadStatusObject",
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

# ListBucket matters more than it looks: without it S3 answers a GET for a
# missing key with AccessDenied rather than NoSuchKey, so the very first push
# into an empty bucket would fail instead of seeding a fresh baseline.
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
aws iam put-role-policy --role-name "$ROLE" --policy-name status-object-access \
  --policy-document "file://$work/s3-access.json"
ROLE_ARN="$(aws iam get-role --role-name "$ROLE" --query Role.Arn --output text)"

say "Packaging function"
( cd "$here/lambda" && zip -q "$work/function.zip" index.mjs status.mjs )
echo "$(cd "$here/lambda" && ls index.mjs status.mjs | tr '\n' ' ')"

# Reuse the existing token so re-running never invalidates the phone's copy.
if EXISTING_TOKEN="$(aws lambda get-function-configuration --function-name "$FUNCTION" \
    --query 'Environment.Variables.PUSH_TOKEN' --output text 2>/dev/null)" \
    && [ -n "$EXISTING_TOKEN" ] && [ "$EXISTING_TOKEN" != "None" ]; then
  TOKEN="$EXISTING_TOKEN"
  TOKEN_NOTE="(existing token preserved)"
else
  TOKEN="$(openssl rand -hex 32)"
  TOKEN_NOTE="(new token generated)"
fi

ENV_VARS="Variables={BUCKET=${BUCKET},OBJECT_KEY=${KEY},PUSH_TOKEN=${TOKEN},LOCAL_TZ=${LOCAL_TZ},EWMA_HALF_LIFE_DAYS=14,MIN_BASELINE_DAYS=7,MAX_AGE_SECONDS=300}"

say "Function: ${FUNCTION}"
if aws lambda get-function --function-name "$FUNCTION" >/dev/null 2>&1; then
  aws lambda update-function-code --function-name "$FUNCTION" \
    --zip-file "fileb://$work/function.zip" >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION"
  aws lambda update-function-configuration --function-name "$FUNCTION" \
    --environment "$ENV_VARS" --timeout 10 --memory-size 256 >/dev/null
  aws lambda wait function-updated --function-name "$FUNCTION"
  echo "updated"
else
  # The freshly created role can take a few seconds to become assumable.
  for attempt in 1 2 3 4 5 6; do
    if aws lambda create-function --function-name "$FUNCTION" \
        --runtime "$RUNTIME" --handler index.handler --role "$ROLE_ARN" \
        --zip-file "fileb://$work/function.zip" \
        --environment "$ENV_VARS" --timeout 10 --memory-size 256 >/dev/null 2>&1; then
      echo "created"
      break
    fi
    [ "$attempt" = 6 ] && { echo "create-function failed after retries"; exit 1; }
    echo "waiting for role propagation (attempt ${attempt})"
    sleep 5
  done
  aws lambda wait function-active --function-name "$FUNCTION"
fi

# Caps both the bill and the blast radius on a public URL, and serialises the
# read-modify-write so two pushes cannot clobber each other.
aws lambda put-function-concurrency --function-name "$FUNCTION" \
  --reserved-concurrent-executions 2 >/dev/null

say "Function URL"
if ! aws lambda get-function-url-config --function-name "$FUNCTION" >/dev/null 2>&1; then
  aws lambda create-function-url-config --function-name "$FUNCTION" \
    --auth-type NONE >/dev/null
  aws lambda add-permission --function-name "$FUNCTION" \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl --principal '*' \
    --function-url-auth-type NONE >/dev/null
fi
FUNCTION_URL="$(aws lambda get-function-url-config --function-name "$FUNCTION" \
  --query FunctionUrl --output text)"

STATUS_URL="https://${BUCKET}.s3.${REGION}.amazonaws.com/${KEY}"

cat <<SUMMARY

Done.

  Push endpoint : ${FUNCTION_URL}
  Push token    : ${TOKEN}  ${TOKEN_NOTE}
  Public status : ${STATUS_URL}

Add the read URL to the site build (GitHub repo variable or local .env):

  VITE_STATUS_URL=${STATUS_URL}

Smoke test:

  curl -sS -X POST '${FUNCTION_URL}' \\
    -H 'authorization: Bearer ${TOKEN}' \\
    -H 'content-type: application/json' \\
    -d '{"steps":6412,"restingHeartRate":62}' | jq .

  curl -sS '${STATUS_URL}' | jq .
SUMMARY
