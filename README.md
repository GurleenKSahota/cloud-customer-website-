# Customer Website

This project implements a customer-facing product catalog website for a grocery store.  
Customers can browse products and filter them by category using a web interface.  

The system consists of a frontend web page and a backend server that exposes APIs for product and category data.  
The application will be deployed on AWS using Terraform-managed infrastructure.


## Deployment

This project was deployed to an AWS EC2 instance provisioned using Terraform
in the AWS Academy Learner Lab.

A deployment was performed using the provided `deploy.sh` script, which:
- copies the application files to the EC2 instance
- installs dependencies
- stops any previously running server
- starts the Node.js web server

After verifying the application was running via the EC2 public IP,
the instance was stopped to avoid AWS Academy lab charges.
