# ============================================================
# POS (Point of Sale) API — EC2 + API Gateway + API Key
# ============================================================

# --- Security Group for POS EC2 ---

resource "aws_security_group" "pos_sg" {
  name        = "pos-service-sg"
  description = "Security group for POS inventory service EC2"
  vpc_id      = data.aws_vpc.default.id

  # SSH access
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # POS service port (API Gateway and health checks)
  ingress {
    description = "POS Service"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Allow all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "pos-service-sg"
  }
}




# --- POS EC2 Instance ---

resource "aws_instance" "pos_server" {
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type
  key_name      = var.key_pair_name

  vpc_security_group_ids = [aws_security_group.pos_sg.id]

  root_block_device {
    volume_size = 30
    volume_type = "gp3"
  }

  user_data = templatefile("${path.module}/pos_user_data.sh", {
    db_host     = aws_db_instance.postgres.address
    db_port     = aws_db_instance.postgres.port
    db_name     = var.db_name
    db_username = var.db_username
    db_password = var.db_password
  })

  depends_on = [aws_db_instance.postgres]

  tags = {
    Name = "hw3-pos-service"
  }
}

# --- API Gateway REST API ---

resource "aws_api_gateway_rest_api" "pos_api" {
  name        = "pos-api"
  description = "Point of Sale API for inventory management"
}

# /inventory
resource "aws_api_gateway_resource" "inventory" {
  rest_api_id = aws_api_gateway_rest_api.pos_api.id
  parent_id   = aws_api_gateway_rest_api.pos_api.root_resource_id
  path_part   = "inventory"
}

# /inventory/check — GET
resource "aws_api_gateway_resource" "check" {
  rest_api_id = aws_api_gateway_rest_api.pos_api.id
  parent_id   = aws_api_gateway_resource.inventory.id
  path_part   = "check"
}

resource "aws_api_gateway_method" "check_get" {
  rest_api_id      = aws_api_gateway_rest_api.pos_api.id
  resource_id      = aws_api_gateway_resource.check.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "check_get" {
  rest_api_id             = aws_api_gateway_rest_api.pos_api.id
  resource_id             = aws_api_gateway_resource.check.id
  http_method             = aws_api_gateway_method.check_get.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "GET"
  uri                     = "http://${aws_instance.pos_server.public_ip}:3001/inventory/check"
}

# /inventory/price — GET
resource "aws_api_gateway_resource" "price" {
  rest_api_id = aws_api_gateway_rest_api.pos_api.id
  parent_id   = aws_api_gateway_resource.inventory.id
  path_part   = "price"
}

resource "aws_api_gateway_method" "price_get" {
  rest_api_id      = aws_api_gateway_rest_api.pos_api.id
  resource_id      = aws_api_gateway_resource.price.id
  http_method      = "GET"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "price_get" {
  rest_api_id             = aws_api_gateway_rest_api.pos_api.id
  resource_id             = aws_api_gateway_resource.price.id
  http_method             = aws_api_gateway_method.price_get.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "GET"
  uri                     = "http://${aws_instance.pos_server.public_ip}:3001/inventory/price"
}

# /inventory/deduct — POST
resource "aws_api_gateway_resource" "deduct" {
  rest_api_id = aws_api_gateway_rest_api.pos_api.id
  parent_id   = aws_api_gateway_resource.inventory.id
  path_part   = "deduct"
}

resource "aws_api_gateway_method" "deduct_post" {
  rest_api_id      = aws_api_gateway_rest_api.pos_api.id
  resource_id      = aws_api_gateway_resource.deduct.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "deduct_post" {
  rest_api_id             = aws_api_gateway_rest_api.pos_api.id
  resource_id             = aws_api_gateway_resource.deduct.id
  http_method             = aws_api_gateway_method.deduct_post.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "POST"
  uri                     = "http://${aws_instance.pos_server.public_ip}:3001/inventory/deduct"
}

# /inventory/deduct-batch — POST
resource "aws_api_gateway_resource" "deduct_batch" {
  rest_api_id = aws_api_gateway_rest_api.pos_api.id
  parent_id   = aws_api_gateway_resource.inventory.id
  path_part   = "deduct-batch"
}

resource "aws_api_gateway_method" "deduct_batch_post" {
  rest_api_id      = aws_api_gateway_rest_api.pos_api.id
  resource_id      = aws_api_gateway_resource.deduct_batch.id
  http_method      = "POST"
  authorization    = "NONE"
  api_key_required = true
}

resource "aws_api_gateway_integration" "deduct_batch_post" {
  rest_api_id             = aws_api_gateway_rest_api.pos_api.id
  resource_id             = aws_api_gateway_resource.deduct_batch.id
  http_method             = aws_api_gateway_method.deduct_batch_post.http_method
  type                    = "HTTP_PROXY"
  integration_http_method = "POST"
  uri                     = "http://${aws_instance.pos_server.public_ip}:3001/inventory/deduct-batch"
}

# --- Deployment & Stage ---

resource "aws_api_gateway_deployment" "pos_deployment" {
  rest_api_id = aws_api_gateway_rest_api.pos_api.id

  # Redeploy when any route or integration changes
  triggers = {
    redeployment = sha1(jsonencode([
      aws_api_gateway_method.check_get,
      aws_api_gateway_method.price_get,
      aws_api_gateway_method.deduct_post,
      aws_api_gateway_method.deduct_batch_post,
      aws_api_gateway_integration.check_get,
      aws_api_gateway_integration.price_get,
      aws_api_gateway_integration.deduct_post,
      aws_api_gateway_integration.deduct_batch_post,
    ]))
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "prod" {
  deployment_id = aws_api_gateway_deployment.pos_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.pos_api.id
  stage_name    = "prod"
}

# --- API Key & Usage Plan ---

resource "aws_api_gateway_api_key" "pos_key" {
  name    = "pos-api-key"
  enabled = true
}

resource "aws_api_gateway_usage_plan" "pos_plan" {
  name = "pos-usage-plan"

  api_stages {
    api_id = aws_api_gateway_rest_api.pos_api.id
    stage  = aws_api_gateway_stage.prod.stage_name
  }
}

resource "aws_api_gateway_usage_plan_key" "pos_plan_key" {
  key_id        = aws_api_gateway_api_key.pos_key.id
  key_type      = "API_KEY"
  usage_plan_id = aws_api_gateway_usage_plan.pos_plan.id
}
