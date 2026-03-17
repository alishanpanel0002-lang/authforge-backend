const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');

const PLANS = {
  pro: { price_id: 'price_PRO_ID', name: 'Pro', limit_apps: 10, limit_users: 10000 },
  business: { price_id: 'price_BUSINESS_ID', name: 'Business', limit_apps: -1, limit_users: -1 }
};

let stripe;
try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); } catch(e) {}

// Create checkout session
router.post('/checkout', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const { plan } = req.body;
  if (!PLANS[plan]) return res.status(400).json({ error: 'Invalid plan' });
  const { data: dev } = await supabase.from('developers').select('*').eq('id', req.developer.id).single();
  let customer_id = dev.stripe_customer_id;
  if (!customer_id) {
    const customer = await stripe.customers.create({ email: dev.email, metadata: { developer_id: dev.id } });
    customer_id = customer.id;
    await supabase.from('developers').update({ stripe_customer_id: customer_id }).eq('id', dev.id);
  }
  const session = await stripe.checkout.sessions.create({
    customer: customer_id,
    payment_method_types: ['card'],
    line_items: [{ price: PLANS[plan].price_id, quantity: 1 }],
    mode: 'subscription',
    success_url: 'https://authforge-dashboard.vercel.app/dashboard/dashboard.html?upgraded=1',
    cancel_url: 'https://authforge-dashboard.vercel.app/dashboard/dashboard.html',
    metadata: { developer_id: dev.id, plan }
  });
  res.json({ url: session.url });
});

// Stripe webhook
router.post('/webhook', async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) { return res.status(400).json({ error: 'Webhook error' }); }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const { developer_id, plan } = session.metadata;
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from('developers').update({ plan, plan_expires_at: expires }).eq('id', developer_id);
  }
  if (event.type === 'customer.subscription.deleted') {
    const sub = event.data.object;
    const { data: dev } = await supabase.from('developers').select('id').eq('stripe_customer_id', sub.customer).single();
    if (dev) await supabase.from('developers').update({ plan: 'starter', plan_expires_at: null }).eq('id', dev.id);
  }
  res.json({ received: true });
});

// Get billing info
router.get('/billing', auth, async (req, res) => {
  const { data } = await supabase.from('developers').select('plan, plan_expires_at, stripe_customer_id').eq('id', req.developer.id).single();
  res.json({ billing: data });
});

// Create portal session (manage subscription)
router.post('/portal', auth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'Stripe not configured' });
  const { data } = await supabase.from('developers').select('stripe_customer_id').eq('id', req.developer.id).single();
  if (!data?.stripe_customer_id) return res.status(400).json({ error: 'No subscription found' });
  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: 'https://authforge-dashboard.vercel.app/dashboard/dashboard.html'
  });
  res.json({ url: session.url });
});

module.exports = router;
