/* ============================================================
 *  functions/_shared/supabase.js
 *  通过 Supabase REST API（PostgREST）操作数据库
 *  —— Worker 环境不能直连 PostgreSQL，所以走 HTTP
 * ============================================================ */

function baseHeaders(env) {
  return {
    'apikey': env.SUPABASE_SERVICE_KEY,
    'Authorization': `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Accept': 'application/json',
  };
}

/**
 * 查询
 * 例：sbSelect(env, 'users', 'email=eq.abc@163.com&select=id')
 */
export async function sbSelect(env, table, query = '') {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query ? '?' + query : ''}`;
  const r = await fetch(url, { headers: baseHeaders(env) });
  if (!r.ok) {
    throw new Error(`Supabase SELECT ${r.status}: ${await r.text()}`);
  }
  return await r.json();
}

/**
 * 插入
 */
export async function sbInsert(env, table, data) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {
      ...baseHeaders(env),
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    throw new Error(`Supabase INSERT ${r.status}: ${await r.text()}`);
  }
  return await r.json();
}

/**
 * 更新
 * 例：sbUpdate(env, 'email_codes', 'email=eq.abc&used=eq.false', { used: true })
 */
export async function sbUpdate(env, table, filter, data) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const r = await fetch(url, {
    method: 'PATCH',
    headers: {
      ...baseHeaders(env),
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) {
    throw new Error(`Supabase UPDATE ${r.status}: ${await r.text()}`);
  }
  return true;
}