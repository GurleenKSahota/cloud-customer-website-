# Customer Website + Point of Sale API + Internal Employee Portal

A farmer's market grocery website with an external POS API and an internal employee portal for inventory management.

## Tech Stack
- **Customer Website**: Node.js + Express, HTML/CSS/JS, PostgreSQL (EC2, port 3000)
- **POS API**: Node.js + Express (EC2, port 3001) + API Gateway with API key
- **Internal Website**: Node.js + Express, HTML/CSS/JS (EC2, port 3002) + Cognito auth
- **Database**: AWS RDS (PostgreSQL, shared by all services)
- **Authentication**: AWS Cognito User Pool (employee-only, no self-registration)
- **Infrastructure**: Terraform (3 EC2 instances, RDS, API Gateway, Cognito)

---

## Prerequisites

The following must be installed on your local machine:
- **Terraform** — provisions all AWS resources
- **AWS CLI** — needed to create Cognito users
- **Node.js + npm** — used locally only if testing
- **SSH key pair** named `vockey` in your AWS account (download the `.pem` from Learner Lab > AWS Details)

Configure AWS credentials before running any commands:
```bash
export AWS_ACCESS_KEY_ID=<your-key>
export AWS_SECRET_ACCESS_KEY=<your-secret>
export AWS_SESSION_TOKEN=<your-token>
```

---

## Step 1: Provision Infrastructure

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
- **Security Groups** — network access controls

### Key Terraform Outputs

| Output | Description |
|--------|-------------|
| `website_url` | Customer-facing website URL |
| `pos_api_url` | POS API base URL |
| `internal_website_url` | Internal employee website URL |
| `cognito_user_pool_id` | Cognito User Pool ID |
| `cognito_client_id` | Cognito Client ID |

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

This deploys **all three** services in one command:
1. Customer Website -> EC2 #1 (installs deps, seeds database, starts server on port 3000)
2. POS Service -> EC2 #2 (installs deps, starts server on port 3001)
3. Internal Website -> EC2 #3 (installs deps, configures Cognito, starts server on port 3002)

After deployment, the script prints all URLs.

---

## Step 3: Create a Cognito User

The internal website requires Cognito authentication. Since self-registration is disabled, create users with the provided script:

```bash
./create-user.sh user@example.com
```

Or with an optional username:
```bash
./create-user.sh user@example.com --username johndoe
```

The script will output a **temporary password**. On first login, the user will be prompted to set a new password.

---

## Step 4: Access the Internal Website

1. Get the internal website URL:
   ```bash
   terraform -chdir=infrastructure output internal_website_url
   ```

2. Open the URL in your browser.

3. Log in with the email and temporary password from Step 3.

4. You will be prompted to set a new password on first login.

5. After login, you can:
   - **Select a store** from the dropdown
   - **View inventory** — see all products stocked at that store
   - **Edit quantity** — change the stock quantity (must be ≥ 0)
   - **Add a product** — add a product from the catalog that isn't yet stocked
   - **Remove a product** — remove a product from the store's inventory

---

## Step 5: Test the POS API

```bash
./sample-client.sh
```

Runs 10 requests against the POS API:
- 8 functional tests (2 per endpoint) — all should show `PASSED`
- 2 edge case tests (no API key, over-deduct) — both should show `PASSED`

---

## IP Restriction (Internal Website)

The internal website's security group restricts access to specific IP addresses. To configure allowed IPs, update `infrastructure/terraform.tfvars`:

```hcl
allowed_internal_cidrs = ["203.0.113.0/32", "198.51.100.0/32"]
```

By default, it allows all IPs (`0.0.0.0/0`). After changing, run `terraform apply` to update the security group.

---

## Repeatability

To prove the deployment is repeatable:

```bash
cd infrastructure
terraform destroy          # tear down everything
terraform init && terraform apply  # recreate from scratch
cd ..
SSH_KEY_PATH=/path/to/labsuser.pem ./deploy.sh
./create-user.sh grader@example.com
./sample-client.sh         # all tests should pass again
```

---

## POS API Endpoints

All endpoints require the `x-api-key` header. Base URL is printed by the deploy script, or run:
```bash
terraform -chdir=infrastructure output -raw pos_api_url
```

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/inventory/check?storeId=&barcode=&quantity=` | GET | Check if a store has at least N of a product |
| `/inventory/price?storeId=&barcode=` | GET | Get product price with any active sales applied |
| `/inventory/deduct` | POST | Deduct quantity of one product from a store |
| `/inventory/deduct-batch` | POST | Deduct multiple products from a store (atomic) |

**Deduct single** request body:
```json
{"storeId": 1, "barcode": "123456789", "quantity": 2}
```

**Deduct batch** request body:
```json
{"storeId": 1, "items": [{"barcode": "123456789", "quantity": 2}, {"barcode": "4011", "quantity": 1}]}
```

Business rules:
- Deductions fail if inventory would go negative (returns 409)
- Batch deductions are atomic — if any item fails, the entire batch is rolled back

---

## Customer Website Endpoints

**Base URL:** `http://<EC2_IP>:3000` (from `terraform -chdir=infrastructure output website_url`)

| Endpoint | Description |
|----------|-------------|
| `GET /categories` | Product category tree |
| `GET /products` | Products with optional filters (`?primary=Produce`) |
| `GET /stores` | All store locations |
| `GET /inventory/:storeId` | Inventory for a specific store |
| `GET /sales` | Active sales with discount details |

Inventory changes made through the POS API or internal website are reflected on the customer website in real time.

---

## Cleanup

To stop incurring costs, destroy all resources:
```bash
cd infrastructure
terraform destroy
```

---

## Thank You

Thank you for reviewing this project!