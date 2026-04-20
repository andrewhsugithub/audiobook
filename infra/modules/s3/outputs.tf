output "private_bucket_id" {
  value = aws_s3_bucket.private.id
}

output "public_bucket_id" {
  value = aws_s3_bucket.public.id
}

output "private_bucket_arn" {
  value = aws_s3_bucket.private.arn
}
