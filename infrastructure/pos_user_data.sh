#!/bin/bash
set -e

# Update system and install necessary packages
dnf update -y
dnf install -y nodejs npm git postgresql15 nc

# Create application directory
mkdir -p /home/ec2-user/pos-service
chown ec2-user:ec2-user /home/ec2-user/pos-service

# Store DB credentials for later use by the POS service
cat > /home/ec2-user/db_config_pos.sh << EOF
export DB_HOST="${db_host}"
export DB_PORT="${db_port}"
export DB_NAME="${db_name}"
export DB_USER="${db_username}"
export DB_PASSWORD="${db_password}"
EOF
chown ec2-user:ec2-user /home/ec2-user/db_config_pos.sh

echo "POS EC2 instance initialized. Ready for POS service deployment."
