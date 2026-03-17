const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/:app_id', async (req, res) => {
  const { data, error } = await supabase.from('licenses')
    .select('*').eq('app_id', req.params.app_id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ licenses: data });
});

router.post('/:app_id', async (req, res) => {
  const { max_users, expires_at } = req.body;
  const { data, error } = await supabase.from('licenses')
    .insert([{ app_id: req.params.app_id, max_users: max_users || 1, expires_at: expires_at || null }])
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License created', license: data });
});

router.patch('/:id/toggle', async (req, res) => {
  const { is_active } = req.body;
  const { data, error } = await supabase.from('licenses')
    .update({ is_active }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License updated', license: data });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('licenses').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License deleted' });
});

module.exports = router;
