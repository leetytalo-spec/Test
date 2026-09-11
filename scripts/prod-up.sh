#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f .env ]]; then
  cp .env.example .env
  cat >&2 <<'EOF'
Arquivo .env criado a partir de .env.example.
Altere ADMIN_PASSWORD, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD,
S3_ACCESS_KEY e S3_SECRET_KEY antes de iniciar a produção.
EOF
  exit 1
fi

required_keys=(ADMIN_PASSWORD MINIO_ROOT_USER MINIO_ROOT_PASSWORD S3_ACCESS_KEY S3_SECRET_KEY)
for key in "${required_keys[@]}"; do
  value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
  if [[ -z "$value" || "$value" == change-this-* ]]; then
    echo "Configure ${key} em .env antes de iniciar a produção." >&2
    exit 1
  fi
done

./scripts/generate-cert.sh
docker compose --env-file .env -f docker-compose.prod.yml config >/dev/null
docker compose --env-file .env -f docker-compose.prod.yml up --build
