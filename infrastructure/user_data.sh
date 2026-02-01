#!/bin/bash
set -e

# Update system and install necessary packages
dnf update -y
dnf install -y nodejs npm git postgresql15 nc

# Go to ec2-user home
cd /home/ec2-user

# Clone GitHub Classroom repo
git clone https://github.com/seattle-university-cs-cloud-computing/homework-series-GurleenKSahota.git

# Go to server directory
cd homework-series-GurleenKSahota/customer-website/server

# Install dependencies
npm install

# Set database environment variables
export DB_HOST="${db_host}"
export DB_PORT="${db_port}"
export DB_NAME="${db_name}"
export DB_USER="${db_username}"
export DB_PASSWORD="${db_password}"

# Wait for RDS to be ready (can take a few minutes)
echo "Waiting for database to be ready..."
for i in {1..30}; do
  if nc -z $DB_HOST $DB_PORT; then
    echo "Database is ready!"
    break
  fi
  echo "Waiting for database... attempt $i/30"
  sleep 10
done

# Run database schema and populate
echo "Setting up database schema..."
PGPASSWORD="${db_password}" psql -h "${db_host}" -p "${db_port}" -U "${db_username}" -d "${db_name}" -f database/schema.sql

echo "Populating database..."
SKIP_SCHEMA=1 node database/populate.js

# Start the server (background) with DB environment variables
echo "Starting web server..."
nohup env DB_HOST="${db_host}" DB_PORT="${db_port}" DB_NAME="${db_name}" DB_USER="${db_username}" DB_PASSWORD="${db_password}" node src/server.js > server.log 2>&1 &

echo "Deployment complete! Server should be running on port 3000"

