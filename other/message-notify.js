/* ============================================================
 *  全局消息通知模块
 *  - 每 5 秒轮询一次未读消息
 *  - 有新消息 → 播放提示音 + 显示右上角提示框
 *  - 点击提示框 → 跳到"我的好友"
 *  ⭐ 修复：初始 lastSeenTs 往前推 10 秒，避免漏消息
 *  依赖：window.supabaseClient、window.LoginSound
 * ============================================================ */
(function () {
    'use strict';

    if (!window.supabaseClient) {
        console.warn('[消息通知] supabaseClient 未定义，跳过');
        return;
    }

    var POLL_INTERVAL = 5000;
    var INITIAL_LOOKBACK = 10 * 1000;   // 初始回溯 10 秒

    var lastSeenTs    = null;
    var currentUserId = null;
    var pollTimer     = null;

    window.supabaseClient.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) return;

        currentUserId = session.user.id;

        // ⭐ 往前推 10 秒，避免时钟误差漏消息
        lastSeenTs = new Date(Date.now() - INITIAL_LOOKBACK).toISOString();

        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(checkNewMessages, POLL_INTERVAL);

        checkNewMessages();

        console.log('[消息通知] 已启动，用户 =', currentUserId);
    });

    function checkNewMessages() {
        if (!currentUserId) return;

        window.supabaseClient
            .from('messages')
            .select('id, from_user, content, created_at')
            .eq('to_user', currentUserId)
            .eq('is_read', false)
            .gt('created_at', lastSeenTs)
            .order('created_at', { ascending: true })
            .then(function (r) {
                if (r.error) {
                    console.warn('[消息通知] 查询失败：', r.error.message);
                    return;
                }
                var data = r.data || [];
                if (data.length === 0) return;

                lastSeenTs = data[data.length - 1].created_at;

                if (window.LoginSound && window.LoginSound.playMessageIfEnabled) {
                    window.LoginSound.playMessageIfEnabled();
                }

                showToast(data.length);

                console.log('[消息通知] 收到 ' + data.length + ' 条新消息');
            });
    }

    function showToast(count) {
        var old = document.getElementById('msgNotifyToast');
        if (old) old.remove();

        var el = document.createElement('div');
        el.id = 'msgNotifyToast';
        el.innerHTML =
            '<span style="font-size:22px;line-height:1;">💬</span>' +
            '<div style="display:flex;flex-direction:column;gap:2px;">' +
                '<span style="font-weight:600;">新消息</span>' +
                '<span style="font-size:0.82em;opacity:0.7;">收到 ' + count + ' 条，点击查看</span>' +
            '</div>';

        el.style.cssText = [
            'position:fixed',
            'top:80px',
            'right:24px',
            'z-index:99999',
            'background:var(--theme-card, #24222a)',
            'color:var(--theme-text, #f0ece5)',
            'border:1px solid var(--theme-accent-border, rgba(212,165,116,0.4))',
            'border-radius:14px',
            'padding:14px 20px',
            'font-family:inherit',
            'font-size:14px',
            'box-shadow:0 12px 40px rgba(0,0,0,0.45)',
            'display:flex',
            'align-items:center',
            'gap:12px',
            'cursor:pointer',
            'opacity:0',
            'transform:translateY(-12px)',
            'transition:all 0.3s cubic-bezier(.34,1.2,.64,1)',
            'backdrop-filter:blur(12px)',
            'user-select:none'
        ].join(';');

        document.body.appendChild(el);

        requestAnimationFrame(function () {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });

        el.addEventListener('click', function () {
            var tab =
                document.querySelector('.nav-item[data-tab="friends"]') ||
                document.querySelector('.nav-sub-item[data-tab="myFriends"]');
            if (tab) tab.click();
            el.remove();
        });

        setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-12px)';
            setTimeout(function () { if (el.parentNode) el.remove(); }, 350);
        }, 5000);
    }
})();