const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

// End user portal — users log in here to see their own info
router.post('/login', async (req, res) => {
  const { secret_key, username, password } = req.body;
  if (!secret_key || !username || !password) return res.status(400).json({ success: false, message: 'Missing fields' });
  const { data: app } = await supabase.from('apps').select('id, name').eq('secret_key', secret_key).single();
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  const { data: user } = await supabase.from('app_users').select('*').eq('app_id', app.id).eq('username', username).single();
  if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  if (user.is_banned) return res.status(403).json({ success: false, message: 'Account is banned' });
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: 'Invalid credentials' });
  const token = jwt.sign({ user_id: user.id, app_id: app.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, expires_at: user.expires_at, created_at: user.created_at } });
});

// Portal auth middleware
function portalAuth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ success: false, message: 'Not authenticated' });
  try { req.portalUser = jwt.verify(token, process.env.JWT_SECRET); next(); }
  catch { res.status(401).json({ success: false, message: 'Invalid token' }); }
}

// Get user's own profile
router.get('/me', portalAuth, async (req, res) => {
  const { data: user } = await supabase.from('app_users')
    .select('id, username, email, expires_at, created_at, hwid_lock_enabled, max_hwids, license_tiers(name)')
    .eq('id', req.portalUser.user_id).single();
  if (!user) return res.status(404).json({ success: false, message: 'User not found' });
  const { data: hwids } = await supabase.from('user_hwids').select('id, hwid, created_at').eq('user_id', user.id);
  const { data: license } = await supabase.from('licenses').select('license_key, expires_at, is_active').eq('id', user.license_id || '').single();
  res.json({ success: true, user, hwids: hwids || [], license: license || null });
});

// Change own password
router.post('/change-password', portalAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ success: false, message: 'Both passwords required' });
  const { data: user } = await supabase.from('app_users').select('password_hash').eq('id', req.portalUser.user_id).single();
  const valid = await bcrypt.compare(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ success: false, message: 'Current password incorrect' });
  const password_hash = await bcrypt.hash(new_password, 10);
  await supabase.from('app_users').update({ password_hash }).eq('id', req.portalUser.user_id);
  res.json({ success: true, message: 'Password changed successfully' });
});

module.exports = router;
