output "raw_upload_bucket_names" { value = module.s3.raw_upload_bucket_ids }
output "media_bucket_names" { value = module.s3.media_bucket_ids }
output "cloudfront_endpoints" {
  value = { for k, v in module.cloudfront.cloudfront_distributions : k => "http://localhost:4566/dist/${v}" }
}
