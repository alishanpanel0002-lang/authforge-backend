const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
router.use(auth);

// Helper: verify that app_id belongs to the authenticated developer
async function verifyAppOwnership(app_id, developer_id) {
  const { data } = await supabase.from('apps').select('id').eq('id', app_id).eq('developer_id', developer_id).single();
  return !!data;
}

// Helper: verify that a tier's app belongs to the authenticated developer
async function verifyTierOwnership(tier_id, developer_id) {
  const { data: tier } = await supabase.from('license_tiers').select('app_id').eq('id', tier_id).single();
  if (!tier) return false;
  return verifyAppOwnership(tier.app_id, developer_id);
}

router.get('/:app_id', async (req, res) => {
  if (!(await verifyAppOwnership(req.params.app_id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
  const { data, error } = await supabase.from('license_tiers').select('*').eq('app_id', req.params.app_id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ tiers: data });
});

router.post('/:app_id', async (req, res) => {
  if (!(await verifyAppOwnership(req.params.app_id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
  const { name, description } = req.body;
  if (!name) return res.status(400).json({ error: 'Tier name required' });
  const { data, error } = await supabase.from('license_tiers').insert([{ app_id: req.params.app_id, name, description }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Tier created', tier: data });
});

router.delete('/:id', async (req, res) => {
  if (!(await verifyTierOwnership(req.params.id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
  const { error } = await supabase.from('license_tiers').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Tier deleted' });
});

module.exports = router;
