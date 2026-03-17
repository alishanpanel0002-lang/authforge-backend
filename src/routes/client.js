const router = require('express').Router();
const bcrypt = require('bcryptjs');
const supabase = require('../supabase');
const { sendWebhook } = require('../discord');

async function getApp(secret_key) {
  const { data } = await supabase.from('apps').select('*').eq('secret_key', secret_key).single();
  return data;
}
async function getLicense(app_id, license_key) {
  const { data } = await supabase.from('licenses').select('*').eq('app_id', app_id).eq('license_key', license_key).single();
  return data;
}
function err(app, key, fallback) {
  return (app.error_messages || {})[key] || fallback;
}
function getIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
}

async function logLogin(app_id, username, success, fail_reason, ip, hwid) {
  await supabase.from('login_logs').insert([{ app_id, username, ip_address: ip, success, fail_reason: fail_reason || null, hwid: hwid || null }]);
}

async function checkIPWhitelist(app, ip) {
  if (!app.ip_whitelist_enabled) return true;
  const { data } = await supabase.from('ip_whitelist').select('id').eq('app_id', app.id).eq('ip_address', ip).single();
  return !!data;
}

router.post('/register', async (req, res) => {
  const { secret_key, username, password, license_key } = req.body;
  const ip = getIP(req);
  if (!secret_key || !username || !password || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  if (!(await checkIPWhitelist(app, ip))) {
    await sendWebhook(app, 'ip_blocked', [{ name: 'IP', value: ip }, { name: 'Action', value: 'Register attempt' }]);
    return res.status(403).json({ success: false, message: err(app, 'err_ip_blocked', 'Access denied from your IP address') });
  }
  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: err(app, 'err_license_invalid', 'License key not found') });
  if (!license.is_active) return res.status(403).json({ success: false, message: err(app, 'err_license_disabled', 'License key is disabled') });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: err(app, 'err_license_expired', 'License key has expired') });
  if (license.used_slots >= license.max_users) {
    await sendWebhook(app, 'license_full', [{ name: 'App', value: app.name }, { name: 'License', value: license_key }, { name: 'Attempted by', value: username }]);
    return res.status(403).json({ success: false, message: err(app, 'err_license_full', 'License key is full') });
  }
  const password_hash = await bcrypt.hash(password, 10);
  const insert = { app_id: app.id, license_id: license.id, username, password_hash };
  if (license.tier_id) insert.tier_id = license.tier_id;
  const { data, error } = await supabase.from('app_users').insert([insert]).select('id, username, created_at').single();
  if (error) return res.status(400).json({ success: false, message: error.message });
  await supabase.from('licenses').update({ used_slots: license.used_slots + 1 }).eq('id', license.id);
  await sendWebhook(app, 'register', [{ name: 'App', value: app.name }, { name: 'Username', value: username }, { name: 'IP', value: ip }]);
  await logLogin(app.id, username, true, null, ip, null);
  res.json({ success: true, message: 'Registration successful', user: data });
});

