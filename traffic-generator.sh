#!/bin/bash
# Traffic Generator — simulates customer interactions by calling the POS deduct API
# Runs locally; reads API URL and key from terraform outputs.
#
# Usage:
#   ./traffic-generator.sh [--count N] [--rate R]
#
#   --count N   Number of deduction calls to make (default: 10)
#   --rate  R   Calls per second (default: 1)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

# --- Parse arguments ---
COUNT=10
RATE=1

while [[ $# -gt 0 ]]; do
  case $1 in
    --count) COUNT="$2"; shift 2 ;;
    --rate)  RATE="$2";  shift 2 ;;
    *) echo "Unknown option: $1"; echo "Usage: $0 [--count N] [--rate R]"; exit 1 ;;
  esac
done

# --- Get API URL and key from terraform output ---
echo "Reading API config from terraform outputs..."
API_URL=$(terraform -chdir="$INFRA_DIR" output -raw pos_api_url)
API_KEY=$(terraform -chdir="$INFRA_DIR" output -raw pos_api_key_value)

echo "API URL: $API_URL"
echo ""

# --- Fetch available products ---
echo "Fetching available products..."
PRODUCTS_JSON=$(curl -s -H "x-api-key: $API_KEY" "$API_URL/products")

# Parse into arrays of barcodes and storeIds
ITEMS=$(echo "$PRODUCTS_JSON" | python3 -c "
import json, sys
items = json.load(sys.stdin)
for item in items:
    print(item['barcode'] + '|' + str(item['storeId']))
")

if [[ -z "$ITEMS" ]]; then
  echo "ERROR: No in-stock products found. Try running ./restock.sh first."
  exit 1
fi

# Convert to array
IFS=$'\n' read -r -d '' -a ITEM_ARRAY <<< "$ITEMS" || true
TOTAL_ITEMS=${#ITEM_ARRAY[@]}
echo "Found $TOTAL_ITEMS in-stock product/store combinations"
echo ""

# --- Calculate delay between calls ---
DELAY=$(python3 -c "print(1.0 / $RATE)")

# --- Run traffic ---
echo "=== Starting Traffic Generator ==="
echo "Calls: $COUNT | Rate: $RATE/sec (${DELAY}s delay)"
echo ""

SUCCESS=0
FAIL=0

for ((i = 1; i <= COUNT; i++)); do
  # Pick a random product/store
  RANDOM_INDEX=$((RANDOM % TOTAL_ITEMS))
  ENTRY="${ITEM_ARRAY[$RANDOM_INDEX]}"
  BARCODE=$(echo "$ENTRY" | cut -d'|' -f1)
  STORE_ID=$(echo "$ENTRY" | cut -d'|' -f2)

  # Make the deduct call
  RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
    -X POST \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"storeId\": $STORE_ID, \"barcode\": \"$BARCODE\", \"quantity\": 1}" \
    "$API_URL/deduct")

  BODY=$(echo "$RESPONSE" | sed '$d')
  STATUS=$(echo "$RESPONSE" | tail -1 | sed 's/HTTP_STATUS://')

  if [[ "$STATUS" == "200" ]]; then
    SUCCESS=$((SUCCESS + 1))
    echo "[$i/$COUNT] ✓ Deducted 1x barcode=$BARCODE from store=$STORE_ID"
  else
    FAIL=$((FAIL + 1))
    echo "[$i/$COUNT] ✗ Failed (HTTP $STATUS) barcode=$BARCODE store=$STORE_ID — $BODY"
  fi

  # Rate limiting (skip delay on last call)
  if [[ $i -lt $COUNT ]]; then
    sleep "$DELAY"
  fi
done

echo ""
echo "=== Traffic Generator Complete ==="
echo "Total: $COUNT | Success: $SUCCESS | Failed: $FAIL"
