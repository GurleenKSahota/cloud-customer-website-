#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

# --- Get API URL and API key from terraform output (no hardcoded values) ---
API_URL=$(terraform -chdir="$INFRA_DIR" output -raw pos_api_url)
API_KEY=$(terraform -chdir="$INFRA_DIR" output -raw pos_api_key_value)

echo "=== POS API Sample Client ==="
echo "API URL: $API_URL"
echo ""

# Helper: make a request, print the result, and check pass/fail
request() {
  local label="$1"
  local method="$2"
  local url="$3"
  local body="$4"
  local expected_status="${5:-200}"

  echo "--- $label ---"
  echo "$method $url"
  if [[ -n "$body" ]]; then
    echo "Body: $body"
  fi

  if [[ "$method" == "GET" ]]; then
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
      -H "x-api-key: $API_KEY" \
      "$url")
  else
    RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" \
      -X "$method" \
      -H "x-api-key: $API_KEY" \
      -H "Content-Type: application/json" \
      -d "$body" \
      "$url")
  fi

  BODY=$(echo "$RESPONSE" | sed '$d')
  STATUS=$(echo "$RESPONSE" | tail -1 | sed 's/HTTP_STATUS://')
  echo "Status: $STATUS"
  echo "Response: $BODY"

  if [[ "$STATUS" == "$expected_status" ]]; then
    echo "Result: PASSED (expected $expected_status, got $STATUS)"
  else
    echo "Result: FAILED (expected $expected_status, got $STATUS)"
  fi
  echo ""
}

# ============================================================
# Endpoint 1: Check Stock (GET /inventory/check)
# ============================================================
echo "=========================================="
echo "Endpoint 1: Check Stock"
echo "=========================================="

# Request 1: Check if store 1 has at least 5 Apples (barcode: 123456789)
request "Check stock: 5 Apples at store 1" \
  GET "$API_URL/check?storeId=1&barcode=123456789&quantity=5"

# Request 2: Check if store 2 has at least 3 Frozen Peas (barcode: 036632011452)
request "Check stock: 3 Frozen Peas at store 2" \
  GET "$API_URL/check?storeId=2&barcode=036632011452&quantity=3"

# ============================================================
# Endpoint 2: Get Price (GET /inventory/price)
# ============================================================
echo "=========================================="
echo "Endpoint 2: Get Price"
echo "=========================================="

# Request 1: Get price of Whole Milk at store 1 (Dairy — should show 15% Dairy Days sale)
request "Price: Whole Milk at store 1 (Dairy Days 15% off)" \
  GET "$API_URL/price?storeId=1&barcode=0028400047685"

# Request 2: Get price of Spaghetti Pasta at store 3 (no active sale)
request "Price: Spaghetti Pasta at store 3 (no sale)" \
  GET "$API_URL/price?storeId=3&barcode=041190000019"

# ============================================================
# Endpoint 3: Deduct Single (POST /inventory/deduct)
# ============================================================
echo "=========================================="
echo "Endpoint 3: Deduct Single"
echo "=========================================="

# Request 1: Deduct 1 Banana from store 1 (barcode: 4011)
request "Deduct: 1 Banana from store 1" \
  POST "$API_URL/deduct" \
  '{"storeId": 1, "barcode": "4011", "quantity": 1}'

# Request 2: Deduct 2 Strawberries from store 3 (barcode: 033383000463)
request "Deduct: 2 Strawberries from store 3" \
  POST "$API_URL/deduct" \
  '{"storeId": 3, "barcode": "033383000463", "quantity": 2}'

# ============================================================
# Endpoint 4: Deduct Batch (POST /inventory/deduct-batch)
# ============================================================
echo "=========================================="
echo "Endpoint 4: Deduct Batch"
echo "=========================================="

# Request 1: Deduct Sourdough Bread + Cheddar Cheese from store 1
request "Batch deduct: Sourdough Bread + Cheddar Cheese from store 1" \
  POST "$API_URL/deduct-batch" \
  '{"storeId": 1, "items": [{"barcode": "073410950102", "quantity": 1}, {"barcode": "070847023015", "quantity": 1}]}'

# Request 2: Deduct Apple + Spaghetti Pasta from store 4
request "Batch deduct: Apple + Spaghetti Pasta from store 4" \
  POST "$API_URL/deduct-batch" \
  '{"storeId": 4, "items": [{"barcode": "123456789", "quantity": 1}, {"barcode": "041190000019", "quantity": 2}]}'

echo "=========================================="
echo "=== All 8 successful requests complete ==="
echo "=========================================="

# ============================================================
# Edge Cases: Demonstrating business logic enforcement
# ============================================================
echo ""
echo "=========================================="
echo "Edge Case Tests"
echo "=========================================="

# Edge case 1: Request WITHOUT API key (should get 403 Forbidden)
echo "--- No API key: should return 403 ---"
echo "GET $API_URL/check?storeId=1&barcode=123456789&quantity=1"
RESPONSE=$(curl -s -w "\nHTTP_STATUS:%{http_code}" "$API_URL/check?storeId=1&barcode=123456789&quantity=1")
BODY=$(echo "$RESPONSE" | sed '$d')
STATUS=$(echo "$RESPONSE" | tail -1 | sed 's/HTTP_STATUS://')
echo "Status: $STATUS"
echo "Response: $BODY"
if [[ "$STATUS" == "403" ]]; then
  echo "Result: PASSED (expected 403, got $STATUS)"
else
  echo "Result: FAILED (expected 403, got $STATUS)"
fi
echo ""

# Edge case 2: Deduct more than available (should get 409 Insufficient inventory)
request "Over-deduct: 99999 Apples from store 1 (should fail)" \
  POST "$API_URL/deduct" \
  '{"storeId": 1, "barcode": "123456789", "quantity": 99999}' \
  409

echo "=========================================="
echo "=== All tests complete ==="
echo "=========================================="
