import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const releasesDir = path.join(__dirname, 'releases')
const distDir = path.join(__dirname, '..', 'dist')
const BASE_URL = process.env.UPDATE_BASE_URL || 'https://leetarena.tech'

function main() {
  const version = Number(process.argv[2])
  const notes = process.argv[3] || ''
  if (!Number.isInteger(version) || version <= 0) {
    console.error('Uso: node publish-web.js <versaoInteira> ["notas"]')
    process.exit(1)
  }
  if (!fs.existsSync(path.join(distDir, 'index.html'))) {
    console.error('dist/index.html não encontrado. Rode "npm run build" antes.')
    process.exit(1)
  }

  fs.mkdirSync(releasesDir, { recursive: true })
  const fileName = `web-${version}.zip`
  const zipPath = path.join(releasesDir, fileName)
  fs.rmSync(zipPath, { force: true })
  execFileSync('zip', ['-r', '-q', zipPath, '.'], { cwd: distDir })

  const manifest = {
    versionCode: version,
    versionName: `web-${version}`,
    notes,
    sha256: crypto.createHash('sha256').update(fs.readFileSync(zipPath)).digest('hex'),
    downloadUrl: `${BASE_URL}/updates/${fileName}`,
    publishedAt: new Date().toISOString(),
  }

  fs.writeFileSync(path.join(releasesDir, 'web.json'), JSON.stringify(manifest, null, 2))
  console.log('Pacote web publicado:')
  console.log(manifest)
}

main()
