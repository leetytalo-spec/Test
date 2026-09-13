# Infraestrutura local

Suba PostgreSQL, Redis e MinIO com:

```bash
docker compose up -d
```

Servicos:

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- MinIO API: `localhost:9000`
- MinIO Console: `localhost:9001`

Credenciais de desenvolvimento estao no `docker-compose.yml`. Troque-as antes de qualquer ambiente publico.

## Teste de carga

Com o servidor WebSocket em execucao:

```bash
LOAD_CONNECTIONS=300 LOAD_DURATION_MS=30000 npm run load-test
```

Para testar criacao autenticada de salas, forneca `LEET_AUTH_TOKEN`.
