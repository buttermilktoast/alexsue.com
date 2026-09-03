#!/usr/bin/env bash
# Removes everything deploy.sh creates. Reads the same environment variables,
# so override them the same way you would for deploy.
#
# Safe to re-run and safe to run against a partial deploy: each step skips
# what is already gone. Deletion order matters -- the function goes first so
# nothing can write to the bucket mid-teardown, and the role outlives the
# function only long enough to be detached cleanly.
#
#   ./infra/teardown.sh          prompt before deleting
#   ./infra/teardown.sh --yes    no prompt

set -euo pipefail

REGION="${REGION:-us-east-1}"
ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
BUCKET="${BUCKET:-alexsue-status-${ACCOUNT}}"
FUNCTION="${FUNCTION:-alexsue-status-push}"
ROLE="${ROLE:-${FUNCTION}-role}"
LOG_GROUP="/aws/lambda/${FUNCTION}"

ASSUME_YES=false
[ "${1:-}" = "--yes" ] && ASSUME_YES=true

say() { printf '\n== %s\n' "$1"; }
gone() { printf '   not present, skipping\n'; }

# --- Survey first, so the prompt describes what will actually happen --------

FOUND=()
aws lambda get-function --function-name "$FUNCTION" >/dev/null 2>&1 \
  && FOUND+=("lambda function ${FUNCTION} (and its URL, permissions, concurrency)")
aws iam get-role --role-name "$ROLE" >/dev/null 2>&1 \
  && FOUND+=("iam role ${ROLE} (and its attached + inline policies)")
aws logs describe-log-groups --region "$REGION" --log-group-name-prefix "$LOG_GROUP" \
  --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -qx "$LOG_GROUP" \
  && FOUND+=("cloudwatch log group ${LOG_GROUP}")

OBJECTS=0
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  OBJECTS="$(aws s3api list-objects-v2 --bucket "$BUCKET" \
    --query 'length(Contents || `[]`)' --output text 2>/dev/null || echo 0)"
  FOUND+=("s3 bucket ${BUCKET} and all ${OBJECTS} object(s) in it")
fi

if [ "${#FOUND[@]}" -eq 0 ]; then
  echo "Nothing to remove -- no matching resources in ${REGION}."
  exit 0
fi

echo "This will permanently delete:"
printf '  - %s\n' "${FOUND[@]}"
echo
echo "The accumulated baseline in status.json is destroyed with the bucket."
echo "It cannot be rebuilt, because the pipeline keeps no history."

if [ "$ASSUME_YES" != true ]; then
  printf '\nType the bucket name to confirm: '
  read -r REPLY_NAME
  [ "$REPLY_NAME" = "$BUCKET" ] || { echo "Did not match. Nothing deleted."; exit 1; }
fi

# --- Delete ----------------------------------------------------------------

say "Lambda function"
if aws lambda get-function --function-name "$FUNCTION" >/dev/null 2>&1; then
  # The URL config, resource policy and reserved concurrency are owned by the
  # function and go with it; deleting them separately is unnecessary.
  aws lambda delete-function --function-name "$FUNCTION"
  echo "   deleted"
else
  gone
fi

say "IAM role"
if aws iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  # A role cannot be deleted while any policy is still attached or inline.
  # Some CLI versions render an empty result as the literal "None".
  for arn in $(aws iam list-attached-role-policies --role-name "$ROLE" \
      --query 'AttachedPolicies[].PolicyArn' --output text); do
    [ "$arn" = "None" ] && continue
    aws iam detach-role-policy --role-name "$ROLE" --policy-arn "$arn"
    echo "   detached ${arn##*/}"
  done
  for name in $(aws iam list-role-policies --role-name "$ROLE" \
      --query 'PolicyNames[]' --output text); do
    [ "$name" = "None" ] && continue
    aws iam delete-role-policy --role-name "$ROLE" --policy-name "$name"
    echo "   removed inline policy ${name}"
  done
  aws iam delete-role --role-name "$ROLE"
  echo "   deleted"
else
  gone
fi

say "S3 bucket"
if aws s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  # Versioning was never enabled, so a plain recursive delete empties it.
  aws s3 rm "s3://${BUCKET}" --recursive --only-show-errors
  aws s3api delete-bucket --bucket "$BUCKET" --region "$REGION"
  echo "   emptied and deleted"
else
  gone
fi

# Lambda creates this implicitly on first invocation and leaves it behind when
# the function is deleted -- it is the one thing that would otherwise linger.
say "CloudWatch log group"
if aws logs delete-log-group --region "$REGION" --log-group-name "$LOG_GROUP" 2>/dev/null; then
  echo "   deleted"
else
  gone
fi

cat <<SUMMARY

Teardown complete.

Still to do by hand, since they live outside AWS:
  - remove the VITE_STATUS_URL repository variable and redeploy the site
  - delete the push token from the Shortcut on your phone

The site degrades on its own in the meantime: with the endpoint gone the
fetch fails, the live rows drop out, and the static rows stand alone.
SUMMARY
