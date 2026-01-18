#!/bin/bash
set -e

dnf update -y
dnf install -y nodejs npm git


# Go to ec2-user home
cd /home/ec2-user

# Clone your GitHub Classroom repo
git clone https://github.com/seattle-university-cs-cloud-computing/homework-series-GurleenKSahota.git

# Go to server directory
cd homework-series-GurleenKSahota/customer-website/server

# Install dependencies
npm install

# Start the server (background)
nohup node src/server.js > server.log 2>&1 &

