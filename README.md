# Customer Website

This project implements a customer-facing product catalog website for a grocery store.  
Customers can browse products and filter them by category using a web interface.  

The system consists of a frontend web page and a backend server that exposes APIs for product and category data.  
The application will be deployed on AWS using Terraform-managed infrastructure.


## Deployment

This project was deployed to an AWS EC2 instance provisioned using Terraform in the AWS Academy Learner Lab.

### For Graders: How to Deploy

Use the `deploy.sh` script in the project root. Set environment variables with your EC2 instance details:

```bash
# Set your environment variables
export EC2_PUBLIC_IP=<your-ec2-public-ip>
export SSH_KEY_PATH=<path-to-your-key.pem>

# Example:
# export EC2_PUBLIC_IP=54.123.45.67
# export SSH_KEY_PATH=~/.ssh/labsuser.pem

# Run deployment
./deploy.sh
```

**What the script does:**
1. Packages the application source code into a compressed archive, excluding infrastructure files, Git metadata, and `node_modules`.
2. Copies the archive to the EC2 instance using `scp`.
3. Connects to the EC2 instance via SSH.
4. Stops any previously running Node.js server.
5. Removes the existing deployed application.
6. Extracts the new application version on the EC2 instance.
7. Installs backend dependencies using `npm install`.
8. Sets up and populates the database with sample data.
9. Starts the Node.js server in the background.

### Deployment Verification

The application was verified by accessing it via the EC2 public IP and application port (3000) while the instance was running:
- Browse products at: `http://<EC2_IP>:3000`
- Select a store to see inventory availability
- View products on sale with discounted prices

After verification, the EC2 instance was stopped to avoid AWS Academy Lab charges.


