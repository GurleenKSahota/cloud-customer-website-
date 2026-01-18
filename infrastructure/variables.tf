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
