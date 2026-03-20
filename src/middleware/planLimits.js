const supabase = require('../supabase');

const LIMITS = {
  starter:  { apps: 1,  users: 50,    licenses: 20  },
  pro:      { apps: 10, users: 10000, licenses: -1  },
  business: { apps: -1, users: -1,    licenses: -1  }
};

// Return effective plan, falling back to starter if subscription has lapsed
function getEffectivePlan(dev) {
  if (dev.plan && dev.plan !== 'starter' && dev.plan_expires_at) {
    if (new Date(dev.plan_expires_at) < new Date()) return 'starter';
  }
  return dev.plan || 'starter';
}

function getLimit(plan, resource) {
  const limits = LIMITS[plan] || LIMITS.starter;
  return limits[resource]; // -1 = unlimited
}

// Check if developer can create a new app
async function checkAppLimit(req, res, next) {
  const { data: dev } = await supabase.from('developers').select('plan, plan_expires_at, is_admin').eq('id', req.developer.id).single();
  if (dev.is_admin) return next();
  const plan = getEffectivePlan(dev);
  const limit = getLimit(plan, 'apps');
  if (limit === -1) return next();
  const { count } = await supabase.from('apps').select('id', { count: 'exact' }).eq('developer_id', req.developer.id);
  if (count >= limit) return res.status(403).json({ error: 'App limit reached for your plan (' + limit + ' apps). Upgrade to create more.' });
  next();
}

// Check if developer can create a new license
async function checkLicenseLimit(req, res, next) {
  const { data: dev } = await supabase.from('developers').select('plan, plan_expires_at, is_admin').eq('id', req.developer.id).single();
  if (dev.is_admin) return next();
  const plan = getEffectivePlan(dev);
  const limit = getLimit(plan, 'licenses');
  if (limit === -1) return next();
  const { count } = await supabase.from('licenses').select('id', { count: 'exact' }).eq('app_id', req.params.app_id);
  if (count >= limit) return res.status(403).json({ error: 'License limit reached for your plan (' + limit + ' licenses). Upgrade to create more.' });
  next();
}

// Check if developer can create a new user
async function checkUserLimit(req, res, next) {
  const { data: dev } = await supabase.from('developers').select('plan, plan_expires_at, is_admin').eq('id', req.developer.id).single();
  if (dev.is_admin) return next();
  const plan = getEffectivePlan(dev);
  const limit = getLimit(plan, 'users');
  if (limit === -1) return next();

  // Count all users across all apps of this developer
  const { data: apps } = await supabase.from('apps').select('id').eq('developer_id', req.developer.id);
  const appIds = (apps || []).map(a => a.id);
  if (!appIds.length) return next();
  const { count } = await supabase.from('app_users').select('id', { count: 'exact' }).in('app_id', appIds);
  if (count >= limit) return res.status(403).json({ error: 'User limit reached for your plan (' + limit + ' users). Upgrade to create more.' });
  next();
}

module.exports = { checkAppLimit, checkLicenseLimit, checkUserLimit, getEffectivePlan };
