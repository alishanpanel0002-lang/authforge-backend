const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const supabase = require('./supabase');

const bots = new Map();

/**
 * Starts a Discord bot instance for a developer who has configured a token.
 * This bot listens for commands in specific channels to remotely manage licenses/users.
 */
async function startBot(botConfig) {
    if (!botConfig.bot_token) return;
    if (bots.has(botConfig.id)) {
        try { bots.get(botConfig.id).destroy(); } catch (e) {}
    }
    
    const client = new Client({ 
        intents: [
            GatewayIntentBits.Guilds, 
            GatewayIntentBits.GuildMessages, 
            GatewayIntentBits.MessageContent
        ] 
    });
    
    client.on('ready', () => {
        console.log(`[ShadowAuth Bot] Running for Dev: ${botConfig.developer_id}`);
    });

    client.on('messageCreate', async (msg) => {
        if (msg.author.bot) return;
        const prefix = botConfig.bot_prefix || '!';
        if (!msg.content.startsWith(prefix)) return;

        // Channel verification (if configured)
        if (botConfig.command_channel_id && msg.channelId !== botConfig.command_channel_id) return;

        const args = msg.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        // --- COMMANDS ---

        // 1. !check [key] - Get license status
        if (command === 'check' || command === 'license') {
            const key = args[0];
            if (!key) return msg.reply('❌ Usage: `!check [license_key]`');
            
            const { data: lic } = await supabase.from('licenses').select('*, apps(name)').eq('license_key', key).eq('developer_id', botConfig.developer_id).single();
            if (!lic) return msg.reply('❌ License not found or does not belong to your account.');

            const embed = new EmbedBuilder()
                .setTitle('🔑 License Info: ' + key)
                .setColor(lic.is_active ? 0xdc2626 : 0x7f1d1d)
                .addFields(
                    { name: 'Application', value: lic.apps.name, inline: true },
                    { name: 'Status', value: lic.is_active ? '✅ Enabled' : '🚫 Disabled', inline: true },
                    { name: 'Slots', value: `${lic.used_slots}/${lic.max_users}`, inline: true },
                    { name: 'Expires', value: lic.expires_at ? new Date(lic.expires_at).toLocaleDateString() : 'Never', inline: true }
                )
                .setFooter({ text: 'ShadowAuth Intelligence' })
                .setTimestamp();

            msg.reply({ embeds: [embed] });
        }

        // 2. !reset [username] - Reset HWID for a user
        if (command === 'reset') {
            const username = args[0];
            if (!username) return msg.reply('❌ Usage: `!reset [username]`');
            
            // First find the user in an app belonging to this developer
            const { data: user } = await supabase.from('app_users').select('id, username').eq('username', username).eq('developer_id', botConfig.developer_id).single();
            if (!user) return msg.reply('❌ User not found under your applications.');

            const { error: resetErr } = await supabase.from('user_hwids').delete().eq('user_id', user.id);
            if (resetErr) return msg.reply('❌ System Error: ' + resetErr.message);
            
            msg.reply(`✅ Machine lock for user **${username}** has been purged successfully.`);
        }

        // 3. !stats - App statistics
        if (command === 'stats') {
            const { data: apps } = await supabase.from('apps').select('id, name').eq('developer_id', botConfig.developer_id);
            if (!apps) return msg.reply('No active apps.');
            
            let report = '**ShadowAuth Portfolio Performance:**\n\n';
            for (const app of apps) {
                const { count: users } = await supabase.from('app_users').select('id', { count: 'exact', head: true }).eq('app_id', app.id);
                const { count: logins } = await supabase.from('login_logs').select('id', { count: 'exact', head: true }).eq('app_id', app.id).eq('success', true);
                report += `• **${app.name}**: ${users || 0} users | ${logins || 0} logins\n`;
            }
            msg.reply(report);
        }
        
        // 4. !ban [username] - Ban a user
        if (command === 'ban') {
             const username = args[0];
             if (!username) return msg.reply('❌ Usage: `!ban [username]`');
             const { error } = await supabase.from('app_users').update({ is_banned: true }).eq('username', username).eq('developer_id', botConfig.developer_id);
             if (error) return msg.reply('❌ Failed to ban: ' + error.message);
             msg.reply(`🚫 Banned user **${username}** across all apps.`);
        }
    });

    try {
        await client.login(botConfig.bot_token);
        bots.set(botConfig.id, client);
    } catch (e) {
        console.error(`[ShadowAuth Bot] Failed to initialize for ${botConfig.developer_id}:`, e.message);
    }
}

/**
 * Initializes all active bots for developers with Business plans.
 */
async function initAllBots() {
    const { data } = await supabase.from('bots').select('*').eq('is_active', true).not('bot_token', 'is', null);
    if (data) {
        for (const bot of data) {
            startBot(bot);
        }
    }
}

module.exports = { initAllBots, startBot };
