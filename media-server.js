import { createServer } from 'node:http'
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream, statSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join, extname, normalize } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { URL } from 'node:url'

// Simula um CDN local: entrega vídeos por HTTP Range (streaming) e aceita upload para o painel de admin.
const port = Number(process.env.MEDIA_PORT || 8788)
const mediaRoot = join(process.cwd(), 'media', 'videos')
const dataRoot = join(process.cwd(), 'data')
const adminPassword = process.env.ADMIN_PASSWORD || ''
const adminUsername = process.env.ADMIN_USERNAME || 'admin'
const adminSessionDuration = 12 * 60 * 60 * 1000
mkdirSync(dataRoot, { recursive: true })
const authDb = new DatabaseSync(process.env.AUTH_DB_PATH || join(dataRoot, 'auth.sqlite'))

authDb.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('player', 'admin')),
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );
`)
authDb.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now())

const mimeTypes = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' }
const uploadExtensions = { 'video/mp4': '.mp4', 'video/webm': '.webm', 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp' }
const slugPattern = /^[a-z0-9_-]+$/i
const maxUploadBytes = Number(process.env.MAX_UPLOAD_BYTES || 250 * 1024 * 1024)
let manifestCache = null

function withCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
}

function passwordDigest(password, salt) {
  return scryptSync(password, salt, 64).toString('hex')
}

function passwordMatches(password, user) {
  const actual = Buffer.from(passwordDigest(password, user.password_salt), 'hex')
  const expected = Buffer.from(user.password_hash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function createOrUpdateAdmin() {
  if (!adminPassword) return
  const salt = randomBytes(16).toString('hex')
  const hash = passwordDigest(adminPassword, salt)
  authDb.prepare(`
    INSERT INTO users (username, password_hash, password_salt, role, created_at)
    VALUES (?, ?, ?, 'admin', ?)
    ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, password_salt = excluded.password_salt, role = 'admin'
  `).run(adminUsername, hash, salt, Date.now())
}

function tokenHash(token) {
  return createHash('sha256').update(token).digest('hex')
}

function issueSession(userId) {
  const token = randomBytes(32).toString('hex')
  authDb.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(tokenHash(token), userId, Date.now() + adminSessionDuration)
  return token
}

function getSessionUser(req) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  return authDb.prepare(`
    SELECT users.id, users.username, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash(token), Date.now()) || null
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  return res.end(JSON.stringify(payload))
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
      if (body.length > 4096) reject(new Error('Payload muito grande.'))
    })
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')) } catch { reject(new Error('JSON inválido.')) }
    })
    req.on('error', reject)
  })
}

function isAdminAuthorized(req) {
  return getSessionUser(req)?.role === 'admin'
}

async function handleRegister(req, res) {
  try {
    const { username = '', password = '' } = await readJson(req)
    const normalizedUsername = String(username).trim()
    if (!/^[a-z0-9_.-]{3,24}$/i.test(normalizedUsername)) return sendJson(res, 400, { error: 'Usuário deve ter entre 3 e 24 caracteres.' })
    if (String(password).length < 8) return sendJson(res, 400, { error: 'A senha deve ter pelo menos 8 caracteres.' })
    const salt = randomBytes(16).toString('hex')
    const result = authDb.prepare('INSERT INTO users (username, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, ?, ?)').run(normalizedUsername, passwordDigest(String(password), salt), salt, 'player', Date.now())
    const token = issueSession(result.lastInsertRowid)
    return sendJson(res, 201, { token, user: { username: normalizedUsername, role: 'player' } })
  } catch (error) {
    const duplicate = String(error.message).includes('UNIQUE constraint failed')
    return sendJson(res, duplicate ? 409 : 400, { error: duplicate ? 'Este usuário já existe.' : error.message })
  }
}

async function handleLogin(req, res, adminOnly = false) {
  try {
    const { username = adminOnly ? adminUsername : '', password = '' } = await readJson(req)
    const user = authDb.prepare('SELECT * FROM users WHERE username = ?').get(String(username).trim())
    if (!user || !passwordMatches(String(password), user) || (adminOnly && user.role !== 'admin')) return sendJson(res, 401, { error: 'Usuário ou senha inválidos.' })
    const token = issueSession(user.id)
    return sendJson(res, 200, { token, user: { username: user.username, role: user.role } })
  } catch (error) {
    return sendJson(res, 400, { error: error.message })
  }
}

createOrUpdateAdmin()

