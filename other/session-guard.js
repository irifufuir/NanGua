/* ============================================================
 *  单设备登录守卫 · other/session-guard.js
 *  ----------------------------------------------------------
 *  作用：每个账号同一时间只能在一个设备上登录
 *        - 用户在 A 设备登录 → A 写入 active_device_id
 *        - 用户在 B 设备登录 → B 抢占 active_device_id
 *        - A 轮询发现 active_device_id 不是自己 → 强制登出
 *  ⭐ 优化：只有主动登录（sessionStorage 有 fresh_login 标记）才抢占；
 *          页面刷新时只轮询，不重复写库。
 *  依赖：window.supabaseClient（必须先定义）
 * ============================================================ */
(function () {
    'use strict';

    var POLL_INTERVAL = 10000;   // 10 秒轮询一次
    var FIRST_DELAY   = 1500;    // 首次检查延迟
    var DEVICE_KEY    = 'nangua_device_id';
    var FRESH_KEY     = 'nangua_fresh_login';

    var timer         = null;
    var kicked        = false;
    var currentUserId = null;
    var myDeviceId    = null;

    /* ---------- 读取 / 清除"主动登录"标记 ---------- */
    function isFreshLogin() {
        try { return sessionStorage.getItem(FRESH_KEY) === '1'; }
        catch (e) { return false; }
    }
    function clearFreshLogin() {
        try { sessionStorage.removeItem(FRESH_KEY); } catch (e) {}
    }

    /* ---------- 生成 / 读取本机 device_id ---------- */
    function getOrCreateDeviceId() {
        var id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = 'dev_' + Date.now() + '_' +
                 Math.random().toString(36).slice(2, 10);
            try { localStorage.setItem(DEVICE_KEY, id); } catch (e) {}
        }
        return id;
    }

    /* ---------- 生成人类可读的设备名 ---------- */
    function getDeviceName() {
        var ua = navigator.userAgent || '';
        var platform = '未知设备';
        if (/Windows/i.test(ua))                  platform = 'Windows';
        else if (/Macintosh|Mac OS X/i.test(ua))  platform = 'Mac';
        else if (/Android/i.test(ua))             platform = 'Android';
        else if (/iPhone|iPad|iPod/i.test(ua))    platform = 'iOS';
        else if (/Linux/i.test(ua))               platform = 'Linux';

        var browser = '浏览器';
        if (/Edg\//i.test(ua))                    browser = 'Edge';
        else if (/OPR\/|Opera/i.test(ua))         browser = 'Opera';
        else if (/Chrome\//i.test(ua))            browser = 'Chrome';
        else if (/Firefox\//i.test(ua))           browser = 'Firefox';
        else if (/Safari\//i.test(ua))            browser = 'Safari';

        return platform + ' · ' + browser;
    }

    /* ---------- 强制登出 ---------- */
    function forceLogout(reason) {
        if (kicked) return;
        kicked = true;

        if (timer) { clearInterval(timer); timer = null; }

        var msg = reason || '你的账号已在其他设备登录，当前设备已被强制退出。';
        alert(msg);

        if (window.supabaseClient && window.supabaseClient.auth) {
            window.supabaseClient.auth.signOut()
                .then(function () { location.href = 'index.html'; })
                .catch(function () { location.href = 'index.html'; });
        } else {
            location.href = 'index.html';
        }
    }

    /* ---------- 抢占当前设备 ---------- */
    function claimDevice() {
        if (!window.supabaseClient || !currentUserId || !myDeviceId) {
            return Promise.resolve();
        }

        var now = new Date().toISOString();

        return window.supabaseClient
            .from('profiles')
            .update({
                active_device_id:       myDeviceId,
                active_device_login_at: now
            })
            .eq('id', currentUserId)
            .then(function (r) {
                if (r.error) {
                    console.warn('[设备守卫] 抢占失败：', r.error.message);
                } else {
                    console.log('[设备守卫] 已抢占设备：', getDeviceName());
                }
            });
    }

    /* ---------- 单次检查 ---------- */
    function checkOnce() {
        if (kicked || !currentUserId || !myDeviceId) return;
        if (!window.supabaseClient) return;

        window.supabaseClient
            .from('profiles')
            .select('active_device_id')
            .eq('id', currentUserId)
            .maybeSingle()
            .then(function (res) {
                if (res.error || !res.data) return;

                var remoteId = res.data.active_device_id;

                // 远端为空（第一次使用）→ 补写
                if (!remoteId) {
                    claimDevice();
                    return;
                }

                // 远端不是我 → 被其他设备抢登，踢出
                if (remoteId !== myDeviceId) {
                    forceLogout('你的账号已在其他设备登录，当前设备已被强制退出。');
                }
            });
    }

    /* ---------- 启动轮询 ---------- */
    function startPolling() {
        setTimeout(function () {
            checkOnce();
            if (timer) clearInterval(timer);
            timer = setInterval(checkOnce, POLL_INTERVAL);
        }, FIRST_DELAY);
    }

    /* ---------- 启动 ---------- */
    function start(user) {
        if (!user || !user.id || kicked) return;

        // ★ 管理员豁免
        var role = user.app_metadata && user.app_metadata.role;
        if (role === 'admin') {
            console.log('[设备守卫] 当前为管理员，跳过单设备限制');
            return;
        }

        currentUserId = user.id;
        myDeviceId    = getOrCreateDeviceId();

        console.log('[设备守卫] 启动，device_id =', myDeviceId);

        // ★ 判断是否是"主动登录"
        var fresh = isFreshLogin();
        clearFreshLogin();

        if (fresh) {
            // 主动登录 → 抢占设备后再开始轮询
            console.log('[设备守卫] 检测到主动登录，抢占设备…');
            claimDevice().then(startPolling);
        } else {
            // 页面刷新 / token 恢复 → 只轮询，不抢占
            console.log('[设备守卫] 页面恢复，仅轮询不抢占');
            startPolling();
        }
    }

    /* ---------- 挂到 window ---------- */
    window.SessionGuard = {
        start:    start,
        checkNow: checkOnce,
        stop: function () {
            if (timer) { clearInterval(timer); timer = null; }
        },
        getDeviceId: getOrCreateDeviceId
    };

    /* ---------- 自动监听 Supabase 会话 ---------- */
    function autoStart() {
        if (!window.supabaseClient || !window.supabaseClient.auth) {
            console.warn('[设备守卫] supabaseClient 未就绪，跳过');
            return;
        }

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
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', autoStart);
    } else {
        autoStart();
    }
})();