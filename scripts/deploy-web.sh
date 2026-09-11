#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-53}"
NOTES="${2:-Atualização remota do jogo}"
SERVER_HOST="${SERVER_HOST:-2.25.214.134}"
REMOTE_USER="${REMOTE_USER:-root}"

echo "=== 1. Compilando o jogo (Vite Build) ==="
npm run build

echo "=== 2. Publicando pacote de atualização web-${VERSION} ==="
node update-server/publish-web.js "${VERSION}" "${NOTES}"

echo "=== 3. Enviando arquivos web em produção (/var/www/leetarena-web/) ==="
scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new -r dist/* "${REMOTE_USER}@${SERVER_HOST}:/var/www/leetarena-web/"

echo "=== 4. Enviando arquivos de update (/var/www/leetarena-updates/) ==="
scp -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new \
  "update-server/releases/web-${VERSION}.zip" \
  "update-server/releases/web.json" \
  "${REMOTE_USER}@${SERVER_HOST}:/var/www/leetarena-updates/"

ssh -o ConnectTimeout=30 -o StrictHostKeyChecking=accept-new "${REMOTE_USER}@${SERVER_HOST}" \
  "cp /var/www/leetarena-updates/web-${VERSION}.zip /var/www/leetarena-updates/web/web-${VERSION}.zip 2>/dev/null || true"

echo "=== 5. Verificando produção ==="
curl -fsSL https://leetarena.tech/updates/web.json
echo ""
echo "Deploy da versão ${VERSION} concluído com sucesso em https://leetarena.tech/!"
