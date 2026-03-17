const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
router.use(auth);

// Login stats for an app (last 30 days)
router.get('/:app_id/logins', async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase.from('login_logs')
    .select('*').eq('app_id', req.params.app_id).gte('created_at', since).order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });

  // Group by day
  const byDay = {};
  data.forEach(log => {
    const day = log.created_at.substring(0, 10);
    if (!byDay[day]) byDay[day] = { date: day, total: 0, success: 0, failed: 0 };
    byDay[day].total++;
    if (log.success) byDay[day].success++; else byDay[day].failed++;
  });

  // Top IPs
  const ipCounts = {};
  data.forEach(l => { if (l.ip_address) ipCounts[l.ip_address] = (ipCounts[l.ip_address] || 0) + 1; });
  const topIps = Object.entries(ipCounts).sort((a,b) => b[1]-a[1]).slice(0,10).map(([ip, count]) => ({ ip, count }));

  // Fail reasons
  const failReasons = {};
  data.filter(l => !l.success).forEach(l => {
    const r = l.fail_reason || 'Unknown';
    failReasons[r] = (failReasons[r] || 0) + 1;
  });

  res.json({
    total: data.length,
    success: data.filter(l => l.success).length,
    failed: data.filter(l => !l.success).length,
    by_day: Object.values(byDay).sort((a,b) => a.date.localeCompare(b.date)),
    top_ips: topIps,
    fail_reasons: failReasons,
    recent: data.slice(0, 50)
  });
});

// Webhook logs for an app
router.get('/:app_id/webhooks', async (req, res) => {
  const { data, error } = await supabase.from('webhook_logs')
    .select('*').eq('app_id', req.params.app_id).order('created_at', { ascending: false }).limit(100);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ logs: data });
});

// Overview stats for all apps
router.get('/overview/:developer_id', async (req, res) => {
  const appsResult = await supabase.from('apps').select('id').eq('developer_id', req.developer.id);
  const appIds = (appsResult.data || []).map(a => a.id);
  if (!appIds.length) return res.json({ total_logins: 0, total_users: 0, total_licenses: 0 });

  const [logins, users, licenses] = await Promise.all([
    supabase.from('login_logs').select('id', { count: 'exact' }).in('app_id', appIds),
    supabase.from('app_users').select('id', { count: 'exact' }).in('app_id', appIds),
    supabase.from('licenses').select('id', { count: 'exact' }).in('app_id', appIds)
  ]);

  res.json({ total_logins: logins.count || 0, total_users: users.count || 0, total_licenses: licenses.count || 0 });
});

module.exports = router;
