CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS player_profiles (
  user_id BIGINT PRIMARY KEY,
  nickname VARCHAR(24),
  avatar_url TEXT,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  draws INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code VARCHAR(6) NOT NULL,
  status VARCHAR(16) NOT NULL CHECK (status IN ('started', 'finished', 'abandoned')),
  winner_user_id BIGINT,
  seed BIGINT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL,
  slot SMALLINT NOT NULL CHECK (slot IN (0, 1)),
  character_id VARCHAR(32) NOT NULL,
  result VARCHAR(16) CHECK (result IN ('win', 'loss', 'draw', 'abandoned')),
  PRIMARY KEY (match_id, user_id)
);

CREATE TABLE IF NOT EXISTS match_turns (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  turn_number INTEGER NOT NULL,
  player_one_action VARCHAR(64) NOT NULL,
  player_two_action VARCHAR(64) NOT NULL,
  state_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (match_id, turn_number)
);

CREATE INDEX IF NOT EXISTS matches_started_at_idx ON matches (started_at DESC);
CREATE INDEX IF NOT EXISTS match_players_user_id_idx ON match_players (user_id);

CREATE OR REPLACE FUNCTION update_player_profile_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS player_profiles_updated_at ON player_profiles;
CREATE TRIGGER player_profiles_updated_at
BEFORE UPDATE ON player_profiles
FOR EACH ROW EXECUTE FUNCTION update_player_profile_timestamp();
