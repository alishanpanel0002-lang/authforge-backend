const fetch = require('node-fetch');
const supabase = require('./supabase');

const COLORS = {
  login: 0x3b82f6, register: 0x10b981, banned: 0xef4444,
  license_full: 0xf59e0b, login_failed: 0xf97316, hwid_blocked: 0x8b5cf6,
  license_expired: 0xef4444, ip_blocked: 0xef4444
};

const TITLES = {
  login: '✅ User Logged In', register: '🎉 New User Registered',
  banned: '🚫 User Banned', license_full: '🔑 License Key Full',
  login_failed: '⚠️ Login Failed', hwid_blocked: '🖥️ HWID Mismatch Blocked',
  license_expired: '⏰ License Expired', ip_blocked: '🛡️ IP Address Blocked'
};

async function sendWebhook(app, event, fields) {
  if (!app.discord_webhook) return;
  try {
    const res = await fetch(app.discord_webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title: TITLES[event] || event,
          color: COLORS[event] || 0x888888,
          fields: fields.map(f => ({ name: f.name, value: String(f.value || '—'), inline: true })),
          footer: { text: 'AuthForge · ' + app.name },
          timestamp: new Date().toISOString()
        }]
      })
    });
    // Log webhook
    await supabase.from('webhook_logs').insert([{
      app_id: app.id, event,
      payload: { fields },
      success: res.ok
    }]);
  } catch (e) {
    console.error('Discord webhook error:', e.message);
    await supabase.from('webhook_logs').insert([{ app_id: app.id, event, payload: { fields }, success: false }]);
  }
}

module.exports = { sendWebhook };
