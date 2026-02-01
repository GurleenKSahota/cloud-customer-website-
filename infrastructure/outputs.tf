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
