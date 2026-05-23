resource "aws_s3_bucket" "media" {
  for_each = toset(var.env)
  bucket   = "${var.app_name}-media-${each.key}"
}

# for documentation, this is set by default
resource "aws_s3_bucket_public_access_block" "media" {
  for_each                = aws_s3_bucket.media
  bucket                  = each.value.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}

# for documentation, this is set by default
resource "aws_s3_bucket_server_side_encryption_configuration" "media" {
  for_each = aws_s3_bucket.media
  bucket   = each.value.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "media" {
  for_each = aws_s3_bucket.media
  bucket   = each.value.id

  rule {
    id     = "cleanup-dev-covers"
    status = each.key == "dev" ? "Enabled" : "Disabled"
    filter { prefix = "covers/" }
    expiration { days = 1 }
  }

  rule {
    id     = "cleanup-dev-custom-voices"
    status = each.key == "dev" ? "Enabled" : "Disabled"
    filter { prefix = "custom-voices/" }
    expiration { days = 1 }
  }

  rule {
    id     = "cleanup-dev-audiobooks"
    status = each.key == "dev" ? "Enabled" : "Disabled"
    filter { prefix = "audiobooks/" }
    expiration { days = 1 }
  }
}

resource "aws_s3_bucket_cors_configuration" "media" {
  for_each = toset(var.env)
  bucket   = aws_s3_bucket.media[each.key].id

  cors_rule {
    allowed_origins = var.cors_origins
    allowed_methods = ["PUT", "POST", "GET"]
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
