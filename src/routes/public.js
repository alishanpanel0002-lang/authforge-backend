const router = require('express').Router();
const supabase = require('../supabase');

// 1. Get global site config (Theme, announcement, promos)
router.get('/config', async (req, res) => {
  try {
    const { data } = await supabase.from('global_settings').select('*').order('updated_at', { ascending: false }).limit(1);
    const config = (data && data[0]) || { theme: 'dark', homepage_announcement: null, bogo_active: false, discount_percent: 0 };
    res.json({ config });
  } catch (e) {
    res.json({ config: { theme: 'dark', homepage_announcement: null, bogo_active: false, discount_percent: 0 } });
  }
});

// 2. Get public team details (Admins and Devs for Homepage)
router.get('/team', async (req, res) => {
  // Try to parse out stats and team from developers
  const { data: admins, error: adminErr } = await supabase.from('developers')
    .select('username, avatar_url, discord_username, plan, created_at')
    .eq('is_admin', true)
    .order('created_at', { ascending: false });
    
  // Add some random/recent normal developers just to show standard devs too
  const { data: devs, error: devErr } = await supabase.from('developers')
    .select('username, avatar_url, discord_username, plan, created_at')
    .eq('is_admin', false)
    .order('created_at', { ascending: false })
    .limit(10);
    
  if (adminErr || devErr) return res.status(400).json({ error: adminErr?.message || devErr?.message });
  
  res.json({ admins, developers: devs });
});

module.exports = router;
