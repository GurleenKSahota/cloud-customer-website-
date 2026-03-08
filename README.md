# Farmer's Market — Employee Portal (HW5)

An internal employee website for managing grocery store inventory with report scheduling, secured with AWS Cognito authentication. Includes a POS API, customer website, traffic generator, and restocking tools.

## Tech Stack
- **Internal Website**: Node.js + Express, HTML/CSS/JS (EC2, port 3002) + Cognito auth + node-cron scheduler
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
- **python3** — used by the traffic generator to parse JSON responses

Configure AWS credentials before running any commands:
```bash
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
export AWS_SESSION_TOKEN=<your-token>
```

---

## Step 1: Provision Infrastructure

Provision all AWS resources:

> **Optional:** To restrict the internal website to specific IPs, edit `infrastructure/terraform.tfvars` and set `allowed_internal_cidrs`. By default it allows all IPs (`0.0.0.0/0`), so you can skip this.

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

To view any output while in the project root:
```bash
terraform -chdir=infrastructure output <output_name>
```

*(Note: If you are already inside the `infrastructure/` directory, just run `terraform output <output_name>` without the -chdir flag.)*

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

## Step 4: Traffic Generator

The traffic generator simulates customer purchases by calling the POS deduct API for random products and stores. It runs **locally** on your laptop.

```bash
./traffic-generator.sh [--count N] [--rate R]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--count N` | Number of deduction calls to make | 10 |
| `--rate R` | Calls per second | 1 |

**Examples:**
```bash
# Make 20 deductions at 2 per second
./traffic-generator.sh --count 20 --rate 2

# Make 100 deductions at 5 per second
./traffic-generator.sh --count 100 --rate 5
```

The script reads the API URL and API key from `terraform output` automatically. It fetches the list of in-stock products and randomly picks one for each deduction.

---

## Step 5: Restocking

After running the traffic generator, your inventory may be depleted. The restocking script adds quantity to all inventory items. It runs **locally** on your laptop.

```bash
./restock.sh [--amount N] [--store STORE_ID]
```

| Option | Description | Default |
|--------|-------------|---------|
| `--amount N` | Quantity to add to each item | 50 |
| `--store ID` | Optional: restock only a specific store | all stores |

**Examples:**
```bash
# Restock all stores with +50 per item
./restock.sh

# Restock store 1 only with +100 per item
./restock.sh --amount 100 --store 1
```

The script reads the API URL and API key from `terraform output` automatically.

---

## Step 6: Access the Internal Website & Report Scheduling

1. Get the internal website URL:
   ```bash
   terraform -chdir=infrastructure output internal_website_url
   ```

2. Open that URL in your browser and log in with the credentials from Step 3.

3. The portal has two tabs:
   - **Inventory**: Select a store and manage its products (edit quantity, add, remove)
   - **Reports**: Schedule and view sales reports

### Scheduling Reports

In the Reports tab:
1. Choose the **Lookback Window** (previous hour, day, or week)
2. Choose the **Report Frequency** (every minute, hour, or day)
3. Optionally filter by **store** or **product category**
4. Click **Create Schedule**

Reports are generated automatically at the specified frequency. Each report is a CSV file containing:
- Product barcode
- Product name
- Total quantity deducted during the lookback window
- Total revenue (calculated using the price at the time of each deduction, including sale discounts)

You can **view reports** inline or **download** them as CSV files. You can also **delete** a schedule, which stops future report generation and removes all previously generated reports for that schedule.
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