/* ============================================================
 *  全局通知模块（增强版）
 *  功能：
 *   1. 未读消息数轮询 → 侧边栏红点
 *   2. 新消息 → 播放提示音 + 右上角弹窗
 *   3. 心跳 → 每 60 秒更新自己的 last_seen
 *  依赖：window.supabaseClient、window.LoginSound
 * ============================================================ */
(function () {
    'use strict';

    if (!window.supabaseClient) {
        console.warn('[通知] supabaseClient 未定义，跳过');
        return;
    }

    var POLL_INTERVAL = 5000;   // 5 秒查一次未读
    var HEARTBEAT_INT = 60000;  // 60 秒心跳一次
    var lastSeenTs    = null;
    var currentUserId = null;
    var pollTimer     = null;
    var hbTimer       = null;

    /* ---------- 启动 ---------- */
    window.supabaseClient.auth.getSession().then(function (res) {
        var session = res.data && res.data.session;
        if (!session) return;

        currentUserId = session.user.id;
        lastSeenTs    = new Date().toISOString();

        /* 立刻心跳一次 */
        sendHeartbeat();

        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(checkUnread, POLL_INTERVAL);

        if (hbTimer) clearInterval(hbTimer);
        hbTimer = setInterval(sendHeartbeat, HEARTBEAT_INT);

        /* 立刻查一次未读 */
        checkUnread();

        console.log('[通知] 已启动，用户 =', currentUserId);
    });

    /* ---------- 心跳：更新 last_seen ---------- */
    function sendHeartbeat() {
        if (!currentUserId) return;
        window.supabaseClient
            .from('profiles')
            .update({ last_seen: new Date().toISOString() })
            .eq('id', currentUserId)
            .then(function (r) {
                if (r.error) console.warn('[通知] 心跳失败：', r.error.message);
            });
    }

    /* ---------- 轮询未读消息 ---------- */
    function checkUnread() {
        if (!currentUserId) return;

        window.supabaseClient
            .from('messages')
            .select('id, from_user, content, created_at')
            .eq('to_user', currentUserId)
            .eq('is_read', false)
            .order('created_at', { ascending: true })
            .then(function (r) {
                if (r.error) {
                    console.warn('[通知] 查询失败：', r.error.message);
                    return;
                }

                var data = r.data || [];
                updateBadge(data.length);

                /* 检测是否有新消息需要提示 */
                if (data.length > 0) {
                    var latest = data[data.length - 1].created_at;
                    if (lastSeenTs && new Date(latest) > new Date(lastSeenTs)) {
                        playAndToast(data.length);
                    }
                    lastSeenTs = latest;
                }
            });
    }

    /* ---------- 更新侧边栏红点 ---------- */
    function updateBadge(count) {
        var badges = document.querySelectorAll('.unread-badge');
        badges.forEach(function (b) {
            if (count > 0) {
                b.textContent = count > 99 ? '99+' : String(count);
                b.style.display = 'inline-flex';
            } else {
                b.style.display = 'none';
            }
        });
    }

    /* ---------- 播放音效 + 弹窗 ---------- */
    var lastToastTs = 0;
    function playAndToast(count) {
        if (window.LoginSound && window.LoginSound.playMessageIfEnabled) {
            window.LoginSound.playMessageIfEnabled();
        }

        var now = Date.now();
        if (now - lastToastTs < 2000) return;   // 2 秒内不重复弹窗
        lastToastTs = now;

        showToast(count);
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
                document.querySelector('.nav-item[data-tab="myFriends"]');
            if (tab) tab.click();
            el.remove();
        });

        setTimeout(function () {
            el.style.opacity = '0';
            el.style.transform = 'translateY(-12px)';
            setTimeout(function () { if (el.parentNode) el.remove(); }, 350);
        }, 5000);
    }

    /* ---------- 暴露手动刷新接口 ---------- */
    window.Notification = {
        refresh: checkUnread
    };
})();