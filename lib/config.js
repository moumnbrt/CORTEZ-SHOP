const list = (value = '') =>
  value.split(',').map((item) => item.trim()).filter(Boolean);

const clientId = process.env.DISCORD_CLIENT_ID || '';
const clientSecret = process.env.DISCORD_CLIENT_SECRET || '';
const isProduction = process.env.NODE_ENV === 'production';
const demoRequested = (process.env.DEMO_MODE || '').toLowerCase() === 'true';
const port = Number(process.env.PORT || 3000);
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');

export const config = {
  port,
  baseUrl,
  isProduction,
  sessionSecret: process.env.SESSION_SECRET || 'cortez-dev-secret-change-this',
  brand: 'CORTEZ',
  discord: {
    clientId,
    clientSecret,
    redirectUri:
      process.env.DISCORD_REDIRECT_URI || `${baseUrl}/auth/discord/callback`,
    guildId: process.env.DISCORD_GUILD_ID || '',
    shopRoleIds: list(process.env.DISCORD_SHOP_ROLE_IDS),
    shopRoleName: process.env.DISCORD_SHOP_ROLE_NAME || 'شوب',
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    adminIds: list(process.env.ADMIN_DISCORD_IDS),
    inviteUrl: process.env.DISCORD_INVITE_URL || 'https://discord.gg/',
    orderWebhookUrl: process.env.DISCORD_ORDER_WEBHOOK_URL || '',
  },
  demoMode:
    demoRequested || (!isProduction && (!clientId || !clientSecret)),
  previewMode: process.env.PREVIEW_MODE === 'true' && !isProduction,
};
