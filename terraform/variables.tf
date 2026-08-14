variable "aws_region" {
  type        = string
  description = "AWS deployment region"
  default     = "ap-south-1"
}

variable "environment" {
  type        = string
  description = "Environment identifier (e.g. production, staging)"
  default     = "production"
}

variable "vpc_cidr" {
  type        = string
  description = "CIDR block for the VPC"
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  type        = list(string)
  description = "List of availability zones"
  default     = ["ap-south-1a", "ap-south-1b", "ap-south-1c"]
}

variable "domain_name" {
  type        = string
  description = "Primary domain for the financial advisory platform"
  default     = "wealthgenie.internal"
}

variable "db_instance_class" {
  type        = string
  description = "Instance class for DocumentDB cluster instances"
  default     = "db.r6g.large"
}

variable "db_cluster_size" {
  type        = number
  description = "Number of cluster instances for high availability"
  default     = 2
}

variable "db_master_username" {
  type        = string
  description = "Master administrator username for DocumentDB"
  default     = "wealthgenie_admin"
}
