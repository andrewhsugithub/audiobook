resource "aws_s3_bucket" "raw_uploads" {
  for_each = toset(var.env)
  bucket   = "${var.app_name}-raw-uploads-${each.key}"
}

# for documentation, this is set by default
resource "aws_s3_bucket_public_access_block" "raw_uploads" {
  for_each                = aws_s3_bucket.raw_uploads
  bucket                  = each.value.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# for documentation, this is set by default
resource "aws_s3_bucket_server_side_encryption_configuration" "raw_uploads" {
  for_each = aws_s3_bucket.raw_uploads
  bucket   = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "raw_uploads" {
  for_each = aws_s3_bucket.raw_uploads
  bucket   = each.value.id

  rule {
    id     = "cleanup-dev-raw-uploads"
    status = each.key == "dev" ? "Enabled" : "Disabled"
    filter { prefix = "raw-uploads/" }
    expiration { days = 1 }
  }
}

resource "aws_s3_bucket_cors_configuration" "raw_uploads" {
  for_each = toset(var.env)
  bucket   = aws_s3_bucket.raw_uploads[each.key].id

  cors_rule {
    allowed_origins = var.cors_origins
    allowed_methods = ["PUT", "POST", "GET"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
