/* ============================================================
 *  POST /api/auth/login
 *  登录（邮箱 + 验证码）
 * ============================================================ */
import { sbSelect, sbUpdate } from '../../_shared/supabase.js';
import { jsonResponse, handleOptions, isValidEmail } from '../../_shared/utils.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const email = String(body.email || '').trim();
    const code  = String(body.code || '').trim();

    if (!isValidEmail(email)) {
      return jsonResponse({ ok: false, msg: '邮箱格式不正确' }, 400);
    }
    if (!/^\d{6}$/.test(code)) {
      return jsonResponse({ ok: false, msg: '验证码格式不正确' }, 400);
    }

    /* ---------- 校验验证码 ---------- */
    const codes = await sbSelect(
      env,
      'email_codes',
      `email=eq.${encodeURIComponent(email)}&code=eq.${code}&type=eq.login&used=eq.false&expire_at=gt.${encodeURIComponent(new Date().toISOString())}&order=id.desc&limit=1&select=id`
    );
    if (codes.length === 0) {
      return jsonResponse({ ok: false, msg: '验证码错误或已过期' }, 400);
    }

    await sbUpdate(env, 'email_codes', `id=eq.${codes[0].id}`, { used: true });

    /* ---------- 查用户 ---------- */
    const users = await sbSelect(
      env,
      'users',
      `email=eq.${encodeURIComponent(email)}&select=id,email,created_at`
    );
    if (users.length === 0) {
      return jsonResponse({ ok: false, msg: '用户不存在' }, 404);
    }

    /* ---------- 生成 token ---------- */
    const token = crypto.randomUUID().replace(/-/g, '') +
                  crypto.randomUUID().replace(/-/g, '');

    return jsonResponse({
      ok: true,
      msg: '登录成功',
      user: { id: users[0].id, email: users[0].email },
      token,
    });
  } catch (e) {
    console.error('[login] 错误：', e.message);
    return jsonResponse({ ok: false, msg: '服务器内部错误: ' + e.message }, 500);
  }
}