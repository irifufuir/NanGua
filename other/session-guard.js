/* ============================================================
 *  会话守卫 · other/session-guard.js
 *  ----------------------------------------------------------
 *  合并了原 session-guard.js（单设备）和 ban-guard.js（封禁）
 *  一次轮询，同时检查：
 *    1. active_device_id   → 单设备登录
 *    2. is_blocked         → 管理员封禁
 *  管理员（role === 'admin'）自动跳过
 *  依赖：window.supabaseClient
 * ============================================================ */
(function () {
    'use strict';

    var POLL_INTERVAL = 10000;
    var FIRST_DELAY   = 1500;
    var DEVICE_KEY    = 'nangua_device_id';
    var FRESH_KEY     = 'nangua_fresh_login';

    var timer         = null;
    var kicked        = false;
    var currentUserId = null;
    var myDeviceId    = null;
    var isAdmin       = false;

    function isFreshLogin() {
        try { return sessionStorage.getItem(FRESH_KEY) === '1'; }
        catch (e) { return false; }
    }
    function clearFreshLogin() {
        try { sessionStorage.removeItem(FRESH_KEY); } catch (e) {}
    }

    function getOrCreateDeviceId() {
        var id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
            try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
        }
        return id;
    }

    function getDeviceName() {
        var ua = navigator.userAgent || '';
        var p = '未知设备';
        if (/Windows/i.test(ua))                 p = 'Windows';
        else if (/Macintosh|Mac OS X/i.test(ua)) p = 'Mac';
        else if (/Android/i.test(ua))            p = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua))   p = 'iOS';
        else if (/Linux/i.test(ua))              p = 'Linux';
        var b = '浏览器';
        if (/Edg\//i.test(ua))                   b = 'Edge';
        else if (/OPR\/|Opera/i.test(ua))        b = 'Opera';
        else if (/Chrome\//i.test(ua))           b = 'Chrome';
        else if (/Firefox\//i.test(ua))          b = 'Firefox';
        else if (/Safari\//i.test(ua))           b = 'Safari';
        return p + ' · ' + b;
    }

    /* ---------- 统一的强制登出 ---------- */
    function forceLogout(reason) {
        if (kicked) return;
        kicked = true;
        if (timer) { clearInterval(timer); timer = null; }

        alert(reason || '你的账号已在其他设备登录，当前设备已被强制退出。');

        if (window.supabaseClient && window.supabaseClient.auth) {
            window.supabaseClient.auth.signOut()
                .then(function () { location.href = 'index.html'; })
                .catch(function () { location.href = 'index.html'; });
        } else {
            location.href = 'index.html';
        }
    }

    function forceBanLogout(bannedUntil) {
        if (kicked) return;
        kicked = true;
        if (timer) { clearInterval(timer); timer = null; }

        var msg = '你的账号已被管理员封禁，无法继续使用。\n\n';
        if (bannedUntil) {
            var until = new Date(bannedUntil);
            var diff  = until.getTime() - Date.now();
            if (diff > 0) {
                msg += '解封时间：' + until.toLocaleString('zh-CN', { hour12: false }) + '\n';
                msg += '剩余：' + humanize(diff);
            } else {
                msg += '状态：即将解封';
            }
        } else {
            msg += '状态：永久封禁';
        }
        msg += '\n\n点击"确定"后将退出登录。';
        alert(msg);

        if (window.supabaseClient && window.supabaseClient.auth) {
            window.supabaseClient.auth.signOut()
                .then(function () { location.href = 'index.html'; })
                .catch(function () { location.href = 'index.html'; });
        } else {
            location.href = 'index.html';
        }
    }

    function humanize(ms) {
        var m = Math.floor(ms / 60000);
        var d = Math.floor(m / 1440);
        var h = Math.floor((m % 1440) / 60);
        var mm = m % 60;
        var p = [];
        if (d > 0) p.push(d + ' 天');
        if (h > 0) p.push(h + ' 小时');
        if (d === 0 && mm > 0) p.push(mm + ' 分钟');
        return p.join(' ') || '不到 1 分钟';
    }

    function claimDevice() {
        if (!window.supabaseClient || !currentUserId || !myDeviceId) {
            return Promise.resolve();
        }
        return window.supabaseClient
            .from('profiles')
            .update({
                active_device_id:       myDeviceId,
                active_device_login_at: new Date().toISOString()
            })
            .eq('id', currentUserId);
    }

    /* ---------- 单次检查：一次查询搞定两件事 ---------- */
    function checkOnce() {
        if (kicked || !currentUserId) return;
        if (isAdmin) return;
        if (!window.supabaseClient) return;

        window.supabaseClient
            .from('profiles')
            .select('is_blocked, banned_until, active_device_id')
            .eq('id', currentUserId)
            .maybeSingle()
            .then(function (res) {
                if (res.error || !res.data) return;

                // ① 封禁优先
                if (res.data.is_blocked === true) {
                    forceBanLogout(res.data.banned_until);
                    return;
                }

                // ② 单设备
                var remoteId = res.data.active_device_id;
                if (!remoteId) {
                    claimDevice();
                    return;
                }
                if (remoteId !== myDeviceId) {
                    forceLogout('你的账号已在其他设备登录，当前设备已被强制退出。');
                }
            });
    }

    function startPolling() {
        setTimeout(function () {
            checkOnce();
            if (timer) clearInterval(timer);
            timer = setInterval(checkOnce, POLL_INTERVAL);
        }, FIRST_DELAY);
    }

    function start(user) {
        if (!user || !user.id || kicked) return;

        var role = user.app_metadata && user.app_metadata.role;
        if (role === 'admin') {
            isAdmin = true;
            console.log('[会话守卫] 管理员，跳过');
            return;
        }

        currentUserId = user.id;
        myDeviceId    = getOrCreateDeviceId();

        var fresh = isFreshLogin();
        clearFreshLogin();

        if (fresh) {
            claimDevice().then(startPolling);
        } else {
            startPolling();
        }
    }

    window.SessionGuard = {
        start:    start,
        checkNow: checkOnce,
        stop:     function () { if (timer) { clearInterval(timer); timer = null; } },
        getDeviceId: getOrCreateDeviceId
    };

    function autoStart() {
        if (!window.supabaseClient || !window.supabaseClient.auth) return;
        window.supabaseClient.auth.getSession().then(function (res) {
            var s = res.data && res.data.session;
            if (s && s.user) start(s.user);
        });
        window.supabaseClient.auth.onAuthStateChange(function (event, session) {
            if (event === 'SIGNED_IN' && session && session.user) {
                kicked = false;
                start(session.user);
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