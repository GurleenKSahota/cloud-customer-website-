# Customer Website

This project implements a customer-facing product catalog website for a grocery store.  
Customers can browse products and filter them by category using a web interface.  

The system consists of a frontend web page and a backend server that exposes APIs for product and category data.  
The application will be deployed on AWS using Terraform-managed infrastructure.


## Deployment

This project was deployed to an AWS EC2 instance provisioned using Terraform in the AWS Academy Learner Lab.

Deployment was performed using the provided `deploy.sh` script, which automates the following steps:

1. Packages the application source code into a compressed archive, excluding infrastructure files, Git metadata, and `node_modules`.
2. Copies the archive to the EC2 instance using `scp`.
3. Connects to the EC2 instance via SSH.
4. Stops any previously running Node.js server.
5. Removes the existing deployed application.
6. Extracts the new application version on the EC2 instance.
7. Installs backend dependencies using `npm install`.
8. Starts the Node.js server in the background.

The application was verified by accessing it via the EC2 public IP and application port while the instance was running.  
After verification, the EC2 instance was stopped to avoid AWS Academy Lab charges.

Deployment verification was performed by accessing the application via the EC2 public IP and application port while the instance was running.

### Deployment Script Configuration

The `deploy.sh` script is parameterized using environment variables to allow it to be run in different AWS Academy Learner Lab environments. The script expects the following environment variables to be set prior to execution:

- `EC2_PUBLIC_IP`: The public IP address of the target EC2 instance.
- `SSH_KEY_PATH`: The path to the SSH private key used to connect to the instance.

This allows graders to run the deployment script using their own EC2 instances and SSH keys without modifying the script itself!


