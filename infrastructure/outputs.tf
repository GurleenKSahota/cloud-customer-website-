output "db_endpoint" {
  value = aws_db_instance.postgres.endpoint
  description = "RDS PostgreSQL endpoint"
}

output "db_address" {
  value = aws_db_instance.postgres.address
  description = "RDS PostgreSQL address (hostname only)"
}

output "db_port" {
  value = aws_db_instance.postgres.port
  description = "RDS PostgreSQL port"
}

output "ec2_public_ip" {
  value       = aws_instance.web_server.public_ip
  description = "Public IP address of the EC2 instance"
}

output "ec2_public_dns" {
  value       = aws_instance.web_server.public_dns
  description = "Public DNS name of the EC2 instance"
}

output "website_url" {
  value       = "http://${aws_instance.web_server.public_ip}:3000"
  description = "URL to access the website"
}

# --- POS API Outputs ---

output "pos_api_url" {
  value       = "${aws_api_gateway_stage.prod.invoke_url}/inventory"
  description = "Base URL for POS API inventory endpoints"
}

output "pos_api_key_id" {
  value       = aws_api_gateway_api_key.pos_key.id
  description = "API Key ID (use AWS CLI to get the value)"
}

output "pos_api_key_value" {
  value       = aws_api_gateway_api_key.pos_key.value
  sensitive   = true
  description = "API Key value for POS API authentication"
}

output "pos_ec2_public_ip" {
  value       = aws_instance.pos_server.public_ip
  description = "Public IP address of the POS service EC2 instance"
}
