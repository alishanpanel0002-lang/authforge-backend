const router = require('express').Router()
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const supabase = require('../supabase')

// Register developer
router.post('/register', async (req, res) => {
  const { email, username, password } = req.body
  if (!email || !username || !password)
    return res.status(400).json({ error: 'Email, username and password required' })

  const password_hash = await bcrypt.hash(password, 10)
  const { data, error } = await supabase
    .from('developers')
    .insert([{ email, username, password_hash }])
    .select('id, email, username, created_at')
    .single()

  if (error) return res.status(400).json({ error: error.message })
  const token = jwt.sign({ id: data.id, email: data.email }, process.env.JWT_SECRET, { expiresIn: '7d' })
  res.json({ success: true, developer: data, token })
})

// Login developer
router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' })

  const { data, error } = await supabase
    .from('developers')
    .select('*')
    .eq('email', email)
    .single()

  if (error || !data) return res.status(401).json({ error: 'Invalid credentials' })
  const valid = await bcrypt.compare(password, data.password_hash)
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' })

  const token = jwt.sign({ id: data.id, email: data.email }, process.env.JWT_SECRET, { expiresIn: '7d' })
  res.json({ success: true, developer: { id: data.id, email: data.email, username: data.username }, token })
})

module.exports = router
