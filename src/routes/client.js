const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');

// Helper: verify app secret key
async function getApp(secret_key) {
  const { data } = await supabase
    .from('apps')
    .select('*')
    .eq('secret_key', secret_key)
    .single();
  return data;
}

// POST /api/client/register - Register end user in an app
router.post('/register', async (req, res) => {
  const { secret_key, username, password, email } = req.body;
  if (!secret_key || !username || !password)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });

  const password_hash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('app_users')
    .insert([{ app_id: app.id, username, password_hash, email }])
    .select('id, username, email, created_at')
    .single();

  if (error) return res.status(400).json({ success: false, message: error.message });
  res.json({ success: true, message: 'User registered', user: data });
});

// POST /api/client/login - Login end user
router.post('/login', async (req, res) => {
  const { secret_key, username, password } = req.body;
  if (!secret_key || !username || !password)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });

  const { data: user } = await supabase
    .from('app_users')
    .select('*')
    .eq('app_id', app.id)
    .eq('username', username)
    .single();

  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  if (user.is_banned) return res.status(403).json({ success: false, message: 'User is banned' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });

  res.json({ success: true, message: 'Login successful', user: { id: user.id, username: user.username, email: user.email } });
});

// POST /api/client/license/check - Validate a license key
router.post('/license/check', async (req, res) => {
  const { secret_key, license_key } = req.body;
  if (!secret_key || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });

  const { data: license } = await supabase
    .from('licenses')
    .select('*')
    .eq('app_id', app.id)
    .eq('license_key', license_key)
    .single();

  if (!license) return res.status(404).json({ success: false, message: 'License not found' });
  if (!license.is_active) return res.status(403).json({ success: false, message: 'License is disabled' });

  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: 'License expired' });

  res.json({ success: true, message: 'License valid', license: { id: license.id, expires_at: license.expires_at } });
});

module.exports = router;
