import { config } from './config.js';

const API = 'https://discord.com/api/v10';
const { discord } = config;

async function request(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.bot ? { Authorization: `Bot ${options.bot}` } : {}),
      ...options.headers,
    },
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.message ? ` (${body.message})` : '';
    } catch {
      /* ignore */
    }
    const error = new Error(`Discord API ${response.status}${detail}`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export function authorizationUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: discord.clientId,
    redirect_uri: discord.redirectUri,
    scope: 'identify guilds guilds.members.read',
    state,
    prompt: 'consent',
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

export function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: discord.clientId,
    client_secret: discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: discord.redirectUri,
  });
  return request('/oauth2/token', { method: 'POST', body });
}

export function fetchUser(token) {
  return request('/users/@me', { token });
}

async function fetchGuildMember(token, guildId) {
  if (!guildId) return null;
  try {
    return await request(`/users/@me/guilds/${guildId}/member`, { token });
  } catch (error) {
    if (error.status === 404 || error.status === 403) return null;
    throw error;
  }
}

async function resolveShopRoleIds() {
  if (discord.shopRoleIds.length) return discord.shopRoleIds;
  if (!discord.botToken || !discord.guildId) {
    throw new Error(
      'لم يتم ضبط معرّف رول المتجر. أضف DISCORD_SHOP_ROLE_IDS أو DISCORD_BOT_TOKEN مع DISCORD_GUILD_ID.'
    );
  }
  const roles = await request(`/guilds/${discord.guildId}/roles`, { bot: discord.botToken });
  const wanted = discord.shopRoleName.trim().toLocaleLowerCase('ar');
  return roles
    .filter((role) => role.name.trim().toLocaleLowerCase('ar') === wanted)
    .map((role) => role.id);
}

export async function checkAccess(token, user) {
  if (!discord.guildId) {
    throw new Error('لم يتم ضبط DISCORD_GUILD_ID.');
  }
  const member = await fetchGuildMember(token, discord.guildId);
  if (!member) {
    return { hasShopRole: false, reason: 'لست عضواً في سيرفر العائلة.' };
  }
  const roleIds = await resolveShopRoleIds();
  const memberRoles = new Set(member.roles || []);
  const hasShopRole = roleIds.some((id) => memberRoles.has(id));
  return {
    hasShopRole,
    reason: hasShopRole ? '' : `لا تملك رول «${discord.shopRoleName}» في السيرفر.`,
  };
}

export function isAdmin(userId) {
  return discord.adminIds.includes(String(userId));
}
