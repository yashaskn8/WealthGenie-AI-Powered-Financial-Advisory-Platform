output "cluster_endpoint" { value = aws_docdb_cluster.docdb.endpoint }
output "reader_endpoint" { value = aws_docdb_cluster.docdb.reader_endpoint }
output "db_security_group_id" { value = aws_security_group.docdb.id }
