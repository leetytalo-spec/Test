import { WebSocket } from 'ws'

const url = process.env.WS_URL || 'ws://127.0.0.1:8787'
const connections = Math.max(1, Number(process.env.LOAD_CONNECTIONS || 100))
const durationMs = Math.max(1000, Number(process.env.LOAD_DURATION_MS || 30000))
const token = process.env.LEET_AUTH_TOKEN || ''

let opened = 0
let closed = 0
let errors = 0
let messages = 0
const sockets = []

function connect() {
  return new Promise((resolve) => {
    const socket = new WebSocket(url)
    sockets.push(socket)
    socket.once('open', () => {
      opened += 1
      socket.send(JSON.stringify({ type: 'list-rooms' }))
      if (token) socket.send(JSON.stringify({ type: 'create', token, character: 'cedric', name: `load-${opened}` }))
      resolve()
    })
    socket.on('message', () => { messages += 1 })
    socket.on('error', () => { errors += 1 })
    socket.on('close', () => { closed += 1 })
    socket.once('error', resolve)
  })
}

await Promise.all(Array.from({ length: connections }, connect))
await new Promise((resolve) => setTimeout(resolve, durationMs))
sockets.forEach((socket) => socket.close())
await new Promise((resolve) => setTimeout(resolve, 250))

console.log(JSON.stringify({ url, requested: connections, opened, closed, errors, messages, durationMs }))
if (opened < connections * .95 || errors > connections * .05) process.exitCode = 1
