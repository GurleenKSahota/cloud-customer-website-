# ============================================================
# Internal Employee Website — Cognito + EC2
# ============================================================

# --- Cognito User Pool (no self-registration) ---

resource "aws_cognito_user_pool" "employees" {
  name = "employee-pool"

  # Disable self-registration
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  # Password policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  # Use email as the primary attribute
  auto_verified_attributes = ["email"]

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  tags = {
    Name = "employee-cognito-pool"
  }
}

resource "aws_cognito_user_pool_client" "internal_website" {
  name         = "internal-website-client"
  user_pool_id = aws_cognito_user_pool.employees.id

  # Enable USER_PASSWORD_AUTH for direct login from the browser
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # No secret for browser-based clients
  generate_secret = false
}

# --- Security Group for Internal Website EC2 ---

resource "aws_security_group" "internal_sg" {
  name        = "internal-website-sg"
  description = "Security group for internal employee website"
  vpc_id      = data.aws_vpc.default.id

  # SSH access
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Internal website access — restricted to allowed IPs
  ingress {
    description = "Internal Website"
    from_port   = 3002
    to_port     = 3002
    protocol    = "tcp"
    cidr_blocks = var.allowed_internal_cidrs
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "internal-website-sg"
  }
}

# --- Internal Website EC2 Instance ---

resource "aws_instance" "internal_server" {
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type
  key_name      = var.key_pair_name

  vpc_security_group_ids = [aws_security_group.internal_sg.id]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/internal_user_data.sh", {
    db_host            = aws_db_instance.postgres.address
    db_port            = aws_db_instance.postgres.port
    db_name            = var.db_name
    db_username        = var.db_username
    db_password        = var.db_password
    cognito_user_pool_id = aws_cognito_user_pool.employees.id
    cognito_client_id    = aws_cognito_user_pool_client.internal_website.id
    aws_region           = var.aws_region
  })

  depends_on = [aws_db_instance.postgres, aws_cognito_user_pool.employees]

  tags = {
    Name = "hw4-internal-website"
  }
}
