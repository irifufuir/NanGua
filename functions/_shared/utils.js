/* ============================================================
 *  functions/_shared/utils.js
 *  通用工具：响应封装、密码哈希、邮箱校验、验证码生成
 * ============================================================ */

/**
 * 返回 JSON 响应
 */
export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
  });
}

/**
 * 处理 OPTIONS 预检
 */
export function handleOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Max-Age': '86400',
    },
  });
}

/**
 * 用 Web Crypto 做 PBKDF2-SHA256 密码哈希
 * 返回格式：pbkdf2$迭代次数$盐(hex)$哈希(hex)
 */
export async function hashPassword(password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = 100000;

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  );

  const toHex = (u8) => [...u8].map(b => b.toString(16).padStart(2, '0')).join('');
  return `pbkdf2$${iterations}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
}

/* ---------- 邮箱校验 ---------- */
const EMAIL_RE = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
const ALLOWED_DOMAINS = [
  '@163.com', '@qq.com', '@sina.com', '@hotmail.com',
  '@sina.cn', '@live.cn', '@gmail.com', '@sohu.com'
];

export function isValidEmail(email) {
  if (typeof email !== 'string' || email.length > 100) return false;
  if (!EMAIL_RE.test(email)) return false;
  return ALLOWED_DOMAINS.some(d => email.toLowerCase().endsWith(d));
}

/**
 * 生成 6 位数字验证码
 */
export function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}