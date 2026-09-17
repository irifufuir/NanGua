/* ============================================================
 *  封禁守卫模块 · other/ban-guard.js
 *  ----------------------------------------------------------
 *  作用：已登录用户如果被管理员封禁，最多 N 秒内被踢回登录页
 *  ⭐ 管理员豁免：role === 'admin' 的账号不会被踢
 *  ⭐ 修复：profiles 表没有 ban_reason 列时，查询会 400
 *          现改为只查 is_blocked 和 banned_until
 *  用法：在 user-dashboard.html 里
 *        之后再引本文件（要保证 supabaseClient 已定义）
 * ============================================================ */
(function () {
    'use strict';

    var POLL_INTERVAL = 10000;   // 10 秒一轮
    var FIRST_DELAY   = 1500;    // 首查延迟

    var timer = null;
    var kicked = false;
    var currentUserId = null;
    var isAdmin = false;

    /* ---------- 弹框 + 踢回登录页 ---------- */
    function kickOut(reason, bannedUntil) {
        if (kicked) return;
        kicked = true;

        if (timer) { clearInterval(timer); timer = null; }

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

        msg += '\n\n点击"确定"后将退出登录。';

        alert(msg);

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

    /* ---------- 判断是否豁免 ---------- */
    function shouldGuard(user) {
        if (!user) return false;
        var role = user.app_metadata && user.app_metadata.role;
        return role !== 'admin';   // 管理员不守卫
    }

    /* ---------- 单次检查 ---------- */
    function checkOnce() {
        if (kicked || !currentUserId) return;
        if (isAdmin) return;                     // ⭐ 管理员豁免
        if (!window.supabaseClient) return;

        window.supabaseClient
            .from('profiles')
            .select('is_blocked, banned_until')
            .eq('id', currentUserId)
            .maybeSingle()
            .then(function (res) {
                if (res.error || !res.data) return;
                var row = res.data;

                if (row.is_blocked === true) {
                    kickOut(null, row.banned_until);
                }
            });
    }

    /* ---------- 启动轮询 ---------- */
    function start(user) {
        if (!user || !user.id || kicked) return;

        currentUserId = user.id;
        isAdmin = !shouldGuard(user);
        if (isAdmin) {
            console.log('[封禁守卫] 当前为管理员，跳过守卫');
            return;
        }

        setTimeout(function () {
            checkOnce();
            if (timer) clearInterval(timer);
            timer = setInterval(checkOnce, POLL_INTERVAL);
        }, FIRST_DELAY);
    }

    /* ---------- 挂到 window ---------- */
    window.BanGuard = {
        start: start,
        checkNow: checkOnce,
        stop: function () {
            if (timer) { clearInterval(timer); timer = null; }
        }
    };

    /* ---------- 自动监听 ---------- */
    function autoStart() {
        if (!window.supabaseClient || !window.supabaseClient.auth) return;

        window.supabaseClient.auth.getSession().then(function (res) {
            var session = res.data && res.data.session;
            if (session && session.user) start(session.user);
        });

        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_IN' && session && session.user) {
                kicked = false;
                start(session.user);
            } else if (event === 'SIGNED_OUT') {
                if (timer) { clearInterval(timer); timer = null; }
                currentUserId = null;
                isAdmin = false;
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoStart);
    } else {
        autoStart();
    }
})();