const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
router.use(auth);

router.get('/:app_id', async (req, res) => {
  const { data, error } = await supabase.from('licenses')
    .select('*, license_tiers(name)').eq('app_id', req.params.app_id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ licenses: data });
});

// Single license generation
router.post('/:app_id', async (req, res) => {
  const { max_users, expires_at, tier_id, prefix } = req.body;
  let license_key = undefined;
  if (prefix) {
    const rand = require('crypto').randomBytes(8).toString('hex').toUpperCase();
    license_key = prefix.toUpperCase() + '-' + rand.match(/.{4}/g).join('-');
  }
  const insert = { app_id: req.params.app_id, max_users: max_users || 1, expires_at: expires_at || null };
  if (tier_id) insert.tier_id = tier_id;
  if (license_key) insert.license_key = license_key;
  const { data, error } = await supabase.from('licenses').insert([insert]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License created', license: data });
});

// Bulk generation
router.post('/:app_id/bulk', async (req, res) => {
  const { count, max_users, expires_at, tier_id, prefix } = req.body;
  const qty = Math.min(parseInt(count) || 1, 500);
  const crypto = require('crypto');
  const inserts = Array.from({ length: qty }, () => {
    let license_key;
    if (prefix) {
      const rand = crypto.randomBytes(8).toString('hex').toUpperCase();
      license_key = prefix.toUpperCase() + '-' + rand.match(/.{4}/g).join('-');
    }
    const row = { app_id: req.params.app_id, max_users: max_users || 1, expires_at: expires_at || null };
    if (tier_id) row.tier_id = tier_id;
    if (license_key) row.license_key = license_key;
    return row;
  });
  const { data, error } = await supabase.from('licenses').insert(inserts).select();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: qty + ' licenses created', licenses: data });
});

router.patch('/:id/toggle', async (req, res) => {
  const { is_active } = req.body;
  const { data, error } = await supabase.from('licenses').update({ is_active }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License updated', license: data });
});

// Transfer license to another user
router.patch('/:id/transfer', async (req, res) => {
  const { user_id } = req.body;
  const { data, error } = await supabase.from('licenses').update({ assigned_to: user_id }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License transferred', license: data });
});

router.delete('/:id', async (req, res) => {
  const { error } = await supabase.from('licenses').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License deleted' });
});

module.exports = router;
