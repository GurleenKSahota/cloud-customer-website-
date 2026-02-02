#!/bin/bash
set -e

if [[ -z "$EC2_PUBLIC_IP" || -z "$SSH_KEY_PATH" ]]; then
  echo "ERROR: Missing required environment variables."
  echo "Please set:"
  echo "  EC2_PUBLIC_IP=<ec2-public-ip>"
  echo "  SSH_KEY_PATH=<path-to-ssh-key.pem>"
  exit 1
fi

# ---------- CONFIG ----------
EC2_USER=ec2-user
EC2_IP=${EC2_PUBLIC_IP}
KEY_PATH=${SSH_KEY_PATH}

APP_NAME=customer-website
REMOTE_BASE=/home/ec2-user
REMOTE_APP_DIR=$REMOTE_BASE/$APP_NAME
ARCHIVE_NAME=$APP_NAME.tar.gz
SERVER_PORT=3000
# ----------------------------

echo "Packaging application..."

# 1. Package application (no node_modules, no infra)
tar --exclude=node_modules \
    --exclude=infrastructure \
    --exclude=.git \
    --exclude=$ARCHIVE_NAME \
    --exclude=*.sh \
    -czf $ARCHIVE_NAME server/ web/

echo "Transferring archive to EC2..."

# 2. Copy archive to EC2
scp -i $KEY_PATH -o StrictHostKeyChecking=no $ARCHIVE_NAME $EC2_USER@$EC2_IP:$REMOTE_BASE/

echo "Deploying on EC2..."

# 3–7. Unpack, stop old, replace, start new
ssh -i $KEY_PATH -o StrictHostKeyChecking=no $EC2_USER@$EC2_IP << EOF
  set -e
  cd $REMOTE_BASE
  
  # Source database config created by user_data
  source ~/db_config.sh

  # Stop old server
  pkill -f "node src/server.js" || true

  # Remove old version if exists
  rm -rf $REMOTE_APP_DIR

  # Create app directory and unpack new version
  mkdir -p $REMOTE_APP_DIR
  tar -xzf $ARCHIVE_NAME -C $REMOTE_APP_DIR
  rm $ARCHIVE_NAME

  # Install deps, setup database if needed, and start
  cd $REMOTE_APP_DIR/server
  npm install
  
  # Run database population (will create schema if not exists)
  npm run populate-db || echo "Database already populated"
  
  # Start server with database credentials
  nohup env DB_HOST="\$DB_HOST" DB_PORT="\$DB_PORT" DB_NAME="\$DB_NAME" DB_USER="\$DB_USER" DB_PASSWORD="\$DB_PASSWORD" node src/server.js > server.log 2>&1 &
  
  echo "Server started on port $SERVER_PORT"
EOF

# Cleanup local archive
rm $ARCHIVE_NAME

echo "Deploy complete."
echo "Visit: http://$EC2_IP:$SERVER_PORT"
