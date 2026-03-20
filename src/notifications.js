const fetch = require('node-fetch');
const supabase = require('./supabase');

const COLORS = {
  login: 0xdc2626, register: 0x10b981, banned: 0x7f1d1d,
  license_full: 0xf59e0b, login_failed: 0xef4444, hwid_blocked: 0x8b5cf6,
  license_expired: 0x7f1d1d, ip_blocked: 0x7f1d1d, hwid_reset: 0x3b82f6
};

const TITLES = {
  login: '✅ Security: User Login', register: '🎉 Growth: New User',
  banned: '🚫 Enforcement: User Banned', license_full: '🔑 Alert: License Full',
  login_failed: '⚠️ Warning: Login Failed', hwid_blocked: '🖥️ Security: HWID Mismatch',
  license_expired: '⏰ Alert: License Expired', ip_blocked: '🛡️ Shield: IP Blocked',
  hwid_reset: '⚙️ Internal: HWID Reset'
};

/**
 * Dispatches notifications via built-in Discord webhooks and custom security webhooks.
 */
async function notify(app, event, fields) {
  // 1. Built-in Discord Webhook
  if (app.discord_webhook) {
    try {
      await fetch(app.discord_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [{
            title: TITLES[event] || event,
            color: COLORS[event] || 0x888888,
            fields: fields.map(f => ({ name: f.name, value: String(f.value || '—'), inline: true })),
            footer: { text: 'ShadowAuth Sentinel · ' + app.name },
            timestamp: new Date().toISOString()
          }]
        })
      });
    } catch (e) { console.error('Discord Notify Error:', e.message); }
  }

  // 2. Custom Security Webhooks (Spectre/Business Feature)
  try {
    const { data: webhooks } = await supabase.from('webhooks').select('*').eq('app_id', app.id).eq('is_active', true);
    if (webhooks && webhooks.length > 0) {
      for (const hook of webhooks) {
        if (hook.events.includes(event)) {
          await fetch(hook.url, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'X-ShadowAuth-Signature': hook.secret_key,
              'X-ShadowAuth-Event': event
            },
            body: JSON.stringify({
              event,
              timestamp: new Date().toISOString(),
              app_name: app.name,
              details: fields.reduce((acc, f) => {
                acc[f.name.toLowerCase().replace(/ /g, '_')] = f.value;
                return acc;
              }, {})
            })
          }).catch(err => console.error('Custom Webhook Dispatch Error:', err.message));
        }
      }
    }
  } catch (e) { console.error('Webhook Dispatch Engine Error:', e.message); }
}

module.exports = { notify };
