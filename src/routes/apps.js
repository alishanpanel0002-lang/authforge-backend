const express = require('express');
const router = express.Router();
const supabase = require('../supabase');
const authMiddleware = require('../middleware/auth');

// All routes require developer to be logged in
router.use(authMiddleware);

// GET /api/apps - Get all apps for logged in developer
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('apps')
    .select('*')
    .eq('developer_id', req.developer.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ apps: data });
});

// POST /api/apps - Create a new app
router.post('/', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'App name required' });

  const { data, error } = await supabase
    .from('apps')
    .insert([{ name, developer_id: req.developer.id }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'App created', app: data });
});

// DELETE /api/apps/:id - Delete an app
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('apps')
    .delete()
    .eq('id', req.params.id)
    .eq('developer_id', req.developer.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'App deleted' });
});

// GET /api/apps/:id/users - Get all users in an app
router.get('/:id/users', async (req, res) => {
  const { data, error } = await supabase
    .from('app_users')
    .select('id, username, email, is_banned, created_at')
    .eq('app_id', req.params.id);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ users: data });
});

module.exports = router;
