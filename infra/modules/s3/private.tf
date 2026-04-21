resource "aws_s3_bucket" "private" {
  for_each = toset(var.env)
  bucket   = "${var.app_name}-${each.key}-private"
}

# for documentation, this is set by default
resource "aws_s3_bucket_public_access_block" "private" {
  for_each                = aws_s3_bucket.private
  bucket                  = each.value.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# for documentation, this is set by default
resource "aws_s3_bucket_server_side_encryption_configuration" "private" {
  for_each = aws_s3_bucket.private
  bucket   = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "private" {
  for_each = aws_s3_bucket.private
  bucket   = each.value.id

  rule {
    id     = "cleanup-user-objects"
    status = each.key == "test" ? "Disabled" : "Enabled"
    filter { prefix = "users/" }
    expiration { days = 7 }
  }

  rule {
    id     = "cleanup-all-objects"
    status = each.key == "test" ? "Enabled" : "Disabled"
    filter { prefix = "" }
    expiration { days = 1 }
  }
}

resource "aws_s3_bucket_cors_configuration" "private" {
  for_each = aws_s3_bucket.private
  bucket   = each.value.id

  cors_rule {
    allowed_origins = var.cors_origins
    allowed_methods = ["PUT", "GET"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
