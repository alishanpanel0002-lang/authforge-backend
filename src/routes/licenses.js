const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/licenses/:app_id - Get all licenses for an app
router.get('/:app_id', async (req, res) => {
  const { data, error } = await supabase
    .from('licenses')
    .select('*, app_users(username)')
    .eq('app_id', req.params.app_id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ licenses: data });
});

// POST /api/licenses/:app_id - Generate a new license
router.post('/:app_id', async (req, res) => {
  const { expires_at } = req.body;

  const { data, error } = await supabase
    .from('licenses')
    .insert([{ app_id: req.params.app_id, expires_at: expires_at || null }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License created', license: data });
});

// PATCH /api/licenses/:id/toggle - Enable or disable a license
router.patch('/:id/toggle', async (req, res) => {
  const { is_active } = req.body;

  const { data, error } = await supabase
    .from('licenses')
    .update({ is_active })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License updated', license: data });
});

// DELETE /api/licenses/:id - Delete a license
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('licenses')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'License deleted' });
});

module.exports = router;
