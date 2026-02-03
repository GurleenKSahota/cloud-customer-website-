# Customer Website

A grocery store website where customers can browse products, filter by category, and check inventory at different stores.

## Tech Stack
- **Frontend**: HTML, CSS, JavaScript
- **Backend**: Node.js + Express
- **Database**: PostgreSQL
- **Infrastructure**: AWS EC2 + RDS (Terraform)

----------------

## Local Setup

**Prerequisites:**
- **Node.js:**
   - macOS: `brew install node`
   - Ubuntu: `sudo apt-get install nodejs npm`
   - Or download from [nodejs.org](https://nodejs.org/en/download/)
- **PostgreSQL:**
   - macOS: `brew install postgresql`
   - Ubuntu: `sudo apt-get install postgresql postgresql-contrib`
   - Or download from [postgresql.org](https://www.postgresql.org/download/)
   - **Note:** During PostgreSQL installation, you will be prompted to set a username and password. Remember these for the steps below.

**Steps:**
1. Export your local PostgreSQL credentials (use your own username and password):
   ```bash
   export DB_HOST=localhost
   export DB_NAME=customer_website
   export DB_USER=your_local_pg_username
   export DB_PASSWORD=your_local_pg_password
   ```

**Environment Variable Quick Reference:**
- `DB_HOST`: Usually `localhost` for local development. If unsure, use `localhost`.
- `DB_NAME`: The name of your database, e.g., `customer_website`. If unsure, use `customer_website` (the setup script will create it).
- `DB_USER`: Your local PostgreSQL username. If unsure, try your system username (run `whoami` in terminal) or `postgres`. If you get an error, see troubleshooting below.
- `DB_PASSWORD`: The password for your PostgreSQL user. If unsure, try leaving it blank by setting `DB_PASSWORD=''` (empty quotes), or set/reset it using `psql` and the `\password` command (see troubleshooting below).

**Troubleshooting: Database Credentials**
- Your username is often your system username or `postgres`.
- If you don’t remember your password, try leaving `DB_PASSWORD` blank or use your computer login password.
- If you get an authentication error:
   1. Open a terminal and run: `psql -U postgres` (or your system username).
   2. To set a password: `\password postgres`
   3. Or, create a new user: `CREATE USER myuser WITH PASSWORD 'mypassword';`
- If you use pgAdmin, check your connection settings for your username and password.
 - **Tip:** If you see “role 'postgres' does not exist,” set `DB_USER=$(whoami)` and try again.


2. Install dependencies and populate database:
   ```bash
   cd customer-website  # If not already in the server directory
   cd server
   npm install
   node database/populate.js
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open browser: `http://localhost:3000`

-------------------

## Deployment

### Prerequisites
- AWS credentials configured (for Terraform):
  ```bash
  export AWS_ACCESS_KEY_ID=<your-key>
  export AWS_SECRET_ACCESS_KEY=<your-secret>
  export AWS_SESSION_TOKEN=<your-token>
  ```
- Terraform installed
- SSH key for EC2 access

### Step 1: Provision Infrastructure
```bash
cd infrastructure
terraform init
terraform apply
```

**Note the outputs from terraform** — after you run `terraform apply`, copy the `ec2_public_ip` value from the output for deployment.

The above applied terraform creates EC2 and RDS instances. Database credentials are auto-configured on EC2 via `user_data.sh`.

### Step 2: Deploy Application
Go back to project root and run the deployment script:
```bash
cd ..
export EC2_PUBLIC_IP=<ec2_public_ip from terraform output>
export SSH_KEY_PATH=<path-to-your-ec2-ssh-key.pem>
# Tip: Use the SSH key you created and downloaded during the “Create Key Pair” step when launching your EC2 instance in AWS Academy. If you don’t have it, you can create a new key pair in the EC2 dashboard and launch a new instance with it. Never share your private key with anyone.
./deploy.sh
```

**What the script does:**
1. Packages the application source code into a compressed archive, excluding infrastructure files, Git metadata, and `node_modules`
2. Copies the archive to the EC2 instance using `scp`
3. Connects to the EC2 instance via SSH
4. Stops any previously running Node.js server
5. Removes the existing deployed application
6. Extracts the new application version on the EC2 instance
7. Installs backend dependencies using `npm install`
8. Sets up and populates the database with sample data
9. Starts the Node.js server in the background

**Access deployed app:** `http://<EC2_IP>:3000`

---

## API Endpoints

**Base URL:** `http://localhost:3000` (local) or `http://<EC2_IP>:3000` (deployed)

| Endpoint | Description | Example |
|----------|-------------|---------|
| `GET /categories` | Get all product categories (tree structure) | `/categories` |
| `GET /products` | Get all products with optional filters | `/products?primary=Produce` |
| `GET /stores` | Get all store locations | `/stores` |
| `GET /inventory/:storeId` | Get inventory for specific store | `/inventory/1` |

**Filter examples:**
- By primary category: `/products?primary=Produce`
- By secondary category: `/products?secondary=Vegetables`
- By multiple categories: `/products?primary=Produce&secondary=Vegetables`

---

## How to Use

1. **Visit the homepage** at `http://localhost:3000` or `http://<EC2_IP>:3000`
2. **Select a store** from the dropdown to see which products are in stock
3. **Filter products** by category using the dropdowns
4. **View sale prices** - discounted items show both original and sale price
5. **Browse products** - each card shows name, price, and stock availability

---

Thank you for checking out my project! Hope you had fun testing it.