router.post('/login', async (req, res) => {
  const { secret_key, username, password, hwid } = req.body;
  const ip = getIP(req);
  if (!secret_key || !username || !password)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  if (!(await checkIPWhitelist(app, ip))) {
    await sendWebhook(app, 'ip_blocked', [{ name: 'IP', value: ip }, { name: 'Username', value: username }]);
    await logLogin(app.id, username, false, 'IP blocked', ip, hwid);
    return res.status(403).json({ success: false, message: err(app, 'err_ip_blocked', 'Access denied from your IP address') });
  }
  const { data: user } = await supabase.from('app_users').select('*').eq('app_id', app.id).eq('username', username).single();
  if (!user) {
    await sendWebhook(app, 'login_failed', [{ name: 'App', value: app.name }, { name: 'Username', value: username }, { name: 'Reason', value: 'User not found' }, { name: 'IP', value: ip }]);
    await logLogin(app.id, username, false, 'User not found', ip, hwid);
    return res.status(401).json({ success: false, message: err(app, 'err_invalid_credentials', 'Invalid credentials') });
  }
  if (user.is_banned) {
    await sendWebhook(app, 'login_failed', [{ name: 'App', value: app.name }, { name: 'Username', value: username }, { name: 'Reason', value: 'Banned' }, { name: 'IP', value: ip }]);
    await logLogin(app.id, username, false, 'Banned', ip, hwid);
    return res.status(403).json({ success: false, message: err(app, 'err_banned', 'Your account has been banned') });
  }
  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    await logLogin(app.id, username, false, 'Expired', ip, hwid);
    return res.status(403).json({ success: false, message: err(app, 'err_expired', 'Your account has expired') });
  }
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await sendWebhook(app, 'login_failed', [{ name: 'App', value: app.name }, { name: 'Username', value: username }, { name: 'Reason', value: 'Wrong password' }, { name: 'IP', value: ip }]);
    await logLogin(app.id, username, false, 'Wrong password', ip, hwid);
    return res.status(401).json({ success: false, message: err(app, 'err_invalid_credentials', 'Invalid credentials') });
  }
  if (user.hwid_lock_enabled) {
    if (!hwid) return res.status(403).json({ success: false, message: err(app, 'err_hwid_required', 'HWID required') });
    const { data: hwids } = await supabase.from('user_hwids').select('*').eq('user_id', user.id);
    const existing = hwids || [];
    if (!existing.find(h => h.hwid === hwid)) {
      if (existing.length >= user.max_hwids) {
        await sendWebhook(app, 'hwid_blocked', [{ name: 'App', value: app.name }, { name: 'Username', value: username }, { name: 'HWID', value: hwid }, { name: 'Max', value: String(user.max_hwids) }]);
        await logLogin(app.id, username, false, 'HWID max reached', ip, hwid);
        return res.status(403).json({ success: false, message: err(app, 'err_hwid_max_reached', 'Max devices reached') });
      }
      await supabase.from('user_hwids').insert([{ user_id: user.id, hwid }]);
    }
  }
  await sendWebhook(app, 'login', [{ name: 'App', value: app.name }, { name: 'Username', value: username }, { name: 'IP', value: ip }, { name: 'HWID', value: hwid || 'N/A' }]);
  await logLogin(app.id, username, true, null, ip, hwid);
  res.json({ success: true, message: 'Login successful', user: { id: user.id, username: user.username, expires_at: user.expires_at, tier_id: user.tier_id } });
});

router.post('/license/login', async (req, res) => {
  const { secret_key, license_key } = req.body;
  const ip = getIP(req);
  if (!secret_key || !license_key) return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  if (!(await checkIPWhitelist(app, ip)))
    return res.status(403).json({ success: false, message: err(app, 'err_ip_blocked', 'Access denied') });
  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: err(app, 'err_license_invalid', 'License not found') });
  if (!license.is_active) return res.status(403).json({ success: false, message: err(app, 'err_license_disabled', 'License disabled') });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: err(app, 'err_license_expired', 'License expired') });
  await sendWebhook(app, 'login', [{ name: 'App', value: app.name }, { name: 'Type', value: 'License login' }, { name: 'IP', value: ip }]);
  res.json({ success: true, message: 'License login successful', license: { id: license.id, expires_at: license.expires_at } });
});

router.post('/license/check', async (req, res) => {
  const { secret_key, license_key } = req.body;
  if (!secret_key || !license_key) return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: err(app, 'err_license_invalid', 'License not found') });
  if (!license.is_active) return res.status(403).json({ success: false, message: err(app, 'err_license_disabled', 'License disabled') });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: err(app, 'err_license_expired', 'License expired') });
  res.json({ success: true, message: 'License valid', license: { id: license.id, expires_at: license.expires_at, slots_used: license.used_slots, max_users: license.max_users } });
});

module.exports = router;
