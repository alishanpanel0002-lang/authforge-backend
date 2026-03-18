const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const { checkLicenseLimit } = require('../middleware/planLimits');
router.use(auth);

// Helper: verify that app_id belongs to the authenticated developer
async function verifyAppOwnership(app_id, developer_id) {
  const { data } = await supabase.from('apps').select('id').eq('id', app_id).eq('developer_id', developer_id).single();
  return !!data;
}

// Helper: verify that a license's app belongs to the authenticated developer
async function verifyLicenseOwnership(license_id, developer_id) {
  const { data: lic } = await supabase.from('licenses').select('app_id').eq('id', license_id).single();
  if (!lic) return false;
  return verifyAppOwnership(lic.app_id, developer_id);
}

router.get('/:app_id', async (req, res) => {
  if (!(await verifyAppOwnership(req.params.app_id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
  const { data, error } = await supabase.from('licenses')
    .select('*, license_tiers(name)').eq('app_id', req.params.app_id).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ licenses: data });
});

// Single — check limit
router.post('/:app_id', checkLicenseLimit, async (req, res) => {
  if (!(await verifyAppOwnership(req.params.app_id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
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

// Bulk — check limit, then cap against remaining quota to prevent overshoot
router.post('/:app_id/bulk', checkLicenseLimit, async (req, res) => {
  if (!(await verifyAppOwnership(req.params.app_id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });

  const { count, max_users, expires_at, tier_id, prefix } = req.body;
  const { data: dev } = await supabase.from('developers').select('plan').eq('id', req.developer.id).single();
  const LIMITS = { starter: 20, pro: -1, business: -1 };
  const planLimit = LIMITS[dev?.plan] !== undefined ? LIMITS[dev.plan] : LIMITS.starter;

  let requested = Math.min(parseInt(count) || 1, 500);
  if (planLimit !== -1) {
    const { count: existing } = await supabase.from('licenses').select('id', { count: 'exact' }).eq('app_id', req.params.app_id);
    const remaining = planLimit - (existing || 0);
    if (remaining <= 0) return res.status(403).json({ error: 'License limit reached for your plan. Upgrade to create more.' });
    requested = Math.min(requested, remaining);
  }

  const crypto = require('crypto');
  const inserts = Array.from({ length: requested }, () => {
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
  res.json({ message: requested + ' licenses created', licenses: data });
});

router.patch('/:id/toggle', async (req, res) => {
  if (!(await verifyLicenseOwnership(req.params.id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
  const { is_active } = req.body;
  const { data, error } = await supabase.from('licenses').update({ is_active }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License updated', license: data });
});

router.patch('/:id/transfer', async (req, res) => {
  if (!(await verifyLicenseOwnership(req.params.id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
  const { user_id } = req.body;
  const { data, error } = await supabase.from('licenses').update({ assigned_to: user_id }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License transferred', license: data });
});

router.delete('/:id', async (req, res) => {
  if (!(await verifyLicenseOwnership(req.params.id, req.developer.id)))
    return res.status(403).json({ error: 'Access denied' });
  const { error } = await supabase.from('licenses').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License deleted' });
});

module.exports = router;
