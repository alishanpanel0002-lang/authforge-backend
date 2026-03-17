const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
router.use(auth);

router.get('/:app_id', async (req, res) => {
  const { data, error } = await supabase.from('license_tiers').select('*').eq('app_id', req.params.app_id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ tiers: data });
});

router.post('/:app_id', async (req, res) => {
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Tier name required' });
  const { data, error } = await supabase.from('license_tiers').insert([{ app_id: req.params.app_id, name, description }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Tier created', tier: data });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('license_tiers').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Tier deleted' });
});

module.exports = router;
