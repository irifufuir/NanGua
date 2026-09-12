/* ============================================================
 *  POST /api/auth/send-code
 *  发送验证码
 * ============================================================ */
import { sbSelect, sbUpdate, sbInsert } from '../../_shared/supabase.js';
import { sendMail } from '../../_shared/mailer.js';
import { jsonResponse, handleOptions, isValidEmail, generateCode } from '../../_shared/utils.js';

const CODE_TTL_MINUTES = 5;
const COOLDOWN_SECONDS = 60;

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const email = String(body.email || '').trim();
    const type  = String(body.type || '').trim();

    /* ---------- 参数校验 ---------- */
    if (!isValidEmail(email)) {
      return jsonResponse({ ok: false, msg: '邮箱格式不正确' }, 400);
    }
    if (!['login', 'register', 'forgot'].includes(type)) {
      return jsonResponse({ ok: false, msg: '验证码用途不合法' }, 400);
    }

    /* ---------- 用户存在性检查 ---------- */
    const users = await sbSelect(
      env,
      'users',
      `email=eq.${encodeURIComponent(email)}&select=id`
    );

    if (type === 'register' && users.length > 0) {
      return jsonResponse({ ok: false, msg: '该邮箱已注册' }, 409);
    }
    if (type === 'login' && users.length === 0) {
      return jsonResponse({ ok: false, msg: '该邮箱尚未注册' }, 404);
    }

    /* ---------- 冷却检查（查最近一条验证码） ---------- */
    const since = new Date(Date.now() - COOLDOWN_SECONDS * 1000).toISOString();
    const recent = await sbSelect(
      env,
      'email_codes',
      `email=eq.${encodeURIComponent(email)}&created_at=gt.${encodeURIComponent(since)}&order=id.desc&limit=1&select=created_at`
    );
    if (recent.length > 0) {
      const last = new Date(recent[0].created_at).getTime();
      const wait = Math.ceil((COOLDOWN_SECONDS * 1000 - (Date.now() - last)) / 1000);
      return jsonResponse({ ok: false, msg: `请 ${wait} 秒后再试` }, 429);
    }

    /* ---------- 生成验证码 ---------- */
    const code = generateCode();
    const expireAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    /* ---------- 旧码作废 ---------- */
    await sbUpdate(
      env,
      'email_codes',
      `email=eq.${encodeURIComponent(email)}&type=eq.${type}&used=eq.false`,
      { used: true }
    );

    /* ---------- 写入新码 ---------- */
    await sbInsert(env, 'email_codes', {
      email,
      code,
      type,
      expire_at: expireAt,
      used: false,
    });

    /* ---------- 发送邮件 ---------- */
    const titles = {
      login: '登录验证码',
      register: '注册验证码',
      forgot: '找回密码验证码',
    };
    const title = titles[type] || '验证码';

    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #c5513a;">Nan Gua · ${title}</h2>
        <p>您好，您的验证码是：</p>
        <div style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #c5513a; padding: 12px 0;">
          ${code}
        </div>
        <p style="color: #888;">验证码 ${CODE_TTL_MINUTES} 分钟内有效，请勿泄露给他人。</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
        <p style="font-size: 12px; color: #bbb;">本邮件由系统自动发送，请勿回复。</p>
      </div>
    `;

    await sendMail(env, email, `【Nan Gua】${title} - ${code}`, html);

    return jsonResponse({ ok: true, msg: '验证码已发送' });
  } catch (e) {
    console.error('[send-code] 错误：', e.message);
    return jsonResponse({ ok: false, msg: '服务器内部错误: ' + e.message }, 500);
  }
}