const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const supabase = require('../supabase');

router.post('/register', async (req, res) => {
  const { email, username, password } = req.body;
  if (!email || !username || !password)
    return res.status(400).json({ error: 'All fields required' });

  const password_hash = await bcrypt.hash(password, 10);
  const { data, error } = await supabase
    .from('developers')
    .insert([{ email, username, password_hash }])
    .select('id, email, username, created_at')
    .single();

  if (error) return res.status(400).json({ error: error.message });
  const token = jwt.sign({ id: data.id, email: data.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ message: 'Registered successfully', developer: data, token });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const { data, error } = await supabase
    .from('developers').select('*').eq('email', email).single();

  if (error || !data) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, data.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: data.id, email: data.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
  res.json({ message: 'Login successful', token, developer: { id: data.id, email: data.email, username: data.username } });
});

module.exports = router;
