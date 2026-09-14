/* ============================================================
 *  封禁守卫模块 · other/ban-guard.js
 *  ----------------------------------------------------------
 *  作用：已登录用户如果被管理员封禁，最多 N 秒内被踢回登录页
 *  用法：在 user-dashboard.html / admin-dashboard.html 里
 *        <script src="other/supabase-client-helper.js"></script>
 *        之后再引本文件（要保证 supabaseClient 已定义）
 * ============================================================ */
(function () {
    'use strict';

    // 轮询间隔（毫秒）。10 秒够及时，也不会给数据库太大压力
    var POLL_INTERVAL = 10000;

    // 页面加载后延迟多久开始首次检查（毫秒），给 auth session 恢复留点时间
    var FIRST_DELAY = 1500;

    var timer = null;
    var kicked = false;   // 防止重复弹框
    var currentUserId = null;

    /* ---------- 弹框 + 踢回登录页 ---------- */
    function kickOut(reason, bannedUntil) {
        if (kicked) return;
        kicked = true;

        // 停掉轮询
        if (timer) { clearInterval(timer); timer = null; }

        // 组装提示文案
        var msg = '你的账号已被管理员封禁，无法继续使用。\n\n';
        msg += '原因：' + (reason || '违反平台规定') + '\n';

        if (bannedUntil) {
            var until = new Date(bannedUntil);
            var diff  = until.getTime() - Date.now();
            if (diff > 0) {
                msg += '解封时间：' + until.toLocaleString('zh-CN', { hour12: false }) + '\n';
                msg += '剩余：' + humanizeDuration(diff);
            } else {
                msg += '状态：即将解封';
            }
        } else {
            msg += '状态：永久封禁';
        }

        msg += '\n\n点击“确定”后将退出登录。';

        alert(msg);

        // 退出登录 → 回登录页
        if (window.supabaseClient && window.supabaseClient.auth) {
            window.supabaseClient.auth.signOut().then(function () {
                location.href = 'index.html';
            }).catch(function () {
                location.href = 'index.html';
            });
        } else {
            location.href = 'index.html';
        }
    }

    function humanizeDuration(ms) {
        var totalMin = Math.floor(ms / 60000);
        var d = Math.floor(totalMin / 1440);
        var h = Math.floor((totalMin % 1440) / 60);
        var m = totalMin % 60;
        var parts = [];
        if (d > 0) parts.push(d + ' 天');
        if (h > 0) parts.push(h + ' 小时');
        if (d === 0 && m > 0) parts.push(m + ' 分钟');
        return parts.join(' ') || '不到 1 分钟';
    }

    /* ---------- 单次检查 ---------- */
    function checkOnce() {
        if (kicked || !currentUserId) return;
        if (!window.supabaseClient) return;

        window.supabaseClient
            .from('profiles')
            .select('is_blocked, banned_until, ban_reason')
            .eq('id', currentUserId)
            .maybeSingle()
            .then(function (res) {
                if (res.error || !res.data) return;

                var row = res.data;

                // 情况 1：is_blocked = true → 直接被踢
                if (row.is_blocked === true) {
                    kickOut(row.ban_reason, row.banned_until);
                    return;
                }

                // 情况 2：banned_until 已经过期，但 is_blocked 还是 true → 自动解封
                //         （这个一般靠数据库定时任务或 RPC 处理，这里只做兜底判断）
                if (row.banned_until) {
                    var untilTs = new Date(row.banned_until).getTime();
                    if (untilTs <= Date.now() && row.is_blocked === true) {
                        // 时间到了但标记没清，说明后台没跑自动解封
                        // 这里不主动写数据库，避免权限问题，只是放行
                        console.log('[封禁守卫] 封禁已过期，放行');
                    }
                }
            });
    }

    /* ---------- 启动轮询 ---------- */
    function start(userId) {
        if (!userId || kicked) return;
        currentUserId = userId;

        setTimeout(function () {
            checkOnce();
            if (timer) clearInterval(timer);
            timer = setInterval(checkOnce, POLL_INTERVAL);
        }, FIRST_DELAY);
    }

    /* ---------- 挂到 window 上，dashboard 里显式调用 ---------- */
    window.BanGuard = {
        start: start,
        checkNow: checkOnce,
        stop: function () {
            if (timer) { clearInterval(timer); timer = null; }
        }
    };

    /* ---------- 自动监听：session 恢复后自动启动 ---------- */
    function autoStart() {
        if (!window.supabaseClient || !window.supabaseClient.auth) return;

        window.supabaseClient.auth.getSession().then(function (res) {
            var session = res.data && res.data.session;
            if (session && session.user && session.user.id) {
                start(session.user.id);
            }
        });

        // 用户重新登录时也启动（比如先踢出去，再登录）
        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_IN' && session && session.user) {
                kicked = false;
                start(session.user.id);
            } else if (event === 'SIGNED_OUT') {
                if (timer) { clearInterval(timer); timer = null; }
                currentUserId = null;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoStart);
    } else {
        autoStart();
    }
})();