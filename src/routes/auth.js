const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { OAuth2Client } = require('google-auth-library');
const fetch = require('node-fetch');
const supabase = require('../supabase');
const { sendVerificationEmail } = require('../email');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function makeToken(dev) {
  return jwt.sign({ id: dev.id, email: dev.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Register with email verification
router.post('/register', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password) return res.status(400).json({ error: 'All fields required' });
  const password_hash = await bcrypt.hash(password, 10);
  const verify_token = uuidv4();
  const verify_expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('developers')
    .insert([{ email, username, password_hash, email_verified: false, email_verify_token: verify_token, email_verify_expires: verify_expires }])
    .select('id, email, username, plan, created_at').single();
  if (error) return res.status(400).json({ error: error.message });
  await sendVerificationEmail(email, username, verify_token);
  res.json({ message: 'Registered! Please check your email to verify your account.', developer: data, token: makeToken(data), requires_verification: true });
});

// Verify email
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token required' });
  const { data: dev } = await supabase.from('developers').select('*').eq('email_verify_token', token).single();
  if (!dev) return res.status(400).json({ error: 'Invalid or expired token' });
  if (new Date(dev.email_verify_expires) < new Date()) return res.status(400).json({ error: 'Verification link expired. Please request a new one.' });
  await supabase.from('developers').update({ email_verified: true, email_verify_token: null, email_verify_expires: null }).eq('id', dev.id);
  res.json({ message: 'Email verified successfully! You can now log in.' });
});

// Resend verification
router.post('/resend-verification', async (req, res) => {
  const { email } = req.body;
  const { data: dev } = await supabase.from('developers').select('*').eq('email', email).single();
  if (!dev) return res.status(404).json({ error: 'Account not found' });
  if (dev.email_verified) return res.status(400).json({ error: 'Email already verified' });
  const verify_token = uuidv4();
  const verify_expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('developers').update({ email_verify_token: verify_token, email_verify_expires: verify_expires }).eq('id', dev.id);
  await sendVerificationEmail(email, dev.username, verify_token);
  res.json({ message: 'Verification email sent!' });
});

// Login
router.post('/login', async (req, res) => {
  const { email, password, totp_code } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const { data, error } = await supabase.from('developers').select('*').eq('email', email).single();
  if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, data.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  if (!data.email_verified && !data.google_id && !data.discord_id)
    return res.status(403).json({ error: 'Please verify your email before logging in.', requires_verification: true, email });
  if (data.two_factor_enabled) {
    if (!totp_code) return res.status(200).json({ requires_2fa: true });
    const OTPAuth = require('otpauth');
    const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(data.two_factor_secret) });
    if (t.validate({ token: totp_code, window: 1 }) === null) return res.status(401).json({ error: 'Invalid 2FA code' });
  }
  res.json({ message: 'Login successful', token: makeToken(data), developer: { id: data.id, email: data.email, username: data.username, plan: data.plan, avatar_url: data.avatar_url, email_verified: data.email_verified } });
});

// Google OAuth - code flow
router.post('/google-code', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, redirect_uri, grant_type: 'authorization_code' })
    });
    const tokens = await tokenRes.json();
    if (!tokens.id_token) return res.status(400).json({ error: 'Failed to get tokens from Google' });
    const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { email, name, picture, sub: google_id } = payload;
    let { data: dev } = await supabase.from('developers').select('*').eq('google_id', google_id).single();
    if (!dev) {
      let { data: existing } = await supabase.from('developers').select('*').eq('email', email).single();
      if (existing) {
        await supabase.from('developers').update({ google_id, avatar_url: picture, email_verified: true }).eq('id', existing.id);
        dev = { ...existing, google_id, avatar_url: picture, email_verified: true };
      } else {
        const username = (name || email.split('@')[0]).replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 999);
        const { data: newDev, error } = await supabase.from('developers')
          .insert([{ email, username, password_hash: '', google_id, avatar_url: picture, email_verified: true }])
          .select('*').single();
        if (error) return res.status(400).json({ error: error.message });
        dev = newDev;
      }
    }
    res.json({ message: 'Google login successful', token: makeToken(dev), developer: { id: dev.id, email: dev.email, username: dev.username, plan: dev.plan, avatar_url: dev.avatar_url } });
  } catch(e) {
    res.status(401).json({ error: 'Google authentication failed: ' + e.message });
  }
});

