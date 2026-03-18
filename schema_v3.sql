-- AuthForge v3 Schema Updates (Required for new features)
-- Please run this in your Supabase SQL Editor

-- 1. Global Settings (Themes, BOGO, Announcements)
CREATE TABLE IF NOT EXISTS global_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    theme VARCHAR(50) DEFAULT 'dark', -- dark, light, christmas, halloween
    homepage_announcement TEXT,
    bogo_active BOOLEAN DEFAULT false,
    discount_percent INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert a default row if empty
INSERT INTO global_settings (theme) SELECT 'dark' WHERE NOT EXISTS (SELECT 1 FROM global_settings);

-- 2. Team Chat & Announcements
CREATE TABLE IF NOT EXISTS team_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID REFERENCES developers(id) ON DELETE CASCADE, -- the team owner
    sender_id UUID REFERENCES developers(id) ON DELETE CASCADE,    -- who sent it
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Update developers & apps for "owner" logic if needed, but developer_id mostly acts as owner.
-- Update team_members for custom roles
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS role_name VARCHAR(50) DEFAULT 'Member';
ALTER TABLE team_members ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '["view_users", "view_licenses"]'::jsonb;

-- 4. Bots for Business Plan
CREATE TABLE IF NOT EXISTS bots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    developer_id UUID REFERENCES developers(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL, -- discord, telegram, whatsapp, custom
    bot_token TEXT,                -- for discord/telegram auth if we hosted it
    custom_api_key VARCHAR(255),   -- for custom self-hosted bots
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Note: Ensure Row Level Security (RLS) policies are configured correctly if you use them, 
-- or simply disable RLS for these tables since the backend API enforces security using developer_id:
ALTER TABLE global_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE team_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE bots DISABLE ROW LEVEL SECURITY;
