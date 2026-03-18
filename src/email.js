const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

async function sendVerificationEmail(email, username, token) {
  const url = process.env.APP_URL + '/index.html?verify=' + token;
  try {
    await resend.emails.send({
      from: 'AuthForge <noreply@authforge.dev>',
      to: email,
      subject: 'Verify your AuthForge account',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:24px">
            <div style="width:24px;height:24px;background:#3b82f6;border-radius:5px;display:inline-block"></div>
            <span style="font-size:16px;font-weight:700">AuthForge</span>
          </div>
          <h2 style="font-size:20px;margin-bottom:8px">Verify your email</h2>
          <p style="color:#666;margin-bottom:24px">Hi ${username}, click below to verify your AuthForge account.</p>
          <a href="${url}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">Verify Email</a>
          <p style="color:#999;font-size:12px;margin-top:24px">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
        </div>
      `
    });
  } catch(e) {
    console.error('Email send error:', e.message);
  }
}

async function sendTeamInviteEmail(email, ownerUsername, token, permissions) {
  const url = process.env.APP_URL + '/index.html?team_invite=' + token;
  try {
    await resend.emails.send({
      from: 'AuthForge <noreply@authforge.dev>',
      to: email,
      subject: ownerUsername + ' invited you to their AuthForge team',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <div style="margin-bottom:24px">
            <div style="width:24px;height:24px;background:#3b82f6;border-radius:5px;display:inline-block"></div>
            <span style="font-size:16px;font-weight:700;margin-left:8px">AuthForge</span>
          </div>
          <h2 style="font-size:20px;margin-bottom:8px">You've been invited!</h2>
          <p style="color:#666;margin-bottom:8px"><strong>${ownerUsername}</strong> invited you to join their AuthForge team.</p>
          <p style="color:#666;margin-bottom:24px">You'll have access to manage their applications with custom permissions.</p>
          <a href="${url}" style="display:inline-block;background:#3b82f6;color:#fff;padding:10px 24px;border-radius:8px;text-decoration:none;font-weight:600">Accept Invitation</a>
          <p style="color:#999;font-size:12px;margin-top:24px">This invite expires in 48 hours.</p>
        </div>
      `
    });
  } catch(e) {
    console.error('Email send error:', e.message);
  }
}

module.exports = { sendVerificationEmail, sendTeamInviteEmail };
