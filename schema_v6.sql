-- Schema V6: Global Settings & BOGO Support
CREATE TABLE IF NOT EXISTS global_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    theme TEXT DEFAULT 'dark',
    homepage_announcement TEXT,
    bogo_active BOOLEAN DEFAULT FALSE,
    discount_percent INTEGER DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with default if empty
INSERT INTO global_settings (theme, bogo_active, discount_percent)
SELECT 'dark', false, 0
WHERE NOT EXISTS (SELECT 1 FROM global_settings);

-- Add column if table existed but column didn't (safeguard)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='global_settings' AND column_name='bogo_active') THEN
        ALTER TABLE global_settings ADD COLUMN bogo_active BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
