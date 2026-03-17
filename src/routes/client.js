const router = require('express').Router();
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');

async function getApp(secret_key) {
  const { data } = await supabase.from('apps').select('*').eq('secret_key', secret_key).single();
  return data;
}
async function getLicense(app_id, license_key) {
  const { data } = await supabase.from('licenses').select('*').eq('app_id', app_id).eq('license_key', license_key).single();
  return data;
}

router.post('/register', async (req, res) => {
  const { secret_key, username, password, license_key } = req.body;
  if (!secret_key || !username || !password || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: 'License key not found' });
  if (!license.is_active) return res.status(403).json({ success: false, message: 'License key is disabled' });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: 'License key has expired' });
  if (license.used_slots >= license.max_users)
    return res.status(403).json({ success: false, message: 'License key is full (max ' + license.max_users + ' users)' });
  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.from('app_users')
    .insert([{ app_id: app.id, license_id: license.id, username, password_hash }])
    .select('id, username, created_at').single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  await supabase.from('licenses').update({ used_slots: license.used_slots + 1 }).eq('id', license.id);
  res.json({ success: true, message: 'Registration successful', user: data });
});

router.post('/login', async (req, res) => {
  const { secret_key, username, password, hwid } = req.body;
  if (!secret_key || !username || !password)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  const { data: user } = await supabase.from('app_users').select('*').eq('app_id', app.id).eq('username', username).single();
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  if (user.is_banned) return res.status(403).json({ success: false, message: 'Account is banned' });
  if (user.expires_at && new Date(user.expires_at) < new Date())
    return res.status(403).json({ success: false, message: 'Account has expired' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  if (user.hwid_lock_enabled) {
    if (!hwid) return res.status(403).json({ success: false, message: 'HWID required for this account' });
    const { data: hwids } = await supabase.from('user_hwids').select('*').eq('user_id', user.id);
    const existing = hwids || [];
    const known = existing.find(h => h.hwid === hwid);
    if (!known) {
      if (existing.length >= user.max_hwids)
        return res.status(403).json({ success: false, message: 'Max devices reached (' + user.max_hwids + '). Contact support to reset.' });
      await supabase.from('user_hwids').insert([{ user_id: user.id, hwid }]);
    }
  }
  res.json({ success: true, message: 'Login successful', user: { id: user.id, username: user.username, expires_at: user.expires_at } });
});

router.post('/license/login', async (req, res) => {
  const { secret_key, license_key } = req.body;
  if (!secret_key || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: 'License key not found' });
  if (!license.is_active) return res.status(403).json({ success: false, message: 'License key is disabled' });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: 'License key has expired' });
  res.json({ success: true, message: 'License login successful', license: { id: license.id, expires_at: license.expires_at } });
});

router.post('/license/check', async (req, res) => {
  const { secret_key, license_key } = req.body;
  if (!secret_key || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: 'License not found' });
  if (!license.is_active) return res.status(403).json({ success: false, message: 'License is disabled' });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: 'License expired' });
  res.json({ success: true, message: 'License valid', license: { id: license.id, expires_at: license.expires_at, slots_used: license.used_slots, max_users: license.max_users } });
});

module.exports = router;
