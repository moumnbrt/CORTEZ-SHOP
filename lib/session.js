import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';

const SESSION_COOKIE = 'cortez_session';
const STATE_COOKIE = 'cortez_oauth_state';
const MAX_AGE = 7 * 24 * 60 * 60;

function sign(body) {
  return createHmac('sha256', config.sessionSecret).update(body).digest('base64url');
}

function encode(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

function decode(value) {
  if (!value || typeof value !== 'string') return null;
  const [body, signature] = value.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  if (signature.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function cookies(req) {
  const result = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1));
  }
  return result;
}

function cookie(name, value, maxAge) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (config.isProduction || config.baseUrl.startsWith('https://')) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function getSession(req) {
  const payload = decode(cookies(req)[SESSION_COOKIE]);
  if (!payload || !payload.exp || payload.exp < Date.now()) return null;
  return payload;
}

export function setSession(res, user) {
  const payload = {
    uid: user.uid,
    username: user.username,
    avatar: user.avatar || '',
    hasShopRole: Boolean(user.hasShopRole),
    isAdmin: Boolean(user.isAdmin),
    demo: Boolean(user.demo),
    exp: Date.now() + MAX_AGE * 1000,
  };
  res.append('Set-Cookie', cookie(SESSION_COOKIE, encode(payload), MAX_AGE));
  return payload;
}

export function clearSession(res) {
  res.append('Set-Cookie', cookie(SESSION_COOKIE, '', 0));
}

export function setOauthState(res) {
  const state = encode({ nonce: randomUUID(), exp: Date.now() + 10 * 60 * 1000 });
  res.append('Set-Cookie', cookie(STATE_COOKIE, state, 600));
  return state;
}

export function checkOauthState(req, state) {
  const provided = decode(state);
  const stored = decode(cookies(req)[STATE_COOKIE]);
  return Boolean(
    provided?.nonce && stored?.nonce &&
    provided.nonce === stored.nonce &&
    provided.exp > Date.now()
  );
}

export function clearOauthState(res) {
  res.append('Set-Cookie', cookie(STATE_COOKIE, '', 0));
}
