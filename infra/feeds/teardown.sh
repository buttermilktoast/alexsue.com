#!/usr/bin/env bash
# Removes everything deploy.sh creates. Reads the same environment variables.
# Safe to re-run and against a partial deploy: each step skips what is gone.
# The schedule goes first so nothing invokes the function mid-teardown.
#
#   ./infra/feeds/teardown.sh          prompt before deleting
#   ./infra/feeds/teardown.sh --yes    no prompt

set -euo pipefail

REGION="${REGION:-us-east-1}"
BUCKET="${BUCKET:-alexsue-home-feeds}"
FUNCTION="${FUNCTION:-alexsue-home-feeds}"
ROLE="${ROLE:-${FUNCTION}-role}"
SCHEDULE="${SCHEDULE:-${FUNCTION}}"
SCHEDULER_ROLE="${SCHEDULER_ROLE:-${FUNCTION}-scheduler-role}"
LOG_GROUP="/aws/lambda/${FUNCTION}"

echo "This deletes schedule ${SCHEDULE}, function ${FUNCTION}, roles ${ROLE} and"
echo "${SCHEDULER_ROLE}, log group ${LOG_GROUP}, and bucket ${BUCKET} with its contents."
if [ "${1:-}" != "--yes" ]; then
  printf 'Type the bucket name to confirm: '
  read -r REPLY_NAME
  [ "$REPLY_NAME" = "$BUCKET" ] || { echo "Did not match. Nothing deleted."; exit 1; }
fi

say() { printf '\n== %s\n' "$1"; }
try() { "$@" >/dev/null 2>&1 && echo "   removed" || echo "   not present, skipping"; }

remove_role() {
  local role="$1"
  aws iam get-role --role-name "$role" >/dev/null 2>&1 || { echo "   not present, skipping"; return; }
  for name in $(aws iam list-role-policies --role-name "$role" --query 'PolicyNames[]' --output text); do
    aws iam delete-role-policy --role-name "$role" --policy-name "$name"
  done
  for arn in $(aws iam list-attached-role-policies --role-name "$role" \
      --query 'AttachedPolicies[].PolicyArn' --output text); do
    aws iam detach-role-policy --role-name "$role" --policy-arn "$arn"
  done
  aws iam delete-role --role-name "$role"
  echo "   removed"
}

say "Schedule ${SCHEDULE}";         try aws scheduler delete-schedule --name "$SCHEDULE" --region "$REGION"
say "Function ${FUNCTION}";         try aws lambda delete-function --function-name "$FUNCTION"
say "Role ${SCHEDULER_ROLE}";       remove_role "$SCHEDULER_ROLE"
say "Role ${ROLE}";                 remove_role "$ROLE"
say "Log group ${LOG_GROUP}";       try aws logs delete-log-group --log-group-name "$LOG_GROUP" --region "$REGION"
say "Bucket ${BUCKET}";             try aws s3 rb "s3://${BUCKET}" --force

echo
echo "Also remove the VITE_FEEDS_URL repository variable: gh variable delete VITE_FEEDS_URL"
