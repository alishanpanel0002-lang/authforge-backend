const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const { getEffectivePlan } = require('../middleware/planLimits');

router.use(auth);

// Helper: Ensure user is on Spectre (Pro) or Business plan for webhooks
async function ensureProOrBusiness(req, res, next) {
    const { data: dev } = await supabase.from('developers').select('*').eq('id', req.developer.id).single();
    const plan = getEffectivePlan(dev);
    if (plan === 'starter' && !dev.is_admin) {
        return res.status(403).json({ error: 'Security Webhooks are only available on Spectre (Pro) and Business plans.' });
    }
    next();
}

router.get('/', ensureProOrBusiness, async (req, res) => {
    const { data, error } = await supabase.from('webhooks').select('*').eq('developer_id', req.developer.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ webhooks: data });
});

router.post('/', ensureProOrBusiness, async (req, res) => {
    const { app_id, url, events } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required.' });
    
    const { data, error } = await supabase.from('webhooks').insert([{
        developer_id: req.developer.id,
        app_id,
        url,
        events: events || ["login", "failed_login", "hwid_reset"]
    }]).select().single();
    
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Webhook created successfully.', webhook: data });
});

router.patch('/:id', ensureProOrBusiness, async (req, res) => {
    const { url, events, is_active } = req.body;
    const { data, error } = await supabase.from('webhooks')
        .update({ url, events, is_active })
        .eq('id', req.params.id)
        .eq('developer_id', req.developer.id)
        .select().single();
        
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Webhook updated successfully.', webhook: data });
});

router.delete('/:id', ensureProOrBusiness, async (req, res) => {
    const { error } = await supabase.from('webhooks').delete().eq('id', req.params.id).eq('developer_id', req.developer.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Webhook deleted.' });
});

module.exports = router;
