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

// Get custom error message or fall back to default
function err(app, key, fallback) {
  const msgs = app.error_messages || {};
  return msgs[key] || fallback;
}

// POST /api/client/register
router.post('/register', async (req, res) => {
  const { secret_key, username, password, license_key } = req.body;
  if (!secret_key || !username || !password || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields: secret_key, username, password, license_key required' });

  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });

  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: err(app, 'err_license_invalid', 'License key not found') });
  if (!license.is_active) return res.status(403).json({ success: false, message: err(app, 'err_license_disabled', 'License key is disabled') });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: err(app, 'err_license_expired', 'License key has expired') });
  if (license.used_slots >= license.max_users) {
    await sendWebhook(app.discord_webhook, 'license_full', [
      { name: 'App', value: app.name },
      { name: 'License Key', value: license_key },
      { name: 'Attempted Username', value: username },
      { name: 'Slots', value: license.used_slots + '/' + license.max_users }
    ]);
    return res.status(403).json({ success: false, message: err(app, 'err_license_full', 'License key is full (max ' + license.max_users + ' users)') });
  }

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.from('app_users')
    .insert([{ app_id: app.id, license_id: license.id, username, password_hash }])
    .select('id, username, created_at').single();
  if (error) return res.status(400).json({ success: false, message: error.message });

  await supabase.from('licenses').update({ used_slots: license.used_slots + 1 }).eq('id', license.id);

  await sendWebhook(app.discord_webhook, 'register', [
    { name: 'App', value: app.name },
    { name: 'Username', value: username },
    { name: 'License Key', value: license_key }
  ]);

  res.json({ success: true, message: 'Registration successful', user: data });
});

// POST /api/client/login
router.post('/login', async (req, res) => {
  const { secret_key, username, password, hwid } = req.body;
  if (!secret_key || !username || !password)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });

  const { data: user } = await supabase.from('app_users').select('*')
    .eq('app_id', app.id).eq('username', username).single();

  if (!user) {
    await sendWebhook(app.discord_webhook, 'login_failed', [
      { name: 'App', value: app.name },
      { name: 'Username', value: username },
      { name: 'Reason', value: 'User not found' }
    ]);
    return res.status(401).json({ success: false, message: err(app, 'err_invalid_credentials', 'Invalid credentials') });
  }

  if (user.is_banned) {
    await sendWebhook(app.discord_webhook, 'login_failed', [
      { name: 'App', value: app.name },
      { name: 'Username', value: username },
      { name: 'Reason', value: 'Account banned' }
    ]);
    return res.status(403).json({ success: false, message: err(app, 'err_banned', 'Your account has been banned') });
  }

  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    await sendWebhook(app.discord_webhook, 'login_failed', [
      { name: 'App', value: app.name },
      { name: 'Username', value: username },
      { name: 'Reason', value: 'Account expired' }
    ]);
    return res.status(403).json({ success: false, message: err(app, 'err_expired', 'Your account has expired') });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    await sendWebhook(app.discord_webhook, 'login_failed', [
      { name: 'App', value: app.name },
      { name: 'Username', value: username },
      { name: 'Reason', value: 'Wrong password' }
    ]);
    return res.status(401).json({ success: false, message: err(app, 'err_invalid_credentials', 'Invalid credentials') });
  }

  // HWID check
  if (user.hwid_lock_enabled) {
    if (!hwid) return res.status(403).json({ success: false, message: err(app, 'err_hwid_required', 'HWID required for this account') });
    const { data: hwids } = await supabase.from('user_hwids').select('*').eq('user_id', user.id);
    const existing = hwids || [];
    const known = existing.find(h => h.hwid === hwid);
    if (!known) {
      if (existing.length >= user.max_hwids) {
        await sendWebhook(app.discord_webhook, 'hwid_blocked', [
          { name: 'App', value: app.name },
          { name: 'Username', value: username },
          { name: 'Blocked HWID', value: hwid },
          { name: 'Max Devices', value: String(user.max_hwids) }
        ]);
        return res.status(403).json({ success: false, message: err(app, 'err_hwid_max_reached', 'Max devices reached (' + user.max_hwids + '). Contact support to reset.') });
      }
      await supabase.from('user_hwids').insert([{ user_id: user.id, hwid }]);
    }
  }

  await sendWebhook(app.discord_webhook, 'login', [
    { name: 'App', value: app.name },
    { name: 'Username', value: username },
    { name: 'HWID', value: hwid || 'Not provided' }
  ]);

  res.json({ success: true, message: 'Login successful', user: { id: user.id, username: user.username, expires_at: user.expires_at } });
});

// POST /api/client/license/login
router.post('/license/login', async (req, res) => {
  const { secret_key, license_key } = req.body;
  if (!secret_key || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields' });

  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });

  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: err(app, 'err_license_invalid', 'License key not found') });
  if (!license.is_active) return res.status(403).json({ success: false, message: err(app, 'err_license_disabled', 'License key is disabled') });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: err(app, 'err_license_expired', 'License key has expired') });

  await sendWebhook(app.discord_webhook, 'login', [
    { name: 'App', value: app.name },
    { name: 'Type', value: 'License key login' },
    { name: 'License Key', value: license_key }
  ]);

  res.json({ success: true, message: 'License login successful', license: { id: license.id, expires_at: license.expires_at } });
});

// POST /api/client/license/check
router.post('/license/check', async (req, res) => {
  const { secret_key, license_key } = req.body;
  if (!secret_key || !license_key)
    return res.status(400).json({ success: false, message: 'Missing fields' });
  const app = await getApp(secret_key);
  if (!app) return res.status(401).json({ success: false, message: 'Invalid app key' });
  const license = await getLicense(app.id, license_key);
  if (!license) return res.status(404).json({ success: false, message: err(app, 'err_license_invalid', 'License not found') });
  if (!license.is_active) return res.status(403).json({ success: false, message: err(app, 'err_license_disabled', 'License is disabled') });
  if (license.expires_at && new Date(license.expires_at) < new Date())
    return res.status(403).json({ success: false, message: err(app, 'err_license_expired', 'License expired') });
  res.json({ success: true, message: 'License valid', license: { id: license.id, expires_at: license.expires_at, slots_used: license.used_slots, max_users: license.max_users } });
});

module.exports = router;
