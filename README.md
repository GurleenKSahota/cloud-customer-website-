# Customer Website + Point of Sale API

A farmer's market grocery website with an external POS API for inventory management.

## Tech Stack
- **Website**: Node.js + Express, HTML/CSS/JS, PostgreSQL (runs on EC2, port 3000)
- **POS API**: Node.js + Express (runs on a separate EC2, port 3001)
- **API Gateway**: AWS API Gateway with API key protection (proxies to POS EC2)
- **Database**: AWS RDS (PostgreSQL, shared by both services)
- **Infrastructure**: Terraform (2 EC2 instances, RDS, API Gateway)

---

## Prerequisites

The following must be installed on your local machine:
- **Terraform** — provisions all AWS resources
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
- **RDS** — PostgreSQL database (shared by both services)
- **API Gateway** — public-facing REST API with API key enforcement
- **Security Groups** — network access controls

---

## Step 2: Deploy

Wait 2-3 minutes after `terraform apply` for the EC2 instances to finish bootstrapping, then from the project root:

```bash
SSH_KEY_PATH=/path/to/labsuser.pem ./deploy.sh
```

This deploys **both** services in one command:
1. Website -> EC2 #1 (installs deps, seeds database, starts server on port 3000)
2. POS Service -> EC2 #2 (installs deps, starts server on port 3001)

After deployment, the script prints the website URL and POS API URL.

---

## Step 3: Test the POS API

```bash
./sample-client.sh
```

Runs 10 requests against the POS API:
- 8 functional tests (2 per endpoint) — all should show `PASSED`
- 2 edge case tests (no API key, over-deduct) — both should show `PASSED`

The API URL and API key are automatically retrieved from Terraform outputs.

---

## Repeatability

To prove the deployment is repeatable:

```bash
cd infrastructure
terraform destroy          # tear down everything
terraform init && terraform apply  # recreate from scratch
cd ..
SSH_KEY_PATH=/path/to/labsuser.pem ./deploy.sh
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

## Website Endpoints

**Base URL:** `http://<EC2_IP>:3000` (printed by deploy script)

| Endpoint | Description |
|----------|-------------|
| `GET /categories` | Product category tree |
| `GET /products` | Products with optional filters (`?primary=Produce`) |
| `GET /stores` | All store locations |
| `GET /inventory/:storeId` | Inventory for a specific store |

Inventory changes made through the POS API are reflected on the website in real time.

---

## Retrieving the API Key

```bash
terraform -chdir=infrastructure output -raw pos_api_key_value
```

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