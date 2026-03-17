const router = require('express').Router();
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/:app_id', async (req, res) => {
  const { data, error } = await supabase.from('app_users')
    .select('id, username, email, is_banned, created_at, license_id, expires_at, hwid_lock_enabled, max_hwids')
    .eq('app_id', req.params.app_id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ users: data });
});

router.post('/:app_id/create', async (req, res) => {
  const { username, password, email, license_id, expires_at, hwid_lock_enabled, max_hwids } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  const password_hash = await bcrypt.hash(password, 10);
  if (license_id) {
    const { data: lic } = await supabase.from('licenses').select('*').eq('id', license_id).single();
    if (!lic) return res.status(404).json({ error: 'License not found' });
    if (lic.used_slots >= lic.max_users) return res.status(403).json({ error: 'License is full' });
    const { data, error } = await supabase.from('app_users')
      .insert([{ app_id: req.params.app_id, username, password_hash, email: email || null, license_id,
        expires_at: expires_at || null, hwid_lock_enabled: hwid_lock_enabled || false, max_hwids: max_hwids || 1 }])
      .select('id, username, email, created_at').single();
    if (error) return res.status(400).json({ error: error.message });
    await supabase.from('licenses').update({ used_slots: lic.used_slots + 1 }).eq('id', license_id);
    return res.json({ message: 'User created', user: data });
  }
  const { data, error } = await supabase.from('app_users')
    .insert([{ app_id: req.params.app_id, username, password_hash, email: email || null,
      expires_at: expires_at || null, hwid_lock_enabled: hwid_lock_enabled || false, max_hwids: max_hwids || 1 }])
    .select('id, username, email, created_at').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'User created', user: data });
});

router.patch('/:id', async (req, res) => {
  const allowed = ['is_banned','expires_at','hwid_lock_enabled','max_hwids'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  const { data, error } = await supabase.from('app_users').update(updates).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'User updated', user: data });
});

router.get('/:id/hwids', async (req, res) => {
  const { data, error } = await supabase.from('user_hwids').select('*').eq('user_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ hwids: data });
});

router.delete('/:id/hwids', async (req, res) => {
  const { error } = await supabase.from('user_hwids').delete().eq('user_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'HWIDs reset' });
});

router.delete('/:id/hwids/:hwid_id', async (req, res) => {
  const { error } = await supabase.from('user_hwids').delete().eq('id', req.params.hwid_id).eq('user_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'HWID removed' });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('app_users').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'User deleted' });
});

module.exports = router;
