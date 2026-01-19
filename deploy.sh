#!/bin/bash
set -e

# ---- CONFIG --------
EC2_USER=ubuntu
EC2_IP=$(cd infrastructure && terraform output -raw public_ip)
KEY_PATH=~/.ssh/customer-website-key.pem
REMOTE_DIR=/home/ubuntu/customer-website
SERVER_START_CMD="node src/server.js"
# --------------------------------------------

echo "Deploying to $EC2_USER@$EC2_IP..."

# Copy project to EC2
rsync -av --delete \
  --exclude node_modules \
  --exclude infrastructure \
  --exclude .git \
  -e "ssh -i $KEY_PATH" \
  ./ $EC2_USER@$EC2_IP:$REMOTE_DIR

# SSH into EC2 and start server
ssh -i $KEY_PATH $EC2_USER@$EC2_IP << EOF
  cd $REMOTE_DIR/server
  npm install
  pkill node || true
  nohup $SERVER_START_CMD > server.log 2>&1 &
  echo "Server started"
EOF

echo "Deploy complete."
echo "Visit: http://$EC2_IP:3000"
