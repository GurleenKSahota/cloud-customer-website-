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
EC2_USER=ubuntu
EC2_IP=${EC2_PUBLIC_IP}
KEY_PATH=${SSH_KEY_PATH}

APP_NAME=customer-website
REMOTE_BASE=/home/ubuntu
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
    -czf $ARCHIVE_NAME -C .. customer-website



echo "Transferring archive to EC2..."

# 2. Copy archive to EC2
scp -i $KEY_PATH $ARCHIVE_NAME $EC2_USER@$EC2_IP:$REMOTE_BASE/

echo "Deploying on EC2..."

# 3–7. Unpack, stop old, replace, start new
ssh -i $KEY_PATH $EC2_USER@$EC2_IP << EOF
  set -e
  cd $REMOTE_BASE

  # Stop old server
  pkill node || true

  # Remove old version
  rm -rf $REMOTE_APP_DIR

  # Unpack new version
  tar -xzf $ARCHIVE_NAME
  rm $ARCHIVE_NAME

  # Install deps and start
  cd $REMOTE_APP_DIR/server
  npm install
  nohup node src/server.js > server.log 2>&1 &
EOF

# Cleanup local archive
rm $ARCHIVE_NAME

echo "Deploy complete."
echo "Visit: http://$EC2_IP:$SERVER_PORT"
