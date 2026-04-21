output "private_bucket_ids" {
  value = { for k, v in aws_s3_bucket.private : k => v.id }
}


output "public_bucket_ids" {
  value = { for k, v in aws_s3_bucket.public : k => v.id }
}

output "private_bucket_arns" {
  value = { for k, v in aws_s3_bucket.private : k => v.arn }
}
