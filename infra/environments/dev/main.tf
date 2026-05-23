provider "aws" {
  region = "us-east-1"

  # localstack only
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  # localstack only
  endpoints {
    s3         = "http://localhost:4566"
    cloudfront = "http://localhost:4566"
  }
}

locals {
  app_name     = "my-audiobook"
  environments = ["dev"] # easily extendable to ["dev", "staging", "prod"] later
  cors_origins = [
    "http://localhost:5173",       # frontend server
    "https://app.localstack.cloud" # localstack web UI  
  ]

  mime_types = {
    ".mp3"  = "audio/mpeg"
    ".wav"  = "audio/wav"
    ".ogg"  = "audio/ogg"
    ".m4a"  = "audio/mp4"
    ".m4s"  = "audio/mp4"
    ".fmp4" = "audio/mp4"
  }
}

module "s3" {
  source       = "../../modules/s3"
  app_name     = local.app_name
  env          = local.environments
  cors_origins = local.cors_origins
}

module "cloudfront" {
  source                        = "../../modules/cloudfront"
  app_name                      = local.app_name
  env                           = local.environments
  public_key_path               = "${path.module}/public_key.pem"
  media_bucket_ids              = module.s3.media_bucket_ids
  media_bucket_arns             = module.s3.media_bucket_arns
  media_bucket_regional_domains = module.s3.media_bucket_regional_domains
}

# seed voice samples to public bucket
resource "aws_s3_object" "voice_samples" {
  for_each = fileset("${path.module}/../../../voices", "*")

  bucket = module.s3.media_bucket_ids["dev"]
  key    = "system-voices/${each.value}"
  source = "${path.module}/../../../voices/${each.value}"
  etag   = filemd5("${path.module}/../../../voices/${each.value}")

  # This tells browsers to play the audio, rather than forcing a download
  content_type = lookup(local.mime_types, regex("\\.[^.]+$", each.value), "application/octet-stream")
}
