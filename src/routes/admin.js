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

// GET /api/admin/developers
router.get('/developers', async (req, res) => {
  const { data, error } = await supabase.from('developers')
    .select('id, email, username, created_at, is_admin').order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ developers: data });
});

// PATCH /api/admin/developers/:id/ban — toggle ban by deleting all tokens (future) or flagging
router.patch('/developers/:id', async (req, res) => {
  const { is_admin } = req.body;
  const updates = {};
  if (is_admin !== undefined) updates.is_admin = is_admin;
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
