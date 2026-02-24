# Internal Employee Portal (HW4)

An internal employee website for managing grocery store inventory, secured with AWS Cognito authentication.

## Tech Stack
- **Internal Website**: Node.js + Express, HTML/CSS/JS (EC2, port 3002) + Cognito auth
- **Customer Website**: Node.js + Express (EC2, port 3000)
- **POS API**: Node.js + Express (EC2, port 3001) + API Gateway with API key
- **Database**: AWS RDS (PostgreSQL, shared by all services)
- **Authentication**: AWS Cognito User Pool (employee-only, no self-registration)
- **Infrastructure**: Terraform (3 EC2 instances, RDS, API Gateway, Cognito)

---

## Prerequisites

- **Terraform** — provisions all AWS resources
- **AWS CLI** — needed to create Cognito users
- **SSH key pair** named `vockey` in your AWS account (download the `.pem` from Learner Lab > AWS Details)

Configure AWS credentials before running any commands:
```bash
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
export AWS_SESSION_TOKEN=<your-token>
```

---

## Step 1: Configure IP Restrictions and Provision Infrastructure

The internal website's security group restricts access to specific IP addresses. Before provisioning, update `infrastructure/terraform.tfvars` with the allowed CIDR blocks:

```hcl
allowed_internal_cidrs = ["203.0.113.0/32", "198.51.100.0/32"]
```

By default, it allows all IPs (`0.0.0.0/0`). Replace with your IP(s) to restrict access.

Then provision all infrastructure:

```bash
cd infrastructure
terraform init
terraform apply
```

This creates:
- **EC2 #1** — hosts the customer website (port 3000)
- **EC2 #2** — hosts the POS inventory service (port 3001)
- **EC2 #3** — hosts the internal employee website (port 3002)
- **RDS** — PostgreSQL database (shared by all services)
- **API Gateway** — public-facing REST API with API key enforcement
- **Cognito User Pool** — employee authentication (no self-registration)
- **Security Groups** — network access controls (internal website restricted to allowed IPs)

### Key Terraform Outputs

| Output | Description |
|--------|-------------|
| `internal_website_url` | Internal employee website URL |
| `cognito_user_pool_id` | Cognito User Pool ID |
| `cognito_client_id` | Cognito Client ID |
| `website_url` | Customer-facing website URL |
| `pos_api_url` | POS API base URL |

To view any output:
```bash
terraform -chdir=infrastructure output <output_name>
```

---

## Step 2: Deploy

Wait ~10 minutes after `terraform apply` completes for the EC2 instances to finish bootstrapping, then:

```bash
cd ..
SSH_KEY_PATH=/path/to/labsuser.pem ./deploy.sh
```

The deploy script automatically reads all EC2 IP addresses from `terraform output` (no manual input needed). It deploys all three services:
1. Customer Website -> EC2 #1 (port 3000)
2. POS Service -> EC2 #2 (port 3001)
3. Internal Website -> EC2 #3 (port 3002)

After deployment, the script prints all URLs.

---

## Step 3: Create a Cognito User

The internal website requires Cognito authentication. Self-registration is disabled, so create users with the provided script:

```bash
./create-user.sh user@example.com
```

Or with an optional username:
```bash
./create-user.sh user@example.com --username johndoe
```

The script reads the `cognito_user_pool_id` from `terraform output` automatically and outputs a **temporary password**. On first login, the user will be prompted to set a new password.

---

## Step 4: Access the Internal Website

1. Get the internal website URL from the `internal_website_url` terraform output:
   ```bash
   terraform -chdir=infrastructure output internal_website_url
   ```

2. Open that URL in your browser.

3. Log in with the email and temporary password from Step 3.

4. You will be prompted to set a new password on first login.

5. After login, you can:
   - **Select a store** from the dropdown to view its inventory
   - **Edit quantity** — change the stock quantity of a product (must be ≥ 0)
   - **Add a product** — select a product from the catalog not yet stocked and add it with an initial quantity
   - **Remove a product** — remove a product from the store's inventory

Inventory changes made through the internal website are reflected on the customer website (`website_url` output) in real time. Similarly, changes made through the POS API are visible on both websites, since all services share the same database.

---

## Repeatability

The deployment is fully repeatable:

```bash
cd infrastructure
terraform destroy
terraform init && terraform apply
cd ..
SSH_KEY_PATH=/path/to/labsuser.pem ./deploy.sh
./create-user.sh grader@example.com
```

---

## Cleanup

To stop incurring costs, destroy all resources:
```bash
cd infrastructure
terraform destroy
```