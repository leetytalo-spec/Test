import { createClient } from 'redis'

const redisUrl = process.env.REDIS_URL || ''
export const redisEnabled = Boolean(redisUrl)
export const redisClient = redisEnabled ? createClient({ url: redisUrl }) : null

if (redisClient) {
  redisClient.on('error', (error) => console.error('[redis]', error.message))
  await redisClient.connect()
}

export async function setRoomSnapshot(roomCode, snapshot, ttlSeconds = 3600) {
  if (!redisClient) return false
  await redisClient.set(`leet:room:${roomCode}`, JSON.stringify(snapshot), { EX: ttlSeconds })
  return true
}

export async function getRoomSnapshot(roomCode) {
  if (!redisClient) return null
  const value = await redisClient.get(`leet:room:${roomCode}`)
  return value ? JSON.parse(value) : null
}

export async function deleteRoomSnapshot(roomCode) {
  if (!redisClient) return false
  await redisClient.del(`leet:room:${roomCode}`)
  return true
}

export async function closeRedis() {
  await redisClient?.quit()
}
