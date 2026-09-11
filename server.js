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
const rooms = new Map()
const clients = new Set()
const authDbPath = process.env.AUTH_DB_PATH || path.join(process.cwd(), 'data', 'auth.sqlite')
const authDb = new DatabaseSync(authDbPath)
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

function roomDisplayName(character) {
  return character === 'voss' ? 'Maria' : 'João'
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
        name: roomDisplayName(player.character),
      })),
    }))
}

function broadcastRooms() {
  clients.forEach((client) => send(client, { type: 'public-rooms', rooms: publicRooms() }))
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

const getRoomPlayer = (room, socket) => {
  return room.players.find((player) => player.socket === socket) ?? null
}

const httpServer = http.createServer((req, res) => {
  const parsedUrl = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/'
  if (['/health', '/ws/health', '/', '/ws'].includes(parsedUrl)) {
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    return res.end(JSON.stringify({ ok: true, status: 'online-server-ok', rooms: rooms.size, clients: clients.size, time: Date.now() }))
  }
  res.writeHead(404)
  res.end('Not Found')
})

const server = new WebSocketServer({ server: httpServer })

server.on('connection', (socket) => {
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
      send(socket, { type: 'room-created', code: room.code, index: 0, players: roomState(room) })
      return broadcastRooms()
    }

    if (message.type === 'quick-join') {
      const openRoom = [...rooms.values()].find((room) => room.players.length < 2 && room.players.some((roomPlayer) => roomPlayer.socket))
      if (openRoom) {
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
      send(socket, { type: 'room-created', code: room.code, index: 0, players: roomState(room) })
      return broadcastRooms()
    }

    if (message.type === 'join') {
      const room = rooms.get(String(message.code))
      if (!room) return send(socket, { type: 'error', message: 'Sala não encontrada.' })
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
        slot: index,
        characterId: entry.character || 'unknown',
        result: winnerIndex === -1 ? 'draw' : winnerIndex === index ? 'win' : 'loss',
      }))
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
    }
    if (room.players.every((roomPlayer) => !roomPlayer.socket)) rooms.delete(room.code)
    broadcastRooms()
  })
})

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Leet Arena online server listening on port ${port}`)
})