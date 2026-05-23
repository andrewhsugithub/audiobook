output "media_bucket_ids" { value = { for k, v in aws_s3_bucket.media : k => v.id } }
output "media_bucket_arns" { value = { for k, v in aws_s3_bucket.media : k => v.arn } }
output "media_bucket_regional_domains" { value = { for k, v in aws_s3_bucket.media : k => v.bucket_regional_domain_name } }
output "raw_upload_bucket_ids" { value = { for k, v in aws_s3_bucket.raw_uploads : k => v.id } }
