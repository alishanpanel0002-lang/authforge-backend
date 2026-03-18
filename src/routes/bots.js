const router = require('express').Router();
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const { getEffectivePlan } = require('../middleware/planLimits');

router.use(auth);

// Helper: Ensure the user is a business plan
async function ensureBusiness(req, res, next) {
    const { data: dev } = await supabase.from('developers').select('*').eq('id', req.developer.id).single();
    if (getEffectivePlan(dev) !== 'business' && !dev.is_admin) {
        return res.status(403).json({ error: 'Bots and integrations are only available on the Business plan.' });
    }
    next();
}

router.get('/', ensureBusiness, async (req, res) => {
    const { data, error } = await supabase.from('bots').select('*').eq('developer_id', req.developer.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ bots: data });
});

router.post('/', ensureBusiness, async (req, res) => {
    const { platform, bot_token, custom_api_key } = req.body;
    if (!platform || !['discord', 'telegram', 'whatsapp', 'custom'].includes(platform)) {
        return res.status(400).json({ error: 'Invalid platform selected.' });
    }
    const { data, error } = await supabase.from('bots').insert([{
        developer_id: req.developer.id,
        platform, bot_token, custom_api_key, is_active: true
    }]).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Bot integration created successfully.', bot: data });
});

router.patch('/:id/toggle', ensureBusiness, async (req, res) => {
    const { is_active } = req.body;
    const { data, error } = await supabase.from('bots').update({ is_active }).eq('id', req.params.id).eq('developer_id', req.developer.id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Bot updated', bot: data });
});

router.delete('/:id', ensureBusiness, async (req, res) => {
    const { error } = await supabase.from('bots').delete().eq('id', req.params.id).eq('developer_id', req.developer.id);
    if (error) return res.status(400).json({ error: error.message });
    res.json({ message: 'Bot deleted' });
});

module.exports = router;
