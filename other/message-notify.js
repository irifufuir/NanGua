/* ============================================================
 *  全局消息通知模块
 *  - 每 5 秒轮询一次未读消息
 *  - 有新消息 → 播放提示音 + 显示右上角提示框
 *  - 点击提示框 → 跳到"我的好友"
 *  依赖：window.supabaseClient、window.LoginSound
 * ============================================================ */
(function () {
    'use strict';

    if (!window.supabaseClient) {
        console.warn('[消息通知] supabaseClient 未定义，跳过');
        return;
    }

    var POLL_INTERVAL = 5000;      // 5 秒轮询
    var lastSeenTs    = null;      // 上次已处理的消息时间
    var currentUserId = null;
    var pollTimer     = null;

    /* ---------- 启动 ---------- */
    window.supabaseClient.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) return;

        currentUserId = session.user.id;

        /* 页面打开时，把 lastSeenTs 设为"现在"，只处理后续新消息 */
        lastSeenTs = new Date().toISOString();

        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(checkNewMessages, POLL_INTERVAL);

        /* 立即查一次（避免刚进页面就错过） */
        checkNewMessages();

        console.log('[消息通知] 已启动，用户 =', currentUserId);
    });

    /* ---------- 轮询未读消息 ---------- */
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

                /* 更新 lastSeenTs 到最新一条 */
                lastSeenTs = data[data.length - 1].created_at;

                /* 播放提示音 */
                if (window.LoginSound && window.LoginSound.playMessageIfEnabled) {
                    window.LoginSound.playMessageIfEnabled();
                }

                /* 显示提示框 */
                showToast(data.length);

                console.log('[消息通知] 收到 ' + data.length + ' 条新消息');
            });
    }

    /* ---------- 显示右上角提示框 ---------- */
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

        /* 入场动画 */
        requestAnimationFrame(function () {
            el.style.opacity = '1';
            el.style.transform = 'translateY(0)';
        });

        /* 点击 → 跳到"我的好友" */
        el.addEventListener('click', function () {
            var tab =
                document.querySelector('.nav-item[data-tab="friends"]') ||
                document.querySelector('.nav-sub-item[data-tab="myFriends"]');
            if (tab) tab.click();
            el.remove();
        });

        /* 5 秒后自动消失 */
        setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-12px)';
            setTimeout(function () { if (el.parentNode) el.remove(); }, 350);
        }, 5000);
    }
})();