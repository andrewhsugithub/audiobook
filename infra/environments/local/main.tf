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
    s3 = "http://localhost:4566"
  }
}

module "s3" {
  source   = "../../modules/s3"
  app_name = "audiobook"
  env      = ["local", "test"] # add prod in the future
  cors_origins = [
    "http://localhost:5173",       # frontend server
    "https://app.localstack.cloud" # localstack web UI
  ]
}

locals {
  mime_types = {
    ".mp3" = "audio/mpeg"
    ".wav" = "audio/wav"
    ".ogg" = "audio/ogg"
    ".m4a" = "audio/mp4"
  }
}

# seed voice samples to public bucket
resource "aws_s3_object" "voice_samples" {
  for_each = fileset("${path.module}/../voices", "*")

  bucket = module.s3.public_bucket_ids["local"]

  key    = "voices/${each.value}"
  source = "${path.module}/../voices/${each.value}"
  etag   = filemd5("${path.module}/../voices/${each.value}")

  # This tells browsers to play the audio, rather than forcing a download
  content_type = lookup(local.mime_types, regex("\\.[^.]+$", each.value), "application/octet-stream")
}
