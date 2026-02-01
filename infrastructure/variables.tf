variable "aws_region" {
  type    = string
  default = "us-east-1"

}

variable "project_name" {
  type    = string
  default = "customer-website"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "instance_type" {
  type    = string
  default = "t2.micro"
}

variable "key_pair_name" {
  type = string
}

variable "db_instance_class" {
  type    = string
  default = "db.t3.micro"
  description = "RDS instance class"
}

variable "db_name" {
  type    = string
  default = "customer_website"
  description = "Database name"
}

variable "db_username" {
  type    = string
  default = "dbadmin"
  description = "Database master username"
}

variable "db_password" {
  type      = string
  sensitive = true
  description = "Database master password"
}
