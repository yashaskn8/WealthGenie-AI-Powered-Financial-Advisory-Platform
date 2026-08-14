output "vpc_id" {
  description = "VPC ID where Kubernetes and Database are isolated"
  value       = module.vpc.vpc_id
}

output "database_endpoint" {
  description = "Primary read/write connection endpoint for DocumentDB"
  value       = module.database.cluster_endpoint
}

output "database_reader_endpoint" {
  description = "Read-only replica load-balanced connection endpoint"
  value       = module.database.reader_endpoint
}

output "alb_dns_name" {
  description = "Public DNS hostname of the Application Load Balancer"
  value       = module.alb.alb_dns_name
}

output "acm_certificate_arn" {
  description = "ARN of the provisioned TLS certificate"
  value       = module.dns.certificate_arn
}
