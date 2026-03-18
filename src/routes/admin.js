const router = require('express').Router();
const supabase = require('../supabase');
const adminAuth = require('../middleware/adminAuth');

router.use(adminAuth);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  const [devs, apps, users, licenses] = await Promise.all([
    supabase.from('developers').select('id', { count: 'exact' }),
    supabase.from('apps').select('id', { count: 'exact' }),
    supabase.from('app_users').select('id', { count: 'exact' }),
    supabase.from('licenses').select('id', { count: 'exact' })
  ]);
  res.json({
    developers: devs.count || 0,
    apps: apps.count || 0,
    users: users.count || 0,
    licenses: licenses.count || 0
  });
});

// GET /api/admin/config
router.get('/config', async (req, res) => {
  const { data, error } = await supabase.from('global_settings').select('*').limit(1).single();
  if (error || !data) return res.json({ config: { theme: 'dark', homepage_announcement: null, bogo_active: false, discount_percent: 0 } });
  res.json({ config: data });
});

// PATCH /api/admin/config
router.patch('/config', async (req, res) => {
  const { theme, homepage_announcement, bogo_active, discount_percent } = req.body;
  const updates = { updated_at: new Date().toISOString() };
  if (theme !== undefined) updates.theme = theme;
  if (homepage_announcement !== undefined) updates.homepage_announcement = homepage_announcement;
  if (bogo_active !== undefined) updates.bogo_active = bogo_active;
  if (discount_percent !== undefined) updates.discount_percent = discount_percent;

  const { data: existing } = await supabase.from('global_settings').select('id').limit(1).single();
  let result;
  if (existing) {
    result = await supabase.from('global_settings').update(updates).eq('id', existing.id).select().single();
  } else {
    result = await supabase.from('global_settings').insert([updates]).select().single();
  }
  
  if (result.error) return res.status(400).json({ error: result.error.message });
  res.json({ message: 'Global config updated', config: result.data });
});

// GET /api/admin/developers
router.get('/developers', async (req, res) => {
  const { data, error } = await supabase.from('developers')
    .select('id, email, username, created_at, is_admin').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ developers: data });
});

// PATCH /api/admin/developers/:id/ban — toggle ban by deleting all tokens (future) or flagging
// Now also allows changing plan and plan_expires_at (Owner ID support feature)
router.patch('/developers/:id', async (req, res) => {
  const { is_admin, plan, plan_expires_at } = req.body;
  const updates = {};
  if (is_admin !== undefined) updates.is_admin = is_admin;
  if (plan !== undefined) updates.plan = plan;
  if (plan_expires_at !== undefined) updates.plan_expires_at = plan_expires_at;
  
  const { data, error } = await supabase.from('developers').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Developer updated', developer: data });
});

// DELETE /api/admin/developers/:id
router.delete('/developers/:id', async (req, res) => {
  const { error } = await supabase.from('developers').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Developer deleted' });
});

// GET /api/admin/apps
router.get('/apps', async (req, res) => {
  const { data, error } = await supabase.from('apps')
    .select('*, developers(username, email)').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ apps: data });
});

module.exports = router;