// Discord OAuth
router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.APP_URL + '/index.html',
    response_type: 'code',
    scope: 'identify email',
    state: 'discord_oauth'
  });
  res.redirect('https://discord.com/api/oauth2/authorize?' + params.toString());
});

router.post('/discord-code', async (req, res) => {
  const { code, redirect_uri } = req.body;
  if (!code) return res.status(400).json({ error: 'Code required' });
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.DISCORD_CLIENT_ID, client_secret: process.env.DISCORD_CLIENT_SECRET, grant_type: 'authorization_code', code, redirect_uri })
    });
    const tokens = await tokenRes.json();
    if (!tokens.access_token) return res.status(400).json({ error: 'Failed to get Discord token' });
    const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: 'Bearer ' + tokens.access_token } });
    const discordUser = await userRes.json();
    const { id: discord_id, username: discord_username, email, avatar } = discordUser;
    const avatar_url = avatar ? 'https://cdn.discordapp.com/avatars/' + discord_id + '/' + avatar + '.png' : null;
    let { data: dev } = await supabase.from('developers').select('*').eq('discord_id', discord_id).single();
    if (!dev) {
      let { data: existing } = await supabase.from('developers').select('*').eq('email', email).single();
      if (existing) {
        await supabase.from('developers').update({ discord_id, discord_username, avatar_url: avatar_url || existing.avatar_url, email_verified: true }).eq('id', existing.id);
        dev = { ...existing, discord_id, discord_username };
      } else {
        const username = discord_username.replace(/\s+/g, '').toLowerCase() + Math.floor(Math.random() * 999);
        const { data: newDev, error } = await supabase.from('developers')
          .insert([{ email, username, password_hash: '', discord_id, discord_username, avatar_url, email_verified: true }])
          .select('*').single();
        if (error) return res.status(400).json({ error: error.message });
        dev = newDev;
      }
    }
    res.json({ message: 'Discord login successful', token: makeToken(dev), developer: { id: dev.id, email: dev.email, username: dev.username, plan: dev.plan, avatar_url: dev.avatar_url } });
  } catch(e) {
    res.status(401).json({ error: 'Discord authentication failed: ' + e.message });
  }
});

// 2FA setup
router.post('/2fa/setup', require('../middleware/auth'), async (req, res) => {
  const OTPAuth = require('otpauth');
  const QRCode = require('qrcode');
  const secret = new OTPAuth.Secret();
  const totp = new OTPAuth.TOTP({ issuer: 'AuthForge', label: req.developer.email, secret });
  const qr = await QRCode.toDataURL(totp.toString());
  await supabase.from('developers').update({ two_factor_secret: secret.base32 }).eq('id', req.developer.id);
  res.json({ secret: secret.base32, qr_code: qr });
});

router.post('/2fa/enable', require('../middleware/auth'), async (req, res) => {
  const { totp_code } = req.body;
  const { data: dev } = await supabase.from('developers').select('two_factor_secret').eq('id', req.developer.id).single();
  if (!dev?.two_factor_secret) return res.status(400).json({ error: 'Setup 2FA first' });
  const OTPAuth = require('otpauth');
  const t = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(dev.two_factor_secret) });
  if (t.validate({ token: totp_code, window: 1 }) === null) return res.status(401).json({ error: 'Invalid code' });
  await supabase.from('developers').update({ two_factor_enabled: true }).eq('id', req.developer.id);
  res.json({ message: '2FA enabled' });
});

router.post('/2fa/disable', require('../middleware/auth'), async (req, res) => {
  await supabase.from('developers').update({ two_factor_enabled: false, two_factor_secret: null }).eq('id', req.developer.id);
  res.json({ message: '2FA disabled' });
});

router.get('/me', require('../middleware/auth'), async (req, res) => {
  const { data, error } = await supabase.from('developers')
    .select('id, email, username, plan, plan_expires_at, two_factor_enabled, avatar_url, created_at, is_admin, email_verified, discord_username')
    .eq('id', req.developer.id).single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ developer: data });
});

module.exports = router;
