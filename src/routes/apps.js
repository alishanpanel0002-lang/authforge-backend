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
  const { data, error } = await supabase.from('apps').insert([{ name, developer_id: req.developer.id }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'App created', app: data });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('apps').delete().eq('id', req.params.id).eq('developer_id', req.developer.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'App deleted' });
});

router.get('/:id/settings', async (req, res) => {
  const { data, error } = await supabase.from('apps')
    .select('id, name, discord_webhook, error_messages, ip_whitelist_enabled')
    .eq('id', req.params.id).eq('developer_id', req.developer.id).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ settings: data });
});

router.patch('/:id/settings', async (req, res) => {
  const allowed = ['discord_webhook','error_messages','ip_whitelist_enabled'];
  const updates = {};
  allowed.forEach(k => { if (req.body[k] !== undefined) updates[k] = req.body[k]; });
  const { data, error } = await supabase.from('apps').update(updates).eq('id', req.params.id).eq('developer_id', req.developer.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Settings saved', app: data });
});

// IP Whitelist
router.get('/:id/ip-whitelist', async (req, res) => {
  const { data, error } = await supabase.from('ip_whitelist').select('*').eq('app_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ ips: data });
});

router.post('/:id/ip-whitelist', async (req, res) => {
  const { ip_address, label } = req.body;
  if (!ip_address) return res.status(400).json({ error: 'IP address required' });
  const { data, error } = await supabase.from('ip_whitelist').insert([{ app_id: req.params.id, ip_address, label }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'IP added', ip: data });
});

router.delete('/:id/ip-whitelist/:ip_id', async (req, res) => {
  const { error } = await supabase.from('ip_whitelist').delete().eq('id', req.params.ip_id).eq('app_id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'IP removed' });
});

module.exports = router;
