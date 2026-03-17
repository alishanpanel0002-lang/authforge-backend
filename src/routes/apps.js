const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/', async (req, res) => {
  const { data, error } = await supabase.from('apps').select('*').eq('developer_id', req.developer.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ apps: data });
});

router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'App name required' });
  const { data, error } = await supabase.from('apps')
    .insert([{ name, developer_id: req.developer.id }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'App created', app: data });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('apps')
    .delete().eq('id', req.params.id).eq('developer_id', req.developer.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'App deleted' });
});

// Get app settings (webhook + error messages)
router.get('/:id/settings', async (req, res) => {
  const { data, error } = await supabase.from('apps')
    .select('id, name, discord_webhook, error_messages')
    .eq('id', req.params.id).eq('developer_id', req.developer.id).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ settings: data });
});

// Update app settings
router.patch('/:id/settings', async (req, res) => {
  const { discord_webhook, error_messages } = req.body;
  const updates = {};
  if (discord_webhook !== undefined) updates.discord_webhook = discord_webhook;
  if (error_messages !== undefined) updates.error_messages = error_messages;
  const { data, error } = await supabase.from('apps')
    .update(updates).eq('id', req.params.id).eq('developer_id', req.developer.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Settings saved', app: data });
});

module.exports = router;
