import express from 'express'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const releasesDir = path.join(__dirname, 'releases')
const manifestPath = path.join(releasesDir, 'latest.json')
const port = Number(process.env.PORT || 4000)

fs.mkdirSync(releasesDir, { recursive: true })

const app = express()

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/updates/latest.json', (req, res) => {
  if (!fs.existsSync(manifestPath)) {
    return res.status(404).json({ error: 'Nenhuma versão publicada ainda.' })
  }
  res.type('application/json').send(fs.readFileSync(manifestPath, 'utf8'))
})

app.get('/updates/apk/:filename', (req, res) => {
  const filename = path.basename(req.params.filename)
  const filePath = path.join(releasesDir, filename)
  if (!filePath.startsWith(releasesDir) || !fs.existsSync(filePath)) {
    return res.status(404).send('Arquivo não encontrado.')
  }
  res.download(filePath)
})

app.listen(port, () => {
  console.log(`Leet Arena update server listening on http://localhost:${port}`)
})
