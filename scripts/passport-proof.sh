#!/bin/bash
# Has a real Kite Passport agent pay Countersign's paid API on Kite testnet.
#
# 1. asks Passport for a small test spending session and opens the approval page
# 2. waits for the owner to approve it with their passkey
# 3. the agent calls POST /v1/check through the session: Passport answers the
#    402 challenge, pays in test pieUSD, and the verdict comes back
#
# Everything is saved under proof/. Test money only (Kite testnet, sandbox mode).
#
#   bash scripts/passport-proof.sh [origin]
set -uo pipefail
cd "$(dirname "$0")/.."

ORIGIN="${1:-https://countersign-ten-xi.vercel.app}"
KPASS="${KPASS:-$HOME/.local/bin/kpass}"
export KITE_PASSPORT_BASE_URL="${KITE_PASSPORT_BASE_URL:-https://passport.staging.gokite.ai}"
mkdir -p proof

"$KPASS" sandbox on >/dev/null 2>&1

echo "== 1. requesting a test spending session (up to \$0.05 a call, \$1 in total, 24 hours)"
"$KPASS" session create --separate \
  --task-summary "Pay Countersign to check agent payments before they are signed (hackathon test, Kite testnet)" \
  --max-amount-per-tx 0.05 --max-total-amount 1 --assets pieUSD --ttl 24h \
  --no-wait --output json > proof/session-request.json
REQUEST_ID=$(jq -r '.request_id // empty' proof/session-request.json)
URL=$(jq -r '.user_message // empty' proof/session-request.json | grep -o 'https://[^ ]*' | head -1)
if [ -z "$REQUEST_ID" ] || [ -z "$URL" ]; then
  echo "could not create the session request:"; cat proof/session-request.json; exit 1
fi
echo "   approval page: $URL"
open "$URL" 2>/dev/null || true

echo "== 2. waiting for your passkey approval in the browser (up to 5 minutes)"
"$KPASS" session status --request-id "$REQUEST_ID" --wait --output json > proof/session.json
SESSION_ID=$(jq -r '.session_id // .session.id // .session.session_id // empty' proof/session.json)
if [ -z "$SESSION_ID" ]; then
  echo "the session was not approved in time:"; jq -r '.hint // .error // .status' proof/session.json; exit 1
fi
echo "   approved: $SESSION_ID"
"$KPASS" session use --session-id "$SESSION_ID" --output json >/dev/null 2>&1 || true

echo "== 3. the Passport agent pays Countersign to check a payment (case S01: a look-alike merchant)"
npx tsx scripts/check-body.ts S01 > proof/check-body.json
"$KPASS" session execute \
  --url "$ORIGIN/v1/check" --method POST \
  --headers '{"Content-Type":"application/json"}' \
  --body "$(cat proof/check-body.json)" \
  --idempotency-key "$(uuidgen)" \
  --output json > proof/passport-check.json
STATUS=$?
jq '{status, error, hint, http_status: (.http_status // .status_code // null), transaction: (.transaction_hash // .payment.transaction_hash // .settlement.transaction // null)}' proof/passport-check.json 2>/dev/null || cat proof/passport-check.json
echo "== done (exit $STATUS). Full output: proof/passport-check.json"
