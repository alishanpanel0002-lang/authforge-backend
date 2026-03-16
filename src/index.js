require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/apps', require('./routes/apps'));
app.use('/api/licenses', require('./routes/licenses'));
app.use('/api/client', require('./routes/client'));

app.get('/', (req, res) => {
  res.json({ message: 'AuthForge API is running', version: '1.0.0' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`AuthForge backend running on port ${PORT}`);
});
