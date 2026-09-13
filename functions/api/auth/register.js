/* ============================================================
 *  POST /api/auth/register
 *  注册
 * ============================================================ */
import { sbSelect, sbUpdate, sbInsert } from '../../_shared/supabase.js';
import { jsonResponse, handleOptions, isValidEmail, hashPassword } from '../../_shared/utils.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const email    = String(body.email || '').trim();
    const code     = String(body.code || '').trim();
    const password = String(body.password || '');

    /* ---------- 参数校验 ---------- */
    if (!isValidEmail(email)) {
      return jsonResponse({ ok: false, msg: '邮箱格式不正确' }, 400);
    }
    if (!/^\d{6}$/.test(code)) {
      return jsonResponse({ ok: false, msg: '验证码格式不正确' }, 400);
    }
    if (password.length < 6 || password.length > 64) {
      return jsonResponse({ ok: false, msg: '密码长度需在 6-64 位之间' }, 400);
    }

    /* ---------- 校验验证码 ---------- */
    const codes = await sbSelect(
      env,
      'email_codes',
      `email=eq.${encodeURIComponent(email)}&code=eq.${code}&type=eq.register&used=eq.false&expire_at=gt.${encodeURIComponent(new Date().toISOString())}&order=id.desc&limit=1&select=id`
    );
    if (codes.length === 0) {
      return jsonResponse({ ok: false, msg: '验证码错误或已过期' }, 400);
    }

    /* ---------- 标记已用 ---------- */
    await sbUpdate(env, 'email_codes', `id=eq.${codes[0].id}`, { used: true });

    /* ---------- 检查是否已注册 ---------- */
    const exist = await sbSelect(
      env,
      'users',
      `email=eq.${encodeURIComponent(email)}&select=id`
    );
    if (exist.length > 0) {
      return jsonResponse({ ok: false, msg: '该邮箱已注册' }, 409);
    }

    /* ---------- 密码哈希 + 入库 ---------- */
    const hash = await hashPassword(password);
    await sbInsert(env, 'users', {
      email,
      password_hash: hash,
    });

    return jsonResponse({ ok: true, msg: '注册成功' });
  } catch (e) {
    console.error('[register] 错误：', e.message);
    return jsonResponse({ ok: false, msg: '服务器内部错误: ' + e.message }, 500);
  }
}