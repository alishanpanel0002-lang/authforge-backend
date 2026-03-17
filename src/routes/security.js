const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
router.use(auth);

// Get active sessions
router.get('/sessions', async (req, res) => {
  const { data, error } = await supabase.from('developer_sessions')
    .select('id, ip_address, user_agent, created_at, last_seen')
    .eq('developer_id', req.developer.id).eq('is_active', true).order('last_seen', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ sessions: data });
});

// Revoke a session
router.delete('/sessions/:id', async (req, res) => {
  await supabase.from('developer_sessions').update({ is_active: false }).eq('id', req.params.id).eq('developer_id', req.developer.id);
  res.json({ message: 'Session revoked' });
});

// Revoke all sessions
router.delete('/sessions', async (req, res) => {
  await supabase.from('developer_sessions').update({ is_active: false }).eq('developer_id', req.developer.id);
  res.json({ message: 'All sessions revoked' });
});

// Suspicious activity — multiple failed logins from same IP per app
router.get('/suspicious/:app_id', async (req, res) => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase.from('login_logs')
    .select('ip_address, username, fail_reason, created_at')
    .eq('app_id', req.params.app_id).eq('success', false).gte('created_at', since);

  const ipCounts = {};
  (data || []).forEach(l => { ipCounts[l.ip_address] = (ipCounts[l.ip_address] || 0) + 1; });
  const suspicious = Object.entries(ipCounts).filter(([,c]) => c >= 5).map(([ip, count]) => ({ ip, count, flagged: count >= 10 }));

  res.json({ suspicious, total_failed: (data || []).length });
});

module.exports = router;
