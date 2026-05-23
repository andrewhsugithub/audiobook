variable "app_name" { type = string }
variable "env" { type = list(string) }
variable "public_key_path" { type = string }

variable "media_bucket_ids" { type = map(string) }
variable "media_bucket_arns" { type = map(string) }
variable "media_bucket_regional_domains" { type = map(string) }

variable "is_localstack" {
  type    = bool
  default = true
}
