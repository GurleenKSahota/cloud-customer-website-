terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}


# EC2 instance for the web server
resource "aws_instance" "web" {
  ami = "ami-04b4f1a9cf54c11d0"
  instance_type = var.instance_type
  key_name = var.key_pair_name

  tags = {
    Name = "customer-website-ec2"
  }
}

output "instance_id" {
  value = aws_instance.web.id
}

output "public_ip" {
  value = aws_instance.web.public_ip
}
