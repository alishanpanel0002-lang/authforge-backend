const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const fetch = require('node-fetch');
const supabase = require('../supabase');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function makeToken(dev) {
  return jwt.sign({ id: dev.id, email: dev.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Register
router.post('/register', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ error: 'All fields required' });
  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase.from('developers')
    .insert([{ email, username, password_hash }])
    .select('id, email, username, plan, created_at').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Registered successfully', developer: data, token: makeToken(data) });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password, totp_code } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const { data, error } = await supabase.from('developers').select('*').eq('email', email).single();
  if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, data.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  // 2FA check
  if (data.two_factor_enabled) {
    if (!totp_code) return res.status(200).json({ requires_2fa: true });
    const { totp } = require('otpauth');
    const t = new totp({ secret: data.two_factor_secret });
    if (t.validate({ token: totp_code, window: 1 }) === null)
      return res.status(401).json({ error: 'Invalid 2FA code' });
  }

  res.json({ message: 'Login successful', token: makeToken(data), developer: { id: data.id, email: data.email, username: data.username, plan: data.plan, avatar_url: data.avatar_url } });
});

// Google OAuth
router.post('/google', async (req, res) => {
  const { id_token } = req.body;
  if (!id_token) return res.status(400).json({ error: 'id_token required' });
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: google_id } = payload;

    // Check if developer exists
    let { data: dev } = await supabase.from('developers').select('*').eq('google_id', google_id).single();
    if (!dev) {
      // Check by email
      let { data: existing } = await supabase.from('developers').select('*').eq('email', email).single();
      if (existing) {
        // Link Google to existing account
        await supabase.from('developers').update({ google_id, avatar_url: picture }).eq('id', existing.id);
        dev = { ...existing, google_id, avatar_url: picture };
      } else {
        // Create new account
        const username = name.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 999);
        const { data: newDev, error } = await supabase.from('developers')
          .insert([{ email, username, password_hash: '', google_id, avatar_url: picture }])
          .select('*').single();
        if (error) return res.status(400).json({ error: error.message });
        dev = newDev;
      }
    }
    res.json({ message: 'Google login successful', token: makeToken(dev), developer: { id: dev.id, email: dev.email, username: dev.username, plan: dev.plan, avatar_url: dev.avatar_url } });
  } catch (e) {
    res.status(401).json({ error: 'Invalid Google token' });
  }
});

// Setup 2FA
router.post('/2fa/setup', require('../middleware/auth'), async (req, res) => {
  const OTPAuth = require('otpauth');
  const QRCode = require('qrcode');
  const secret = new OTPAuth.Secret();
  const totp = new OTPAuth.TOTP({ issuer: 'AuthForge', label: req.developer.email, secret });
  const qr = await QRCode.toDataURL(totp.toString());
  await supabase.from('developers').update({ two_factor_secret: secret.base32 }).eq('id', req.developer.id);
  res.json({ secret: secret.base32, qr_code: qr });
});

// Confirm & enable 2FA
router.post('/2fa/enable', require('../middleware/auth'), async (req, res) => {
  const { totp_code } = req.body;
  const { data: dev } = await supabase.from('developers').select('two_factor_secret').eq('id', req.developer.id).single();
  if (!dev?.two_factor_secret) return res.status(400).json({ error: 'Setup 2FA first' });
  const OTPAuth = require('otpauth');
  const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(dev.two_factor_secret) });
  if (t.validate({ token: totp_code, window: 1 }) === null) return res.status(401).json({ error: 'Invalid code' });
  await supabase.from('developers').update({ two_factor_enabled: true }).eq('id', req.developer.id);
  res.json({ message: '2FA enabled successfully' });
});

// Disable 2FA
router.post('/2fa/disable', require('../middleware/auth'), async (req, res) => {
  await supabase.from('developers').update({ two_factor_enabled: false, two_factor_secret: null }).eq('id', req.developer.id);
  res.json({ message: '2FA disabled' });
});

// Get current developer profile
router.get('/me', require('../middleware/auth'), async (req, res) => {
  const { data, error } = await supabase.from('developers')
    .select('id, email, username, plan, plan_expires_at, two_factor_enabled, avatar_url, created_at, is_admin')
    .eq('id', req.developer.id).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ developer: data });
});

module.exports = router;

// Google OAuth — authorization code flow
router.post('/google-code', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri,
        grant_type: 'authorization_code'
      })
    });
    const tokens = await tokenRes.json();
    if (!tokens.id_token) return res.status(400).json({ error: 'Failed to get tokens from Google' });

    // Verify the id_token
    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: google_id } = payload;

    let { data: dev } = await supabase.from('developers').select('*').eq('google_id', google_id).single();
    if (!dev) {
      let { data: existing } = await supabase.from('developers').select('*').eq('email', email).single();
      if (existing) {
        await supabase.from('developers').update({ google_id, avatar_url: picture }).eq('id', existing.id);
        dev = { ...existing, google_id, avatar_url: picture };
      } else {
        const username = (name || email.split('@')[0]).replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 999);
        const { data: newDev, error } = await supabase.from('developers')
          .insert([{ email, username, password_hash: '', google_id, avatar_url: picture }])
          .select('*').single();
        if (error) return res.status(400).json({ error: error.message });
        dev = newDev;
      }
    }
    res.json({ message: 'Google login successful', token: makeToken(dev), developer: { id: dev.id, email: dev.email, username: dev.username, plan: dev.plan, avatar_url: dev.avatar_url } });
  } catch (e) {
    console.error('Google OAuth error:', e.message);
    res.status(401).json({ error: 'Google authentication failed: ' + e.message });
  }
});
