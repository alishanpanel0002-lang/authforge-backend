const router = require('express').Router();
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/:app_id', async (req, res) => {
  const { data, error } = await supabase.from('app_users')
    .select('id, username, email, is_banned, created_at, license_id')
    .eq('app_id', req.params.app_id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ users: data });
});

// Owner creates a user manually and optionally assigns a license
router.post('/:app_id/create', async (req, res) => {
  const { username, password, email, license_id } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const password_hash = await bcrypt.hash(password, 10);

  // If license assigned, check slots
  if (license_id) {
    const { data: lic } = await supabase.from('licenses').select('*').eq('id', license_id).single();
    if (!lic) return res.status(404).json({ error: 'License not found' });
    if (lic.used_slots >= lic.max_users)
      return res.status(403).json({ error: `License is full (${lic.max_users} max users)` });

    const { data, error } = await supabase.from('app_users')
      .insert([{ app_id: req.params.app_id, username, password_hash, email: email || null, license_id }])
      .select('id, username, email, created_at').single();
    if (error) return res.status(400).json({ error: error.message });

    // Increment used_slots
    await supabase.from('licenses').update({ used_slots: lic.used_slots + 1 }).eq('id', license_id);
    return res.json({ message: 'User created', user: data });
  }

  const { data, error } = await supabase.from('app_users')
    .insert([{ app_id: req.params.app_id, username, password_hash, email: email || null }])
    .select('id, username, email, created_at').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'User created', user: data });
});

router.patch('/:id/ban', async (req, res) => {
  const { is_banned } = req.body;
  const { data, error } = await supabase.from('app_users')
    .update({ is_banned }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'User updated', user: data });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('app_users').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'User deleted' });
});

module.exports = router;
