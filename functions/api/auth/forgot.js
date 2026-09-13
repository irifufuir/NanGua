/* ============================================================
 *  POST /api/auth/forgot
 *  找回密码申请 → 发邮件给管理员
 * ============================================================ */
import { sbInsert } from '../../_shared/supabase.js';
import { sendMail } from '../../_shared/mailer.js';
import { jsonResponse, handleOptions, isValidEmail } from '../../_shared/utils.js';

export async function onRequestOptions() {
  return handleOptions();
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    const body = await request.json();
    const email   = String(body.email || '').trim();
    const contact = String(body.contact || '').trim();
    const reason  = String(body.reason || '').slice(0, 500);

    if (!isValidEmail(email)) {
      return jsonResponse({ ok: false, msg: '邮箱格式不正确' }, 400);
    }
    if (!contact || contact.length > 100) {
      return jsonResponse({ ok: false, msg: '联系方式不能为空' }, 400);
    }

    /* ---------- 入库 ---------- */
    await sbInsert(env, 'forgot_requests', {
      email,
      contact,
      reason,
      status: 'pending',
    });

    /* ---------- 发邮件给管理员 ---------- */
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2 style="color: #c5513a;">找回密码申请</h2>
        <p><b>用户邮箱：</b>${email}</p>
        <p><b>联系方式：</b>${contact}</p>
        <p><b>问题描述：</b>${reason || '（用户未填写）'}</p>
        <p><b>提交时间：</b>${new Date().toLocaleString('zh-CN')}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
        <p>请管理员人工核实用户身份后，在后台手动修改其密码。</p>
      </div>
    `;

    await sendMail(
      env,
      env.ADMIN_EMAIL,
      `【找回密码申请】${email}`,
      html,
      email
    );

    return jsonResponse({ ok: true, msg: '申请已提交' });
  } catch (e) {
    console.error('[forgot] 错误：', e.message);
    return jsonResponse({ ok: false, msg: '服务器内部错误: ' + e.message }, 500);
  }
}