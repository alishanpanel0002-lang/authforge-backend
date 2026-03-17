const router = require('express').Router();
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