function buildManifest() {
  if (manifestCache) return manifestCache
  const manifest = {}
  if (!existsSync(mediaRoot)) return manifest
  for (const character of readdirSync(mediaRoot, { withFileTypes: true })) {
    if (!character.isDirectory()) continue
    const characterDir = join(mediaRoot, character.name)
    manifest[character.name] = {}
    for (const file of readdirSync(characterDir, { withFileTypes: true })) {
      if (!file.isFile() || !mimeTypes[extname(file.name)]) continue
      const abilityId = file.name.slice(0, -extname(file.name).length)
      manifest[character.name][abilityId] = `/${character.name}/${file.name}`
    }
  }
  manifestCache = manifest
  return manifestCache
}

function handleUpload(req, res, url) {
  if (!isAdminAuthorized(req)) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ error: 'Sessão administrativa inválida ou expirada.' }))
  }
  const character = url.searchParams.get('character') || ''
  const ability = url.searchParams.get('ability') || ''
  if (!slugPattern.test(character) || !slugPattern.test(ability)) {
    res.writeHead(400); return res.end('Personagem ou habilidade inválidos.')
  }
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim()
  const extension = uploadExtensions[contentType]
  if (!extension) return sendJson(res, 415, { error: 'Tipo de arquivo não suportado.' })
  const contentLength = Number(req.headers['content-length'] || 0)
  if (contentLength > maxUploadBytes) return sendJson(res, 413, { error: 'Arquivo grande demais.' })
  const characterDir = join(mediaRoot, character)
  mkdirSync(characterDir, { recursive: true })
  for (const knownExtension of Object.keys(mimeTypes)) {
    const previous = join(characterDir, `${ability}${knownExtension}`)
    if (knownExtension !== extension && existsSync(previous)) unlinkSync(previous)
  }
  const filePath = join(characterDir, `${ability}${extension}`)
  const writeStream = createWriteStream(filePath)
  let receivedBytes = 0
  req.on('data', (chunk) => {
    receivedBytes += chunk.length
    if (receivedBytes > maxUploadBytes) {
      req.destroy()
      writeStream.destroy()
      if (existsSync(filePath)) unlinkSync(filePath)
    }
  })
  req.pipe(writeStream)
  writeStream.on('finish', () => {
    manifestCache = null
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, path: `/${character}/${ability}${extension}` }))
  })
  writeStream.on('error', () => { res.writeHead(500); res.end('Falha ao salvar o vídeo.') })
}

function serveVideo(req, res, requestedPath) {
  const filePath = join(mediaRoot, requestedPath)
  if (!existsSync(filePath)) { res.writeHead(404); return res.end('Vídeo não encontrado.') }

  const { size } = statSync(filePath)
  const contentType = mimeTypes[extname(filePath)] || 'application/octet-stream'
  const range = req.headers.range

  if (!range) {
    res.writeHead(200, { 'Content-Length': size, 'Content-Type': contentType, 'Accept-Ranges': 'bytes' })
    return createReadStream(filePath).pipe(res)
  }

  const [startRaw, endRaw] = range.replace(/bytes=/, '').split('-')
  const start = Number(startRaw)
  const end = endRaw ? Number(endRaw) : size - 1

  res.writeHead(206, {
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1,
    'Content-Type': contentType,
  })
  createReadStream(filePath, { start, end }).pipe(res)
}

const server = createServer((req, res) => {
  withCors(res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }

  const url = new URL(req.url, `http://localhost:${port}`)

  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, status: 'media-server-ok', manifest: buildManifest() }))
  }

  if (url.pathname === '/manifest.json') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(buildManifest()))
  }

  if (url.pathname === '/auth/register' && req.method === 'POST') return handleRegister(req, res)
  if (url.pathname === '/auth/login' && req.method === 'POST') return handleLogin(req, res)

  if (url.pathname === '/auth/session') {
    const user = getSessionUser(req)
    return user ? sendJson(res, 200, { user: { username: user.username, role: user.role } }) : sendJson(res, 401, { error: 'Sessão inválida ou expirada.' })
  }

  if (url.pathname === '/auth/logout' && req.method === 'POST') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (token) authDb.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash(token))
    res.writeHead(204)
    return res.end()
  }

  if (url.pathname === '/admin/login' && req.method === 'POST') return handleLogin(req, res, true)

  if (url.pathname === '/admin/session') {
    const user = getSessionUser(req)
    return user?.role === 'admin' ? sendJson(res, 200, { user: { username: user.username, role: user.role } }) : sendJson(res, 401, { error: 'Acesso administrativo necessário.' })
  }

  if (url.pathname === '/upload' && req.method === 'POST') return handleUpload(req, res, url)

  const requestedPath = normalize(decodeURIComponent(url.pathname))
  if (requestedPath.includes('..')) { res.writeHead(400); return res.end('Caminho inválido.') }
  serveVideo(req, res, requestedPath)
})

server.listen(port, () => {
  console.log(`Media CDN (simulado) em http://localhost:${port}`)
  console.log(`Coloque vídeos em: ${mediaRoot}`)
})
