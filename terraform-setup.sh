#!/bin/bash

cd ./infra/environments/local
terraform init
terraform apply -auto-approve