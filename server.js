import { randomInt } from 'node:crypto'
import { WebSocketServer } from 'ws'

const port = Number(process.env.PORT || 8787)
const rooms = new Map()
const clients = new Set()

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
  return room.players.map((player) => ({ index: player.index, character: player.character, ready: Boolean(player.socket) }))
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

function getRoomPlayer(room, socket) {
  return room.players.find((player) => player.socket === socket) ?? null
}

const server = new WebSocketServer({ port })

server.on('connection', (socket) => {
  clients.add(socket)
  send(socket, { type: 'public-rooms', rooms: publicRooms() })
  socket.on('message', (raw) => {
    let message
    try { message = JSON.parse(raw.toString()) } catch { return send(socket, { type: 'error', message: 'Mensagem inválida.' }) }

    if (message.type === 'list-rooms') {
      return send(socket, { type: 'public-rooms', rooms: publicRooms() })
    }

    if (message.type === 'create') {
      const room = { code: createRoomCode(), turn: 1, choices: new Map(), players: [] }
      const player = { socket, index: 0, character: message.character, room }
      room.players.push(player); rooms.set(room.code, room); socket.player = player
      send(socket, { type: 'room-created', code: room.code, index: 0, players: roomState(room) })
      return broadcastRooms()
    }

    if (message.type === 'quick-join') {
      const openRoom = [...rooms.values()].find((room) => room.players.length < 2 && room.players.some((roomPlayer) => roomPlayer.socket))
      if (openRoom) {
        const player = { socket, index: 1, character: message.character, room: openRoom }
        openRoom.players.push(player); socket.player = player
        openRoom.players.forEach((roomPlayer) => send(roomPlayer.socket, { type: 'room-ready', code: openRoom.code, index: roomPlayer.index, players: roomState(openRoom), turn: openRoom.turn }))
        return broadcastRooms()
      }
      const room = { code: createRoomCode(), turn: 1, choices: new Map(), players: [] }
      const player = { socket, index: 0, character: message.character, room }
      room.players.push(player); rooms.set(room.code, room); socket.player = player
      send(socket, { type: 'room-created', code: room.code, index: 0, players: roomState(room) })
      return broadcastRooms()
    }

    if (message.type === 'join') {
      const room = rooms.get(String(message.code))
      if (!room) return send(socket, { type: 'error', message: 'Sala não encontrada.' })
      const openPlayer = room.players.find((player) => player.socket === null)
      if (openPlayer) {
        openPlayer.socket = socket
        openPlayer.character = message.character
        socket.player = openPlayer
        room.players.forEach((roomPlayer) => send(roomPlayer.socket, { type: 'room-ready', code: room.code, index: roomPlayer.index, players: roomState(room), turn: room.turn }))
        broadcastRooms()
        return
      }
      if (room.players.length >= 2) return send(socket, { type: 'error', message: 'Sala não encontrada ou cheia.' })
      const player = { socket, index: room.players.length, character: message.character, room }
      room.players.push(player); socket.player = player
      room.players.forEach((roomPlayer) => send(roomPlayer.socket, { type: 'room-ready', code: room.code, index: roomPlayer.index, players: roomState(room), turn: room.turn }))
      broadcastRooms()
      return
    }

    const player = socket.player
    if (!player) return send(socket, { type: 'error', message: 'Entre em uma sala primeiro.' })
    const room = player.room

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

console.log(`Leet Arena online server listening on ws://localhost:${port}`)