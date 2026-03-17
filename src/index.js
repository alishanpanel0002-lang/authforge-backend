require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(cors());
app.use(express.json());

// Rate limiters
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, max: 5,
  message: { success: false, message: 'Too many login attempts. Try again in 1 minute.' }
});
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { success: false, message: 'Too many registrations from this IP.' }
});
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, max: 60,
  message: { success: false, message: 'Too many requests. Slow down.' }
});
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, max: 30,
  message: { success: false, message: 'Rate limit exceeded.' }
});

// Apply rate limits
app.use('/api/client/login', loginLimiter);
app.use('/api/client/license/login', loginLimiter);
app.use('/api/client/register', registerLimiter);
app.use('/api/client', generalLimiter);
app.use('/api/auth/login', strictLimiter);
app.use('/api/auth/register', strictLimiter);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/apps', require('./routes/apps'));
app.use('/api/licenses', require('./routes/licenses'));
app.use('/api/users', require('./routes/users'));
app.use('/api/client', require('./routes/client'));
app.use('/api/admin', require('./routes/admin'));

app.get('/', (req, res) => res.json({ message: 'AuthForge API v3', version: '3.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AuthForge v3 running on port ${PORT}`));
