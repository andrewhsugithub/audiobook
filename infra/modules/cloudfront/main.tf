# localstack doesn't support fetching managed cache policies by name
# data "aws_cloudfront_cache_policy" "caching_optimized" {
#   name = "Managed-CachingOptimized"
# }

# data "aws_cloudfront_cache_policy" "caching_disabled" {
#   name = "Managed-CachingDisabled"
# }

# hardcode for now
locals {
  managed_caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6" # For static assets
  managed_caching_disabled  = "4135ea2d-6df8-444d-ad3d-6baf0f75727b" # For dynamic playlists 
}

resource "aws_cloudfront_origin_access_control" "oac" {
  for_each                          = toset(var.env)
  name                              = "${var.app_name}-oac-${each.key}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# localstack doesn't support this yet
resource "aws_cloudfront_public_key" "signing_key" {
  count       = var.is_localstack ? 0 : 1
  name        = "${var.app_name}-key"
  comment     = "Verification asset for cookie engines"
  encoded_key = file(var.public_key_path)
}

# localstack doesn't support this yet
resource "aws_cloudfront_key_group" "auth_group" {
  count = var.is_localstack ? 0 : 1
  name  = "${var.app_name}-secure-group"
  items = [aws_cloudfront_public_key.signing_key[0].id]
}

resource "aws_cloudfront_distribution" "cdn" {
  for_each = toset(var.env)

  enabled         = true
  is_ipv6_enabled = true

  origin {
    domain_name              = var.media_bucket_regional_domains[each.key]
    origin_id                = "S3-MediaStorage-${each.key}"
    origin_access_control_id = aws_cloudfront_origin_access_control.oac[each.key].id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https" # Required fallback string wrapper configuration for local container mappings
    cache_policy_id        = local.managed_caching_optimized
  }

  # public cache
  ordered_cache_behavior {
    path_pattern           = "/system-voices/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https"
    cache_policy_id        = local.managed_caching_optimized
  }

  # public cache
  ordered_cache_behavior {
    path_pattern           = "/covers/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https"
    cache_policy_id        = local.managed_caching_optimized
  }

  # private => need signed cookies
  ordered_cache_behavior {
    path_pattern           = "/custom-voices/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https"
    trusted_key_groups     = var.is_localstack ? [] : [aws_cloudfront_key_group.auth_group[0].id]
    cache_policy_id        = local.managed_caching_optimized
  }

  # private => need signed cookies, don't cache playlists (they get regenerated)
  ordered_cache_behavior {
    path_pattern           = "/audiobooks/*/audiobook.m3u8"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https"
    trusted_key_groups     = var.is_localstack ? [] : [aws_cloudfront_key_group.auth_group[0].id]
    cache_policy_id        = local.managed_caching_disabled
  }

  # private => need signed cookies, don't cache playlists (they get regenerated)
  ordered_cache_behavior {
    path_pattern           = "/audiobooks/*/chapters/*/index.m3u8"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https"
    trusted_key_groups     = var.is_localstack ? [] : [aws_cloudfront_key_group.auth_group[0].id]
    cache_policy_id        = local.managed_caching_disabled
  }

  # private => need signed cookies, audio segments can be cached for a long time since they are immutable, and we want to minimize S3 requests for them
  ordered_cache_behavior {
    path_pattern           = "/audiobooks/*/chapters/*/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https"
    trusted_key_groups     = var.is_localstack ? [] : [aws_cloudfront_key_group.auth_group[0].id]
    cache_policy_id        = local.managed_caching_optimized
  }

  # private => need signed cookies, for metadata or vtt files or other files
  ordered_cache_behavior {
    path_pattern           = "/audiobooks/*"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-MediaStorage-${each.key}"
    viewer_protocol_policy = each.key == "dev" ? "allow-all" : "redirect-to-https"
    trusted_key_groups     = var.is_localstack ? [] : [aws_cloudfront_key_group.auth_group[0].id]
    cache_policy_id        = local.managed_caching_optimized
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = each.key == "dev" ? true : false
    acm_certificate_arn            = each.key == "dev" ? null : null # Placeholder for future ACM cert ARN when we add prod environment
    ssl_support_method             = each.key == "dev" ? null : "sni-only"
    minimum_protocol_version       = each.key == "dev" ? "TLSv1" : "TLSv1.2_2021"
  }
}

resource "aws_s3_bucket_policy" "media_access_policy" {
  for_each = toset(var.env)
  bucket   = var.media_bucket_ids[each.key]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AllowCloudFrontOACRead"
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${var.media_bucket_arns[each.key]}/*"
      Condition = {
        StringEquals = {
          "AWS:SourceArn" = aws_cloudfront_distribution.cdn[each.key].arn
        }
      }
    }]
  })
}
