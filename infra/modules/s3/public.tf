
resource "aws_s3_bucket" "public" {
  for_each = toset(var.env)
  bucket   = "${var.app_name}-${each.key}-public"
}

resource "aws_s3_bucket_public_access_block" "public" {
  for_each                = aws_s3_bucket.public
  bucket                  = each.value.id
  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "public" {
  for_each = aws_s3_bucket.public
  bucket   = each.value.id

  depends_on = [aws_s3_bucket_public_access_block.public]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.public[each.key].arn}/*"
    }]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "public" {
  for_each = aws_s3_bucket.public
  bucket   = each.value.id

  rule {
    id     = "cleanup-all-objects"
    status = each.key == "test" ? "Enabled" : "Disabled"
    filter { prefix = "" }
    expiration { days = 1 }
  }
}
