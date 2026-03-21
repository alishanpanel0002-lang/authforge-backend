const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const supabase = require('../supabase');
const auth = require('../middleware/auth');
const { sendTeamInviteEmail } = require('../email');

router.use(auth);

// Check business plan
async function requireBusiness(req, res, next) {
  const { data: dev } = await supabase.from('developers').select('plan').eq('id', req.developer.id).single();
  if (!dev || dev.plan !== 'business') return res.status(403).json({ error: 'Team management requires the Business plan.' });
  next();
}

// Get my team members
router.get('/', requireBusiness, async (req, res) => {
  const { data, error } = await supabase.from('team_members')
    .select('*, developers!member_id(username, email, avatar_url, plan)')
    .eq('owner_id', req.developer.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ members: data });
});

// Get teams I'm a member of
router.get('/mine', async (req, res) => {
  const { data, error } = await supabase.from('team_members')
    .select('*, developers!owner_id(username, email, avatar_url)')
    .eq('member_id', req.developer.id).eq('accepted', true);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ teams: data });
});

// Invite a member
router.post('/invite', requireBusiness, async (req, res) => {
  const { email, permissions, role_name } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const { data: owner } = await supabase.from('developers').select('username').eq('id', req.developer.id).single();
  const token = uuidv4();
  const expires_at = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  
  // Also store role_name in permissions JSON for temporary transit
  const perms = permissions || {};
  if (role_name) perms.role_name = role_name;

  const { data, error } = await supabase.from('team_invites')
    .insert([{ owner_id: req.developer.id, email, token, permissions: perms, expires_at }])
    .select().single();
  if (error) return res.status(400).json({ error: error.message });
  await sendTeamInviteEmail(email, owner.username, token, perms);
  res.json({ message: 'Invite sent!', invite: data });
});

// Accept invite
router.post('/accept/:token', async (req, res) => {
  const { data: invite } = await supabase.from('team_invites').select('*').eq('token', req.params.token).single();
  if (!invite) return res.status(404).json({ error: 'Invalid invite' });
  if (invite.used) return res.status(400).json({ error: 'Invite already used' });
  if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: 'Invite expired' });
  const { data: member } = await supabase.from('developers').select('id').eq('email', invite.email).single();
  if (!member) return res.status(404).json({ error: 'No account found with this email. Please register first.' });
  const perms = invite.permissions || {};
  const { error } = await supabase.from('team_members').upsert([{
    owner_id: invite.owner_id,
    member_id: member.id,
    can_view: perms.can_view !== false,
    can_manage_users: perms.can_manage_users || false,
    can_manage_licenses: perms.can_manage_licenses || false,
    can_manage_settings: perms.can_manage_settings || false,
    can_manage_apps: perms.can_manage_apps || false,
    role_name: perms.role_name || 'Member',
    permissions: perms,
    accepted: true
  }]);
  if (error) return res.status(400).json({ error: error.message });
  await supabase.from('team_invites').update({ used: true }).eq('id', invite.id);
  res.json({ message: 'You have joined the team!' });
});

