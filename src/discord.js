const fetch = require('node-fetch');

const COLORS = {
  login: 0x3b82f6,
  register: 0x10b981,
  banned: 0xef4444,
  license_full: 0xf59e0b,
  login_failed: 0xf97316,
  hwid_blocked: 0x8b5cf6,
};

async function sendWebhook(webhookUrl, event, fields) {
  if (!webhookUrl) return;
  const titles = {
    login: '✅ User Logged In',
    register: '🎉 New User Registered',
    banned: '🚫 User Banned',
    license_full: '🔑 License Key Full',
    login_failed: '⚠️ Login Failed',
    hwid_blocked: '🖥️ HWID Mismatch Blocked',
  };
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: titles[event] || event,
          color: COLORS[event] || 0x888888,
          fields: fields.map(f => ({ name: f.name, value: String(f.value), inline: f.inline || true })),
          footer: { text: 'AuthForge' },
          timestamp: new Date().toISOString()
        }]
      })
    });
  } catch (e) {
    console.error('Discord webhook failed:', e.message);
  }
}

module.exports = { sendWebhook };
