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

  # Wait for EC2 bootstrapping to complete (user_data creates this file)
  echo "Waiting for EC2 bootstrapping to complete..."
  WAIT_COUNT=0
  while [ ! -f ~/db_config.sh ]; do
    WAIT_COUNT=\$((WAIT_COUNT + 1))
    if [ \$WAIT_COUNT -ge 40 ]; then
      echo "ERROR: Timed out waiting for bootstrapping (10 minutes)"
      exit 1
    fi
    echo "  Still bootstrapping... (\${WAIT_COUNT}/40)"
    sleep 15
  done
  echo "Bootstrapping complete!"

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

  # Wait for EC2 bootstrapping to complete (user_data creates this file)
  echo "Waiting for EC2 bootstrapping to complete..."
  WAIT_COUNT=0
  while [ ! -f ~/db_config_pos.sh ]; do
    WAIT_COUNT=\$((WAIT_COUNT + 1))
    if [ \$WAIT_COUNT -ge 40 ]; then
      echo "ERROR: Timed out waiting for bootstrapping (10 minutes)"
      exit 1
    fi
    echo "  Still bootstrapping... (\${WAIT_COUNT}/40)"
    sleep 15
  done
  echo "Bootstrapping complete!"

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
# Part 3: Deploy Internal Website to EC2
# ========================================
echo ""
echo "=== Deploying Internal Website to EC2 ==="

INTERNAL_EC2_IP=$(terraform -chdir="$INFRA_DIR" output -raw internal_ec2_public_ip)
INTERNAL_DIR="$SCRIPT_DIR/internal-service"
INTERNAL_PORT=3002

echo "Packaging internal service..."
tar --exclude=node_modules \
    -czf internal-service.tar.gz -C "$SCRIPT_DIR" internal-service

echo "Transferring internal service to EC2..."
scp -i "$KEY_PATH" -o StrictHostKeyChecking=no \
  internal-service.tar.gz \
  $EC2_USER@$INTERNAL_EC2_IP:$REMOTE_BASE/

echo "Installing and starting internal website..."
ssh -i "$KEY_PATH" -o StrictHostKeyChecking=no $EC2_USER@$INTERNAL_EC2_IP << EOF
  set -e

  # Wait for EC2 bootstrapping to complete
  echo "Waiting for EC2 bootstrapping to complete..."
  WAIT_COUNT=0
  while [ ! -f ~/db_config_internal.sh ]; do
    WAIT_COUNT=\$((WAIT_COUNT + 1))
    if [ \$WAIT_COUNT -ge 40 ]; then
      echo "ERROR: Timed out waiting for bootstrapping (10 minutes)"
      exit 1
    fi
    echo "  Still bootstrapping... (\${WAIT_COUNT}/40)"
    sleep 15
  done
  echo "Bootstrapping complete!"

  # Source database and Cognito config
  source ~/db_config_internal.sh

  # Stop old service if running
  pkill -f "node src/server.js" || true
  sleep 1

  # Remove old version and unpack new
  cd $REMOTE_BASE
  rm -rf internal-service
  tar -xzf internal-service.tar.gz
  rm internal-service.tar.gz

  # Install dependencies
  cd internal-service
  npm install --production

  # Start internal website
  nohup node src/server.js > internal.log 2>&1 &

  # Verify it started
  sleep 2
  if curl -s http://localhost:$INTERNAL_PORT/api/config > /dev/null 2>&1; then
    echo "Internal website is running on port $INTERNAL_PORT"
  else
    echo "WARNING: Internal website may not have started correctly"
    cat internal.log
  fi
EOF

rm -f internal-service.tar.gz

# ========================================
# Done
# ========================================
echo ""
echo "=== All deployments complete ==="
echo "Customer Website:   http://$EC2_IP:$SERVER_PORT"
echo "POS API:            $API_URL"
echo "POS EC2:            http://$POS_EC2_IP:$POS_PORT"
echo "Internal Website:   http://$INTERNAL_EC2_IP:$INTERNAL_PORT"
echo ""
echo "To create an employee login:  ./create-user.sh <email>"

