provider "aws" {
  region                      = "ap-east-2"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3 = "http://localhost:4566"
  }
}

module "s3" {
  source       = "../../modules/s3"
  app_name     = "audiobook"
  env          = "local"
  cors_origins = ["http://localhost:3000"]
}

locals {
  mime_types = {
    ".mp3" = "audio/mpeg"
    ".wav" = "audio/wav"
    ".ogg" = "audio/ogg"
    ".m4a" = "audio/mp4"
  }
}

resource "aws_s3_object" "audio_samples" {
  for_each = fileset("${path.module}/../audio", "*")

  bucket = module.s3.public_bucket_id

  key    = "audio/${each.value}"
  source = "${path.module}/../audio/${each.value}"
  etag   = filemd5("${path.module}/../audio/${each.value}")

  # This tells browsers to play the audio, rather than forcing a download
  content_type = lookup(local.mime_types, regex("\\.[^.]+$", each.value), "application/octet-stream")
}
