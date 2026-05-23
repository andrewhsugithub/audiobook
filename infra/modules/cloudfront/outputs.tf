output "cloudfront_distributions" {
  value = { for k, v in aws_cloudfront_distribution.cdn : k => v.id }
}
