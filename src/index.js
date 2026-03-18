require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();

// Lock CORS to the dashboard origin only
const allowedOrigins = [
  'https://authforge-dashboard.vercel.app',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (e.g. Postman, Railway healthcheck, curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('CORS: origin not allowed'));
  },
  credentials: true
}));

app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }));
app.use(express.json());

const loginLimiter   = rateLimit({ windowMs: 60000,    max: 5,  message: { success: false, message: 'Too many login attempts. Try again in 1 minute.' } });
const registerLimiter = rateLimit({ windowMs: 3600000, max: 10, message: { success: false, message: 'Too many registrations from this IP.' } });
const generalLimiter  = rateLimit({ windowMs: 60000,   max: 60, message: { success: false, message: 'Too many requests.' } });
const strictLimiter   = rateLimit({ windowMs: 60000,   max: 20, message: { success: false, message: 'Rate limit exceeded.' } });

app.use('/api/client/login',         loginLimiter);
app.use('/api/client/license/login', loginLimiter);
app.use('/api/client/register',      registerLimiter);
app.use('/api/client',               generalLimiter);
app.use('/api/auth',                 strictLimiter);

app.use('/api/auth',      require('./routes/auth'));
app.use('/api/apps',      require('./routes/apps'));
app.use('/api/licenses',  require('./routes/licenses'));
app.use('/api/tiers',     require('./routes/tiers'));
app.use('/api/users',     require('./routes/users'));
app.use('/api/client',    require('./routes/client'));
app.use('/api/admin',     require('./routes/admin'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/security',  require('./routes/security'));
app.use('/api/stripe',    require('./routes/stripe'));
app.use('/api/portal',    require('./routes/portal'));
app.use('/api/team',      require('./routes/team'));
app.use('/api/bots',      require('./routes/bots'));
app.use('/api/public',    require('./routes/public'));

app.get('/', (req, res) => res.json({ message: 'AuthForge API v5', version: '5.0.0' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AuthForge v5 running on port ${PORT}`));
