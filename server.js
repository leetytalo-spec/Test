import http from 'node:http'
import { randomInt } from 'node:crypto'
import { WebSocketServer } from 'ws'

const port = Number(process.env.PORT || 8787)
const rooms = new Map()
const clients = new Set()
const characters = ['cedric', 'voss', 'damon', 'kyn', 'nox', 'brick', 'zero', 'haku', 'ogro', 'kiro', 'sany']
const generalMessages = []

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, uptime: process.uptime(), rooms: rooms.size, clients: clients.size, port }))
    return
  }

  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: 'Not found' }))
})

function createRoomCode() {
  let code
  do code = String(randomInt(100000, 1000000))
  while (rooms.has(code))
  return code
}

function send(socket, message) {
  if (socket?.readyState === socket.OPEN) socket.send(JSON.stringify(message))
}

function broadcast(room, message) {
  room.players.forEach((player) => send(player.socket, message))
}

function roomState(room) {
  return room.players.map((player) => ({ index: player.index, character: player.character, name: player.name, ready: Boolean(player.socket) }))
}

function publicRooms() {
  return [...rooms.values()].map((room) => ({
    code: room.code,
    hostCharacter: room.players[0]?.character || 'cedric',
    players: room.players.filter((player) => player.socket).length,
    maxPlayers: 2,
    status: room.players.length >= 2 ? 'in_progress' : 'waiting',
    members: room.players.filter((player) => player.socket).map((player) => ({ character: player.character, name: player.name, avatar: player.avatar || '' })),
  }))
}

function broadcastRooms() {
  clients.forEach((client) => send(client, { type: 'public-rooms', rooms: publicRooms() }))
}

function resolveCharacterChoices(room) {
  if (room.characterTimer) clearTimeout(room.characterTimer)
  room.characterTimer = null
  const first = room.characterChoices.get(0) || characters[randomInt(characters.length)]
  const secondOptions = characters.filter((character) => character !== first)
  const secondChoice = room.characterChoices.get(1)
  const second = secondChoice && secondChoice !== first ? secondChoice : secondOptions[randomInt(secondOptions.length)]
  room.players[0].character = first
  room.players[1].character = second
  room.characterChoices.clear()
  broadcast(room, { type: 'character-ready', code: room.code, players: roomState(room) })
}

function beginCharacterSelection(room) {
  room.characterChoices.clear()
  room.characterTimer = setTimeout(() => resolveCharacterChoices(room), 45000)
  room.players.forEach((player) => send(player.socket, { type: 'room-ready', code: room.code, index: player.index, players: roomState(room), turn: room.turn }))
}

function resolveRoomTurn(room) {
  const entries = [room.choices.get(0), room.choices.get(1)]
  room.choices.clear()
  broadcast(room, {
    type: 'resolve',
    turn: room.turn,
    choices: entries.map((entry) => entry?.ability ?? 'basic'),
    targets: entries.map((entry) => entry?.target ?? ''),
  })
  room.turn += 1
}

const server = new WebSocketServer({ server: healthServer })

server.on('connection', (socket) => {
  clients.add(socket)
  socket.isAlive = true
  socket.on('pong', () => { socket.isAlive = true })
  send(socket, { type: 'public-rooms', rooms: publicRooms() })

  socket.on('message', (raw) => {
    let message
    try { message = JSON.parse(raw.toString()) } catch { return send(socket, { type: 'error', message: 'Mensagem inválida.' }) }

    if (message.type === 'list-rooms') return send(socket, { type: 'public-rooms', rooms: publicRooms() })

    if (message.type === 'general-chat') {
      const text = String(message.text || '').trim().slice(0, 300)
      if (!text) return
      const chatMessage = { id: `${Date.now()}-${randomInt(100000)}`, name: String(message.name || 'Jogador').slice(0, 24), text, sentAt: Date.now() }
      generalMessages.push(chatMessage)
      if (generalMessages.length > 50) generalMessages.shift()
      clients.forEach((client) => send(client, { type: 'general-chat', message: chatMessage }))
      return
    }

    if (message.type === 'general-chat-history') {
      return send(socket, { type: 'general-chat-history', messages: generalMessages })
    }

    if (message.type === 'create') {
      if (socket.player) return send(socket, { type: 'room-created', code: socket.player.room.code, index: socket.player.index, players: roomState(socket.player.room) })
      const room = { code: createRoomCode(), turn: 1, choices: new Map(), characterChoices: new Map(), players: [], characterTimer: null }
      const player = { socket, index: 0, character: characters.includes(message.character) ? message.character : 'cedric', name: String(message.name || 'Jogador'), avatar: String(message.avatar || ''), room }
      room.players.push(player)
      rooms.set(room.code, room)
      socket.player = player
      send(socket, { type: 'room-created', code: room.code, index: 0, players: roomState(room) })
      return broadcastRooms()
    }

    if (message.type === 'join') {
      const room = rooms.get(String(message.code))
      if (!room || room.players.length >= 2) return send(socket, { type: 'error', message: 'Sala não encontrada ou cheia.' })
      const player = { socket, index: 1, character: characters.includes(message.character) ? message.character : 'cedric', name: String(message.name || 'Jogador'), avatar: String(message.avatar || ''), room }
      room.players.push(player)
      socket.player = player
      beginCharacterSelection(room)
      return broadcastRooms()
    }

    const player = socket.player
    if (!player) return send(socket, { type: 'error', message: 'Entre em uma sala primeiro.' })
    const room = player.room

    if (message.type === 'private-chat') {
      const text = String(message.text || '').trim().slice(0, 300)
      if (!text || room.players.length < 2) return
      broadcast(room, { type: 'private-chat', message: { id: `${Date.now()}-${randomInt(100000)}`, name: player.name, text, sentAt: Date.now() } })
      return
    }

    if (message.type === 'rename') {
      player.name = String(message.name || '').trim() || player.name
      return broadcastRooms()
    }

    if (message.type === 'character-choice') {
      const character = String(message.character || '')
      if (!room.players[1] || !characters.includes(character)) return send(socket, { type: 'error', message: 'Escolha de personagem inválida.' })
      room.characterChoices.set(player.index, character)
      broadcast(room, { type: 'character-choice-status', index: player.index })
      if (room.characterChoices.size === 2) resolveCharacterChoices(room)
      return
    }

    if (message.type === 'choose') {
      if (!room.players[1]) return send(socket, { type: 'error', message: 'A partida ainda não está pronta.' })
      if (room.choices.has(player.index)) return send(socket, { type: 'error', message: 'Sua ação deste turno já foi registrada.' })
      room.choices.set(player.index, { ability: String(message.ability || 'basic'), target: String(message.target || '').slice(0, 40) })
      broadcast(room, { type: 'choice-status', index: player.index, selected: true })
      if (room.choices.size === 2) resolveRoomTurn(room)
    }
  })

  socket.on('close', () => {
    clients.delete(socket)
    const player = socket.player
    if (!player) return
    const room = player.room
    player.socket = null
    if (room.players.some((roomPlayer) => roomPlayer.socket)) broadcast(room, { type: 'opponent-left' })
    if (room.players.every((roomPlayer) => !roomPlayer.socket)) rooms.delete(room.code)
    broadcastRooms()
  })
})

setInterval(() => {
  clients.forEach((socket) => {
    if (socket.isAlive === false) return socket.terminate()
    socket.isAlive = false
    socket.ping()
  })
}, 20000)

healthServer.listen(port, () => {
  console.log(`Leet Arena online server listening on ws://localhost:${port}`)
  console.log(`Health check available at http://localhost:${port}/health`)
})
