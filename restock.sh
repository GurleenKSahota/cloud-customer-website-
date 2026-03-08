#!/bin/bash
# Restocking Script — adds quantity to all inventory items
# Runs locally; reads API URL and key from terraform outputs.
#
# Usage:
#   ./restock.sh [--amount N] [--store STORE_ID]
#
#   --amount  N         Quantity to add to each item (default: 50)
#   --store   STORE_ID  Optional: restock only a specific store

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

# --- Parse arguments ---
AMOUNT=50
STORE_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --amount) AMOUNT="$2"; shift 2 ;;
    --store)  STORE_ID="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; echo "Usage: $0 [--amount N] [--store STORE_ID]"; exit 1 ;;
  esac
done

# --- Get API URL and key from terraform output ---
echo "Reading API config from terraform outputs..."
API_URL=$(terraform -chdir="$INFRA_DIR" output -raw pos_api_url)
API_KEY=$(terraform -chdir="$INFRA_DIR" output -raw pos_api_key_value)

echo "API URL: $API_URL"
echo ""

# --- Build request body ---
if [[ -n "$STORE_ID" ]]; then
  BODY="{\"amount\": $AMOUNT, \"storeId\": $STORE_ID}"
  echo "Restocking store $STORE_ID with +$AMOUNT per item..."
else
  BODY="{\"amount\": $AMOUNT}"
  echo "Restocking ALL stores with +$AMOUNT per item..."
fi

# --- Call restock endpoint ---
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
  -X POST \
  -H "x-api-key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "$BODY" \
  "$API_URL/restock")

RESP_BODY=$(echo "$RESPONSE" | sed '$d')
STATUS=$(echo "$RESPONSE" | tail -1 | sed 's/HTTP_STATUS://')

if [[ "$STATUS" == "200" ]]; then
  echo ""
  echo "✅ Restocking complete!"
  echo "$RESP_BODY" | python3 -c "
import json, sys
data = json.load(sys.stdin)
print(f\"   Items restocked: {data['itemsRestocked']}\")
print(f\"   Amount added per item: +{data['amountAdded']}\")
"
else
  echo ""
  echo "❌ Restocking failed (HTTP $STATUS)"
  echo "Response: $RESP_BODY"
  exit 1
fi
