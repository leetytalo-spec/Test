import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const releasesDir = path.join(__dirname, 'releases')
const manifestPath = path.join(releasesDir, 'latest.json')
const BASE_URL = process.env.UPDATE_BASE_URL || 'https://leetarena.tech'

function parseArgs() {
  const args = {}
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i += 2) {
    args[argv[i].replace(/^--/, '')] = argv[i + 1]
  }
  return args
}

function sha256(filePath) {
  const buffer = fs.readFileSync(filePath)
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

function main() {
  const { apk, versionCode, versionName, notes } = parseArgs()
  if (!apk || !versionCode || !versionName) {
    console.error('Uso: node publish.js --apk <caminho.apk> --versionCode <n> --versionName <x.y.z> [--notes "texto"]')
    process.exit(1)
  }
  if (!fs.existsSync(apk)) {
    console.error(`APK não encontrado: ${apk}`)
    process.exit(1)
  }

  fs.mkdirSync(releasesDir, { recursive: true })
  const fileName = `leet-arena-${versionName}.apk`
  const destPath = path.join(releasesDir, fileName)
  fs.copyFileSync(apk, destPath)

  const manifest = {
    versionCode: Number(versionCode),
    versionName,
    notes: notes || '',
    sha256: sha256(destPath),
    downloadUrl: `${BASE_URL}/updates/apk/${fileName}`,
    publishedAt: new Date().toISOString(),
  }

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  console.log('Publicado com sucesso:')
  console.log(manifest)
}

main()
