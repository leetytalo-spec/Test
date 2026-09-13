import http from 'node:http'
import { randomInt, randomUUID, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { WebSocketServer } from 'ws'
import path from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'

let recordMatchResult = async () => false
try {
  const pgMod = await import('./infra/postgres.js')
  if (typeof pgMod.recordMatchResult === 'function') {
    recordMatchResult = pgMod.recordMatchResult
  }
} catch (e) {
  // PostgreSQL opcional; servidor WebSocket continua funcionando normalmente
}

const port = Number(process.env.PORT || 8787)
// Precisa espelhar os ids de personagem do cliente (src/main.js) para sortear substitutos válidos em conflitos.
const CHARACTER_IDS = ['cedric', 'voss', 'damon', 'kyn', 'nox', 'brick', 'zero', 'haku', 'ogro', 'kiro', 'sany']
const rooms = new Map()
const clients = new Set()
const authDbPath = process.env.AUTH_DB_PATH || path.join(process.cwd(), 'data', 'auth.sqlite')
const authDb = new DatabaseSync(authDbPath)
// WAL permite leituras/escritas concorrentes entre este processo e o media-server, que compartilham o mesmo arquivo.
authDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;')
authDb.exec(`
  CREATE TABLE IF NOT EXISTS player_stats (
    user_id INTEGER PRIMARY KEY,
    username TEXT,
    wins INTEGER NOT NULL DEFAULT 0,
    losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT,
    played_at INTEGER,
    p1_username TEXT,
    p1_character TEXT,
    p2_username TEXT,
    p2_character TEXT,
    winner_username TEXT,
    log TEXT
  );
`)

function recordMatchHistory(room, matchPlayers, winnerIndex, log) {
  const p1 = matchPlayers.find((entry) => entry.slot === 0)
  const p2 = matchPlayers.find((entry) => entry.slot === 1)
  const winner = winnerIndex === -1 ? null : matchPlayers.find((entry) => entry.slot === winnerIndex)
  authDb.prepare(`
    INSERT INTO matches (room_code, played_at, p1_username, p1_character, p2_username, p2_character, winner_username, log)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    room.code,
    Date.now(),
    p1?.username || 'Jogador 1',
    p1?.characterId || 'unknown',
    p2?.username || 'Jogador 2',
    p2?.characterId || 'unknown',
    winner?.username || null,
    JSON.stringify(Array.isArray(log) ? log.slice(0, 500) : []),
  )
}

function getMatchHistory(limit) {
  const rows = authDb.prepare('SELECT id, room_code, played_at, p1_username, p1_character, p2_username, p2_character, winner_username, log FROM matches ORDER BY id DESC LIMIT ?').all(Math.min(Math.max(Number(limit) || 30, 1), 100))
  return rows.map((row) => ({
    id: row.id,
    roomCode: row.room_code,
    playedAt: row.played_at,
    p1: { username: row.p1_username, character: row.p1_character },
    p2: { username: row.p2_username, character: row.p2_character },
    winner: row.winner_username,
    log: (() => { try { return JSON.parse(row.log || '[]') } catch { return [] } })(),
  }))
}

function isAdminToken(token) {
  const authToken = String(token || '').trim()
  if (!authToken) return false
  const row = authDb.prepare(`
    SELECT users.role
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash(authToken), Date.now())
  return row?.role === 'admin'
}


function recordLocalStats(matchPlayers) {
  const upsert = authDb.prepare(`
    INSERT INTO player_stats (user_id, username, wins, losses, draws, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      username = excluded.username,
      wins = wins + excluded.wins,
      losses = losses + excluded.losses,
      draws = draws + excluded.draws,
      updated_at = excluded.updated_at
  `)
  for (const player of matchPlayers) {
    if (!player.userId) continue
    upsert.run(
      player.userId,
      player.username || null,
      player.result === 'win' ? 1 : 0,
      player.result === 'loss' ? 1 : 0,
      player.result === 'draw' ? 1 : 0,
      Date.now(),
    )
  }
}

function getLocalStats(userId) {
  const row = authDb.prepare('SELECT wins, losses, draws FROM player_stats WHERE user_id = ?').get(userId)
  return row ? { wins: Number(row.wins), losses: Number(row.losses), draws: Number(row.draws) } : { wins: 0, losses: 0, draws: 0 }
}

function getLeaderboard(limit) {
  // Inclui todos os jogadores com conta (mesmo sem partidas registradas), não só quem já tem player_stats.
  const rows = authDb.prepare(`
    SELECT users.username AS username, COALESCE(player_stats.wins, 0) AS wins, COALESCE(player_stats.losses, 0) AS losses, COALESCE(player_stats.draws, 0) AS draws
    FROM users
    LEFT JOIN player_stats ON player_stats.user_id = users.id
    ORDER BY wins DESC, losses ASC, username ASC
    LIMIT ?
  `).all(Math.min(Math.max(Number(limit) || 20, 1), 200))
  return rows.map((row) => ({ username: row.username || 'Jogador', wins: Number(row.wins), losses: Number(row.losses), draws: Number(row.draws) }))
}

const chatHistoryLimit = 30
const chatHistoryPath = path.join(process.cwd(), 'data', 'general-chat.json')
let generalChatMessages = loadGeneralChatMessages()

function loadGeneralChatMessages() {
  try {
    const parsed = JSON.parse(readFileSync(chatHistoryPath, 'utf8'))
    return Array.isArray(parsed) ? parsed.slice(-chatHistoryLimit) : []
  } catch {
    return []
  }
}

function saveGeneralChatMessages() {
  mkdirSync(path.dirname(chatHistoryPath), { recursive: true })
  writeFileSync(chatHistoryPath, JSON.stringify(generalChatMessages.slice(-chatHistoryLimit), null, 2))
}

function pushGeneralChatMessage(message) {
  const entry = {
    name: String(message.name || 'Jogador').slice(0, 32),
    text: String(message.text || '').trim().slice(0, 300),
    sentAt: Date.now(),
  }
  if (!entry.text) return null
  generalChatMessages = [...generalChatMessages, entry].slice(-chatHistoryLimit)
  saveGeneralChatMessages()
  return entry
}

function tokenHash(token) {
  return createHash('sha256').update(String(token || '')).digest('hex')
}

function resolveUserIdFromToken(token) {
  const authToken = String(token || '').trim()
  if (!authToken) return null
  const row = authDb.prepare(`
    SELECT users.id
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(tokenHash(authToken), Date.now())
  return row ? Number(row.id) : null
}

function createRoomCode() {
  let code
  do code = String(randomInt(100000, 1000000))
  while (rooms.has(code))
  return code
}

function send(socket, message) {
  if (socket && socket.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

function broadcast(room, message) {
  room.players.forEach((player) => send(player.socket, message))
}

function roomState(room) {
  return room.players.map((player) => ({ index: player.index, character: player.character, name: player.name, ready: Boolean(player.socket) }))
}

function publicRooms() {
  return [...rooms.values()]
    .filter((room) => room.players.length < 2)
    .map((room) => ({
      code: room.code,
      hostCharacter: room.players[0]?.character ?? 'cedric',
      players: room.players.filter((player) => player.socket).length,
      members: room.players.filter((player) => player.socket).map((player) => ({
        character: player.character,
        name: player.name,
      })),
    }))
}

function broadcastRooms() {
  clients.forEach((client) => send(client, { type: 'public-rooms', rooms: publicRooms() }))
}

function scheduleRoomExpiry(room) {
  room.expiryTimer = setTimeout(() => {
    if (!rooms.has(room.code) || room.players.length >= 2) return
    room.players.forEach((roomPlayer) => {
      send(roomPlayer.socket, { type: 'match-cancelled', reason: 'room-expired' })
      roomPlayer.socket = null
    })
    rooms.delete(room.code)
    broadcastRooms()
  }, 30000)
}

function deriveUserId(source) {
  const key = String(source || 'player').trim() || 'player'
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  }
  return Number(hash % 9007199254740991)
}

function resolvePlayerUserId(message, fallbackName) {
  const tokenUserId = resolveUserIdFromToken(message.token)
  if (tokenUserId !== null && Number.isFinite(tokenUserId)) return tokenUserId
  return deriveUserId(message.username || message.name || fallbackName)
}

// Resolve pelo nome de usuário real (tabela users) antes de cair no hash de convidado.
function resolveUserIdByUsername(username) {
  const clean = String(username || '').trim()
  if (!clean) return null
  const row = authDb.prepare('SELECT id FROM users WHERE username = ?').get(clean)
  return row ? Number(row.id) : deriveUserId(clean)
}

const getRoomPlayer = (room, socket) => {
  return room.players.find((player) => player.socket === socket) ?? null
}

const httpServer = http.createServer((req, res) => {
  const rawPath = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/'
  // O Nginx encaminha tudo sob /ws (inclusive requisições HTTP simples) sem remover o prefixo.
  const parsedUrl = rawPath.replace(/^\/ws(?=\/|$)/, '') || '/'
  const query = new URL(req.url || '/', 'http://localhost').searchParams
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders); return res.end() }

  if (['/health', '/'].includes(parsedUrl)) {
    res.writeHead(200, corsHeaders)
    return res.end(JSON.stringify({ ok: true, status: 'online-server-ok', rooms: rooms.size, clients: clients.size, time: Date.now() }))
  }

  if (parsedUrl === '/stats') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || query.get('token')
    const username = query.get('username')
    // Usuários com conta usam o id numérico real da tabela users, não o hash de deriveUserId.
    const userId = resolveUserIdFromToken(token) ?? (username ? resolveUserIdByUsername(username) : null)
    res.writeHead(200, corsHeaders)
    return res.end(JSON.stringify(userId ? getLocalStats(userId) : { wins: 0, losses: 0, draws: 0 }))
  }

  if (parsedUrl === '/leaderboard') {
    res.writeHead(200, corsHeaders)
    return res.end(JSON.stringify({ players: getLeaderboard(query.get('limit')) }))
  }

  if (parsedUrl === '/matches') {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!isAdminToken(token)) { res.writeHead(403, corsHeaders); return res.end(JSON.stringify({ error: 'Acesso restrito ao painel de controle.' })) }
    res.writeHead(200, corsHeaders)
    return res.end(JSON.stringify({ matches: getMatchHistory(query.get('limit')) }))
  }

  res.writeHead(404)
  res.end('Not Found')
})


const server = new WebSocketServer({ server: httpServer })

// Detecta conexões "zumbis" (que caíram sem fechar corretamente) via ping/pong.
// Se não responder em ~30s (2 ciclos de 15s), a conexão é encerrada e o handler
// de 'close' já declara vitória automática para quem ficou na partida.
const heartbeatInterval = setInterval(() => {
  server.clients.forEach((socket) => {
    if (socket.isAlive === false) return socket.terminate()
    socket.isAlive = false
    socket.ping()
  })
}, 15000)
server.on('close', () => clearInterval(heartbeatInterval))

server.on('connection', (socket) => {
  socket.isAlive = true
  socket.on('pong', () => { socket.isAlive = true })
  clients.add(socket)
  send(socket, { type: 'public-rooms', rooms: publicRooms() })
  socket.on('message', (raw) => {
    let message
    try { message = JSON.parse(raw.toString()) } catch { return send(socket, { type: 'error', message: 'Mensagem inválida.' }) }

    if (message.type === 'list-rooms') {
      return send(socket, { type: 'public-rooms', rooms: publicRooms() })
    }

    if (message.type === 'general-chat-history') {
      return send(socket, { type: 'general-chat-history', messages: generalChatMessages.slice(-chatHistoryLimit) })
    }

    if (message.type === 'general-chat') {
      const entry = pushGeneralChatMessage(message)
      if (!entry) return
      clients.forEach((client) => send(client, { type: 'general-chat', message: entry }))
      return
    }

    if (message.type === 'create') {
      const room = { code: createRoomCode(), turn: 1, choices: new Map(), players: [], resultRecorded: false, matchId: randomUUID() }
      const localName = message.name || 'Jogador 1'
      const player = { socket, index: 0, character: message.character, name: localName, username: message.username || localName, userId: resolvePlayerUserId(message, localName), characterSelected: false, room }
      room.players.push(player); rooms.set(room.code, room); socket.player = player
      scheduleRoomExpiry(room)
      send(socket, { type: 'room-created', code: room.code, index: 0, players: roomState(room) })
      return broadcastRooms()
    }

    if (message.type === 'quick-join') {
      const openRoom = [...rooms.values()].find((room) => room.players.length < 2 && room.players.some((roomPlayer) => roomPlayer.socket))
      if (openRoom) {
        clearTimeout(openRoom.expiryTimer)
        const localName = message.name || 'Jogador 2'
        const player = { socket, index: 1, character: message.character, name: localName, username: message.username || localName, userId: resolvePlayerUserId(message, localName), characterSelected: false, room: openRoom }
        openRoom.players.push(player); socket.player = player
        openRoom.players.forEach((roomPlayer) => send(roomPlayer.socket, { type: 'room-ready', code: openRoom.code, index: roomPlayer.index, players: roomState(openRoom), turn: openRoom.turn }))
        return broadcastRooms()
      }
      const room = { code: createRoomCode(), turn: 1, choices: new Map(), players: [], resultRecorded: false, matchId: randomUUID() }
      const localName = message.name || 'Jogador 1'
      const player = { socket, index: 0, character: message.character, name: localName, username: message.username || localName, userId: resolvePlayerUserId(message, localName), characterSelected: false, room }
      room.players.push(player); rooms.set(room.code, room); socket.player = player
      scheduleRoomExpiry(room)
      send(socket, { type: 'room-created', code: room.code, index: 0, players: roomState(room) })
      return broadcastRooms()
    }

    if (message.type === 'join') {
      const room = rooms.get(String(message.code))
      if (!room) return send(socket, { type: 'error', message: 'Sala não encontrada.' })
      clearTimeout(room.expiryTimer)
      const openPlayer = room.players.find((player) => player.socket === null)
      if (openPlayer) {
        const fallbackName = message.name || `Jogador ${openPlayer.index + 1}`
        openPlayer.socket = socket
        openPlayer.character = message.character
        openPlayer.name = fallbackName
        openPlayer.username = message.username || fallbackName
        openPlayer.userId = resolvePlayerUserId(message, fallbackName)
        openPlayer.characterSelected = false
        socket.player = openPlayer
        room.players.forEach((roomPlayer) => send(roomPlayer.socket, { type: 'room-ready', code: room.code, index: roomPlayer.index, players: roomState(room), turn: room.turn }))
        broadcastRooms()
        return
      }
      if (room.players.length >= 2) return send(socket, { type: 'error', message: 'Sala não encontrada ou cheia.' })
      const fallbackName = message.name || `Jogador ${room.players.length + 1}`
      const player = { socket, index: room.players.length, character: message.character, name: fallbackName, username: message.username || fallbackName, userId: resolvePlayerUserId(message, fallbackName), characterSelected: false, room }
      room.players.push(player); socket.player = player
      room.players.forEach((roomPlayer) => send(roomPlayer.socket, { type: 'room-ready', code: room.code, index: roomPlayer.index, players: roomState(room), turn: room.turn }))
      broadcastRooms()
      return
    }

    const player = socket.player
    if (!player) return send(socket, { type: 'error', message: 'Entre em uma sala primeiro.' })
    const room = player.room

    if (message.type === 'leave-room') {
      const activePlayers = room.players.filter((roomPlayer) => roomPlayer.socket)
      player.socket = null
      if (activePlayers.length > 1) broadcast(room, { type: 'opponent-left' })
      if (room.players.every((roomPlayer) => !roomPlayer.socket)) { clearTimeout(room.expiryTimer); rooms.delete(room.code) }
      socket.player = null
      broadcastRooms()
      return
    }

    if (message.type === 'character-timeout') {
      broadcast(room, { type: 'match-cancelled', reason: 'character-timeout' })
      room.players.forEach((roomPlayer) => { roomPlayer.socket = null })
      rooms.delete(room.code)
      broadcastRooms()
      return
    }

    if (message.type === 'private-chat') {
      const entry = { name: player.name || `Jogador ${player.index + 1}`, text: String(message.text || '').trim().slice(0, 300), sentAt: Date.now() }
      if (!entry.text) return
      broadcast(room, { type: 'private-chat', message: entry })
      return
    }

    if (message.type === 'character-choice') {
      const character = String(message.character || '')
      if (!/^[a-z0-9_-]+$/i.test(character)) return send(socket, { type: 'error', message: 'Personagem inválido.' })
      if (player.characterSelected) return
      player.character = character
      player.characterSelected = true
      broadcast(room, { type: 'character-choice-status', index: player.index })
      if (room.players.length === 2 && room.players.every((roomPlayer) => roomPlayer.characterSelected)) {
        const [p0, p1] = room.players
        if (p0.character === p1.character) {
          broadcast(room, { type: 'character-conflict' })
          const shuffled = [...CHARACTER_IDS].sort(() => Math.random() - 0.5)
          p0.character = shuffled[0]
          p1.character = shuffled[1] === shuffled[0] ? shuffled[2] : shuffled[1]
          setTimeout(() => {
            if (!rooms.has(room.code)) return
            broadcast(room, { type: 'character-ready', players: roomState(room), turn: room.turn })
          }, 3000)
          return
        }
        broadcast(room, { type: 'character-ready', players: roomState(room), turn: room.turn })
      }
      return
    }

    if (message.type === 'match-result') {
      const winnerIndex = Number(message.winnerIndex)
      if (room.resultRecorded || ![0, 1, -1].includes(winnerIndex)) return
      room.resultRecorded = true
      const matchPlayers = room.players.map((entry, index) => ({
        userId: entry.userId ?? deriveUserId(entry.username || entry.name || `player-${index}`),
        username: entry.username || entry.name || `Jogador ${index + 1}`,
        slot: index,
        characterId: entry.character || 'unknown',
        result: winnerIndex === -1 ? 'draw' : winnerIndex === index ? 'win' : 'loss',
      }))
      recordLocalStats(matchPlayers)
      recordMatchHistory(room, matchPlayers, winnerIndex, message.log)
      const winnerUserId = winnerIndex === -1 ? null : room.players[winnerIndex]?.userId ?? null
      recordMatchResult({
        matchId: room.matchId || (room.matchId = randomUUID()),
        roomCode: room.code,
        seed: Date.now(),
        players: matchPlayers,
        winnerUserId,
        status: 'finished',
      }).catch((error) => {
        console.error('Erro ao registrar resultado do combate no PostgreSQL:', error)
      })
      broadcast(room, { type: 'match-result', winnerIndex, players: roomState(room) })
      return
    }

    if (message.type === 'choose') {
      room.choices.set(player.index, String(message.ability))
      broadcast(room, { type: 'choice-status', index: player.index, selected: true })
      if (room.choices.size === 2) {
        const choices = [room.choices.get(0), room.choices.get(1)]
        broadcast(room, { type: 'resolve', turn: room.turn, choices })
        room.choices.clear(); room.turn += 1
      }
    }
  })

  socket.on('close', () => {
    clients.delete(socket)
    const player = getRoomPlayer(socket.player?.room ?? { players: [] }, socket)
    if (!player) return
    const room = player.room
    player.socket = null
    const activePlayers = room.players.filter((roomPlayer) => roomPlayer.socket)
    if (activePlayers.length > 0) {
      broadcast(room, { type: 'opponent-left' })
      // Só conta derrota/vitória se a partida já estava em andamento (2 jogadores com personagem escolhido).
      if (!room.resultRecorded && room.players.length === 2 && room.players.every((entry) => entry.characterSelected)) {
        room.resultRecorded = true
        const matchPlayers = room.players.map((entry) => ({
          userId: entry.userId ?? deriveUserId(entry.username || entry.name || `player-${entry.index}`),
          username: entry.username || entry.name || `Jogador ${entry.index + 1}`,
          slot: entry.index,
          characterId: entry.character || 'unknown',
          result: entry === player ? 'loss' : 'win',
        }))
        recordLocalStats(matchPlayers)
      }
    }
    if (room.players.every((roomPlayer) => !roomPlayer.socket)) { clearTimeout(room.expiryTimer); rooms.delete(room.code) }
    broadcastRooms()
  })
})

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Leet Arena online server listening on port ${port}`)
})