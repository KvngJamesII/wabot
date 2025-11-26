-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  telegram_id BIGINT UNIQUE NOT NULL,
  telegram_username VARCHAR(255),
  phone_number VARCHAR(20),
  status VARCHAR(50) DEFAULT 'waiting_for_phone',
  whatsapp_session_id VARCHAR(255),
  is_connected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create sessions table (stores WhatsApp auth data)
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(255) UNIQUE NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auth_data JSONB,
  is_active BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create group settings table
CREATE TABLE IF NOT EXISTS group_settings (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id VARCHAR(255),
  antilink_enabled BOOLEAN DEFAULT FALSE,
  auto_warn_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user warns table
CREATE TABLE IF NOT EXISTS user_warns (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id VARCHAR(255),
  warn_count INTEGER DEFAULT 0,
  warned_user VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster queries
CREATE INDEX idx_telegram_id ON users(telegram_id);
CREATE INDEX idx_session_id ON whatsapp_sessions(session_id);
CREATE INDEX idx_user_id ON whatsapp_sessions(user_id);
CREATE INDEX idx_group_id ON group_settings(group_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_timestamp BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_timestamp();

CREATE TRIGGER update_sessions_timestamp BEFORE UPDATE ON whatsapp_sessions
FOR EACH ROW EXECUTE FUNCTION update_timestamp();
