/* ============================================================
 *  functions/_shared/mailer.js
 *  通过 Brevo（HTTP API）发送邮件
 *  —— Worker 不支持 SMTP，所以走 HTTP
 * ============================================================ */

/**
 * 发送 HTML 邮件
 * @param {Object} env      - Pages 环境变量
 * @param {string} to       - 收件人
 * @param {string} subject  - 主题
 * @param {string} html     - HTML 内容
 * @param {string} [replyTo]- 回复地址（可选）
 */
export async function sendMail(env, to, subject, html, replyTo) {
  const payload = {
    sender: {
      name: env.MAIL_FROM_NAME || 'Nan Gua',
      email: env.MAIL_FROM,
    },
    to: [{ email: to }],
    subject: subject,
    htmlContent: html,
  };
  if (replyTo) payload.replyTo = { email: replyTo };

  const r = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Brevo ${r.status}: ${txt}`);
  }
  return await r.json();
}