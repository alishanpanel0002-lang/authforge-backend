const jwt = require('jsonwebtoken');
const supabase = require('../supabase');
module.exports = async (req, res, next) => {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data } = await supabase.from('developers').select('is_admin').eq('id', decoded.id).single();
    if (!data || !data.is_admin) return res.status(403).json({ error: 'Admin access required' });
    req.developer = decoded;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
};
