# Servidor de atualização do Leet Arena

Serve o manifesto de versão (`latest.json`) e os arquivos `.apk` para o
app verificar e instalar atualizações sem passar pela Play Store.

## Estrutura

```
update-server/
  server.js          # servidor HTTP (Express)
  package.json
  releases/           # onde ficam os .apk publicados (não versionar no git)
  releases/latest.json  # manifesto gerado pelo publish.js
  publish.js          # script para publicar uma nova versão
```

## Como rodar no VPS

```bash
cd update-server
npm install
PORT=4000 node server.js
```

Configure o Nginx (ou proxy já usado pelo domínio) para encaminhar
`https://leetarena.zorobot.shop/updates/` para `http://127.0.0.1:4000/updates/`.

Exemplo de bloco Nginx:

```nginx
location /updates/ {
    proxy_pass http://127.0.0.1:4000/updates/;
    proxy_set_header Host $host;
}
```

## Publicando uma nova versão

1. No projeto principal, gere o APK assinado de release (`android/app/build/outputs/apk/release/app-release.apk`).
2. Copie esse APK para a máquina/pasta onde este servidor roda.
3. Rode o script de publicação:

```bash
node publish.js --apk /caminho/app-release.apk --versionCode 2 --versionName 1.1.0 --notes "Corrige bug do turno"
```

Isso vai:
- Copiar o APK para `releases/leet-arena-1.1.0.apk`.
- Calcular o SHA-256 do arquivo.
- Atualizar `releases/latest.json` com a nova versão.

## Endpoints expostos

- `GET /updates/latest.json` → manifesto atual.
- `GET /updates/apk/:filename` → download do APK correspondente.

## Importante

- `versionCode` no manifesto deve ser **maior** que o `versionCode` do `android/app/build.gradle` usado para gerar o APK anterior, e deve corresponder ao `versionCode` real embutido nesse APK.
- O APK novo **precisa ser assinado com o mesmo keystore** (`android/keystore/release.jks`) usado no APK já instalado nos aparelhos, senão o Android recusa a instalação como "atualização".
- Sirva sempre por HTTPS (o domínio já parece ter certificado).
