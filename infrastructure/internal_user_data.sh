#!/bin/bash
set -e

# Update system and install necessary packages
dnf update -y
dnf install -y nodejs npm git postgresql15 nc

# Create application directory
mkdir -p /home/ec2-user/internal-service
chown ec2-user:ec2-user /home/ec2-user/internal-service

# Store DB + Cognito credentials for later use
cat > /home/ec2-user/db_config_internal.sh << EOF
export DB_HOST="${db_host}"
export DB_PORT="${db_port}"
export DB_NAME="${db_name}"
export DB_USER="${db_username}"
export DB_PASSWORD="${db_password}"
export DATABASE_URL="postgresql://${db_username}:${db_password}@${db_host}:${db_port}/${db_name}"
export COGNITO_USER_POOL_ID="${cognito_user_pool_id}"
export COGNITO_CLIENT_ID="${cognito_client_id}"
export AWS_REGION="${aws_region}"
EOF
chown ec2-user:ec2-user /home/ec2-user/db_config_internal.sh

echo "Internal website EC2 instance initialized. Ready for deployment."
