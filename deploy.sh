#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infrastructure"

# --- All dynamic values from terraform output (no hardcoded IPs/ARNs) ---
EC2_IP=$(terraform -chdir="$INFRA_DIR" output -raw ec2_public_ip)
POS_EC2_IP=$(terraform -chdir="$INFRA_DIR" output -raw pos_ec2_public_ip)
API_URL=$(terraform -chdir="$INFRA_DIR" output -raw pos_api_url)

# SSH key path for EC2 access
if [[ -z "$SSH_KEY_PATH" ]]; then
  echo "ERROR: SSH_KEY_PATH is required."
  echo "Usage: SSH_KEY_PATH=/path/to/your-key.pem ./deploy.sh"
  exit 1
fi
KEY_PATH="$SSH_KEY_PATH"

# ---------- CONFIG ----------
EC2_USER=ec2-user
APP_NAME=customer-website
REMOTE_BASE=/home/ec2-user
REMOTE_APP_DIR=$REMOTE_BASE/$APP_NAME
ARCHIVE_NAME=$APP_NAME.tar.gz
SERVER_PORT=3000
POS_PORT=3001
# ----------------------------

# ========================================
# Part 1: Deploy website to EC2
# ========================================
echo ""
echo "=== Deploying Website to EC2 ==="

echo "Packaging application..."
tar --exclude=node_modules \
    --exclude=infrastructure \
    --exclude=.git \
    --exclude=$ARCHIVE_NAME \
    -czf $ARCHIVE_NAME -C .. customer-website

echo "Transferring archive to EC2..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no $ARCHIVE_NAME $EC2_USER@$EC2_IP:$REMOTE_BASE/

echo "Deploying on EC2..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP << EOF
  set -e
  cd $REMOTE_BASE

  # Source database config created by user_data
  source ~/db_config.sh

  # Stop old server
  pkill -f "node src/server.js" || true

  # Remove old version
  rm -rf $REMOTE_APP_DIR

  # Unpack new version
  tar -xzf $ARCHIVE_NAME
  rm $ARCHIVE_NAME

  # Install deps and populate database
  cd $REMOTE_APP_DIR/server
  npm install
  node database/populate.js

  # Start server
  nohup node src/server.js > server.log 2>&1 &
EOF

rm -f $ARCHIVE_NAME
echo "Website deployed: http://$EC2_IP:$SERVER_PORT"

# ========================================
# Part 2: Deploy POS Service to EC2
# ========================================
echo ""
echo "=== Deploying POS Service to EC2 ==="

POS_DIR="$SCRIPT_DIR/pos-service"

echo "Transferring POS service files..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  "$POS_DIR/index.js" "$POS_DIR/package.json" \
  $EC2_USER@$POS_EC2_IP:$REMOTE_BASE/pos-service/

echo "Installing dependencies and starting POS service..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no $EC2_USER@$POS_EC2_IP << EOF
  set -e

  # Source database config created by user_data
  source ~/db_config_pos.sh

  # Stop old POS service if running
  pkill -f "node index.js" || true
  sleep 1

  # Install dependencies
  cd $REMOTE_BASE/pos-service
  npm install --production

  # Start POS service
  nohup node index.js > pos-service.log 2>&1 &

  # Wait a moment and verify it started
  sleep 2
  if curl -s http://localhost:$POS_PORT/health > /dev/null 2>&1; then
    echo "POS service is running on port $POS_PORT"
  else
    echo "WARNING: POS service may not have started correctly"
    cat pos-service.log
  fi
EOF

# ========================================
# Done
# ========================================
echo ""
echo "=== All deployments complete ==="
echo "Website:  http://$EC2_IP:$SERVER_PORT"
echo "POS API:  $API_URL"
echo "POS EC2:  http://$POS_EC2_IP:$POS_PORT"
