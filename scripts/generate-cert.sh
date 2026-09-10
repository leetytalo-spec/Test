#!/usr/bin/env bash
set -euo pipefail

mkdir -p certs

if [[ -s certs/cert.pem && -s certs/key.pem ]]; then
  echo "Certificado já existe em ./certs"
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout certs/key.pem \
  -out certs/cert.pem \
  -days 365 \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

echo "Certificado gerado em ./certs"
