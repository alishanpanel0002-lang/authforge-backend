-- ShadowAuth v4 Schema Updates
-- Support for Security Webhooks and Advanced Bot configurations

-- 1. Webhooks Table
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
    app_id UUID REFERENCES apps(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    events JSONB DEFAULT '["login", "failed_login", "license_check", "hwid_reset"]'::jsonb,
    secret_key VARCHAR(255) DEFAULT 'wa_' || md5(random()::text), -- sign requests
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Bot Enhancements (Command Channels)
ALTER TABLE bots ADD COLUMN IF NOT EXISTS command_channel_id VARCHAR(255);
ALTER TABLE bots ADD COLUMN IF NOT EXISTS allowed_roles JSONB DEFAULT '[]'::jsonb;
ALTER TABLE bots ADD COLUMN IF NOT EXISTS bot_prefix VARCHAR(10) DEFAULT '!';

-- Disable RLS
ALTER TABLE webhooks DISABLE ROW LEVEL SECURITY;
