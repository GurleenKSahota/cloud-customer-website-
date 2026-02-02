#!/bin/bash
set -e

# This script can be used to manually deploy code updates to an existing EC2 instance
# Usage: ./deploy.sh <ec2-public-ip> <key-file-path>

if [ "$#" -ne 2 ]; then
    echo "Usage: ./deploy.sh <ec2-public-ip> <key-file-path>"
    echo "Example: ./deploy.sh 54.123.45.67 ~/.ssh/customer-website-key.pem"
    exit 1
fi

EC2_IP=$1
KEY_FILE=$2
REPO_PATH="/home/ec2-user/homework-series-GurleenKSahota/customer-website"

echo "Deploying to EC2 instance at $EC2_IP..."

# SSH into EC2 and update the application
ssh -i "$KEY_FILE" ec2-user@"$EC2_IP" << 'EOF'
    set -e
    
    # Navigate to repo
    cd ~/homework-series-GurleenKSahota
    
    # Pull latest changes
    echo "Pulling latest code from GitHub..."
    git pull origin main
    
    # Navigate to server directory
    cd customer-website/server
    
    # Install/update dependencies
    echo "Installing dependencies..."
    npm install
    
    # Stop existing server process
    echo "Stopping existing server..."
    pkill -f "node src/server.js" || true
    
    # Start the server in background
    echo "Starting server..."
    nohup node src/server.js > server.log 2>&1 &
    
    echo "Deployment complete!"
    echo "Server is running. Check logs with: tail -f ~/homework-series-GurleenKSahota/customer-website/server/server.log"
EOF

echo "✅ Deployment successful!"
echo "Access your website at: http://$EC2_IP:3000"
