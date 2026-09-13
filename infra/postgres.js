import pg from 'pg'

const { Pool } = pg
const databaseUrl = process.env.DATABASE_URL || ''
export const postgresEnabled = Boolean(databaseUrl)
export const postgresPool = postgresEnabled ? new Pool({ connectionString: databaseUrl, max: Number(process.env.PG_POOL_MAX || 20), idleTimeoutMillis: 30000, connectionTimeoutMillis: 5000 }) : null

export async function closePostgres() {
  await postgresPool?.end()
}

export async function recordMatchResult({ matchId, roomCode, seed, players, winnerUserId, status = 'finished' }) {
  if (!postgresPool) return false
  const client = await postgresPool.connect()
  try {
    await client.query('BEGIN')
    await client.query('INSERT INTO matches (id, room_code, status, winner_user_id, seed, finished_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, winner_user_id = EXCLUDED.winner_user_id, finished_at = EXCLUDED.finished_at', [matchId, roomCode, status, winnerUserId || null, seed || null])
    for (const player of players) {
      await client.query('INSERT INTO match_players (match_id, user_id, slot, character_id, result) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (match_id, user_id) DO UPDATE SET result = EXCLUDED.result', [matchId, player.userId, player.slot, player.characterId, player.result])
      const column = player.result === 'win' ? 'wins' : player.result === 'loss' ? 'losses' : 'draws'
      await client.query(`INSERT INTO player_profiles (user_id, ${column}) VALUES ($1, 1) ON CONFLICT (user_id) DO UPDATE SET ${column} = player_profiles.${column} + 1`, [player.userId])
    }
    await client.query('COMMIT')
    return true
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}
