variable "app_name" { type = string }
variable "env" {
  type    = list(string)
  default = ["local", "test"] # add prod in the future
}
variable "cors_origins" { type = list(string) }