// Update member permissions
router.patch('/:member_id', requireBusiness, async (req, res) => {
  const { can_view, can_manage_users, can_manage_licenses, can_manage_settings, can_manage_apps, role_name, permissions } = req.body;
  const updates = {};
  if (can_view !== undefined) updates.can_view = can_view;
  if (can_manage_users !== undefined) updates.can_manage_users = can_manage_users;
  if (can_manage_licenses !== undefined) updates.can_manage_licenses = can_manage_licenses;
  if (can_manage_settings !== undefined) updates.can_manage_settings = can_manage_settings;
  if (can_manage_apps !== undefined) updates.can_manage_apps = can_manage_apps;
  if (role_name !== undefined) updates.role_name = role_name;
  if (permissions !== undefined) updates.permissions = permissions;
  
  const { data, error } = await supabase.from('team_members').update(updates)
    .eq('owner_id', req.developer.id).eq('member_id', req.params.member_id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Permissions updated', member: data });
});

// Remove member
router.delete('/:member_id', requireBusiness, async (req, res) => {
  await supabase.from('team_members').delete().eq('owner_id', req.developer.id).eq('member_id', req.params.member_id);
  res.json({ message: 'Member removed' });
});

// Get pending invites
router.get('/invites', requireBusiness, async (req, res) => {
  const { data, error } = await supabase.from('team_invites')
    .select('*').eq('owner_id', req.developer.id).eq('used', false).gt('expires_at', new Date().toISOString());
  if (error) return res.status(400).json({ error: error.message });
  res.json({ invites: data });
});

// Cancel invite
router.delete('/invites/:id', requireBusiness, async (req, res) => {
  await supabase.from('team_invites').delete().eq('id', req.params.id).eq('owner_id', req.developer.id);
  res.json({ message: 'Invite cancelled' });
});

// === TEAM CHAT & ANNOUNCEMENTS ===

router.get('/chat', async (req, res) => {
  // If the user is viewing their own team chat: owner_id = req.developer.id
  // If they are viewing a team they joined: they must supply ?team_id=owner_id
  const team_id = req.query.team_id || req.developer.id;
  
  // Verify access (either owner or accepted member)
  if (team_id !== req.developer.id) {
    const { data: mem } = await supabase.from('team_members').select('*').eq('owner_id', team_id).eq('member_id', req.developer.id).eq('accepted', true).single();
    if (!mem) return res.status(403).json({ error: 'You are not in this team.' });
  }

  const { data, error } = await supabase.from('team_messages')
    .select('*, sender:developers!sender_id(username, avatar_url, discord_username)')
    .eq('developer_id', team_id)
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ messages: data });
});

router.post('/chat', async (req, res) => {
  const team_id = req.body.team_id || req.developer.id;
  const { message } = req.body;
  
  if (team_id !== req.developer.id) {
    const { data: mem } = await supabase.from('team_members').select('*').eq('owner_id', team_id).eq('member_id', req.developer.id).eq('accepted', true).single();
    if (!mem) return res.status(403).json({ error: 'You are not in this team.' });
  }

  const { data, error } = await supabase.from('team_messages').insert([{
    developer_id: team_id,
    sender_id: req.developer.id,
    message
  }]).select('*, sender:developers!sender_id(username, avatar_url, discord_username)').single();
  
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Sent', data });
});

router.patch('/chat/:id', async (req, res) => {
  const { message } = req.body;
  const { data: msg } = await supabase.from('team_messages').select('*').eq('id', req.params.id).single();
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender_id !== req.developer.id && msg.developer_id !== req.developer.id) return res.status(403).json({ error: 'Unauthorized to edit this message' });
  
  const { error } = await supabase.from('team_messages').update({ message }).eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Message updated' });
});

router.delete('/chat/:id', async (req, res) => {
  const { data: msg } = await supabase.from('team_messages').select('*').eq('id', req.params.id).single();
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (msg.sender_id !== req.developer.id && msg.developer_id !== req.developer.id) return res.status(403).json({ error: 'Unauthorized to delete this message' });
  
  const { error } = await supabase.from('team_messages').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Message deleted' });
});

router.get('/announcements', async (req, res) => {
  const team_id = req.query.team_id || req.developer.id;
  if (team_id !== req.developer.id) {
    const { data: mem } = await supabase.from('team_members').select('*').eq('owner_id', team_id).eq('member_id', req.developer.id).eq('accepted', true).single();
    if (!mem) return res.status(403).json({ error: 'You are not in this team.' });
  }

  const { data, error } = await supabase.from('team_announcements')
    .select('*')
    .eq('developer_id', team_id)
    .order('created_at', { ascending: false });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ announcements: data });
});

router.post('/announcements', requireBusiness, async (req, res) => {
  // Only the owner can post announcements
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });

  const { data, error } = await supabase.from('team_announcements').insert([{
    developer_id: req.developer.id,
    message
  }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Announcement posted', data });
});

module.exports = router;
