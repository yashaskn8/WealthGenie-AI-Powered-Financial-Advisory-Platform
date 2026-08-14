variable "environment" { type = string }
variable "vpc_id" { type = string }
variable "subnet_ids" { type = list(string) }
variable "db_instance_class" { type = string }
variable "db_cluster_size" { type = number }
variable "master_username" { type = string }
variable "kms_key_arn" { type = string }
variable "app_security_group" { type = string }
