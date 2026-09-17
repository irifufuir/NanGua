/* ============================================================
 *  admin-dashboard.html 主逻辑（多语言版 + 批量操作 + 成就系统）
 * ============================================================ */

/* ============================================================
 *  语言辅助
 * ============================================================ */
function t(key, fallback) {
    if (window.LangHelper && window.LangHelper.t) {
        return window.LangHelper.t(key, fallback);
    }
    return fallback != null ? fallback : key;
}
function getLang() {
    return (window.LangHelper && window.LangHelper.getLang) ? window.LangHelper.getLang() : 'zh';
}
function applyLang() {
    if (window.LangHelper && window.LangHelper.apply) {
        window.LangHelper.apply();
    }
    if (typeof refreshDynamicText === 'function') {
        try { refreshDynamicText(); } catch (e) {}
    }
}
window.__adLangChanged = applyLang;

/* ============================================================
 *  移动端导航分组
 * ============================================================ */
(function setupMobileNav() {
    function isMobile() { return window.innerWidth <= 768; }

    function build() {
        var navMenu = document.querySelector('.nav-menu');
        if (!navMenu) return;

        if (!isMobile()) {
            if (navMenu.dataset.mobileGrouped === '1') {
                var mRow = navMenu.querySelector('.nav-main-row');
                var sRow = navMenu.querySelector('.nav-sub-row');
                if (mRow) {
                    Array.prototype.slice.call(mRow.children).forEach(function (el) {
                        navMenu.appendChild(el);
                    });
                }
                if (sRow) {
                    sRow.querySelectorAll('.nav-sub').forEach(function (sub) {
                        sub.classList.remove('show');
                        navMenu.appendChild(sub);
                    });
                }
                if (mRow) mRow.remove();
                if (sRow) sRow.remove();
                navMenu.dataset.mobileGrouped = '0';
            }
            return;
        }

        if (navMenu.dataset.mobileGrouped === '1') {
            if (window.syncMobileSubRow) window.syncMobileSubRow();
            return;
        }

        var mainRow = document.createElement('div');
        mainRow.className = 'nav-main-row';
        var subRow = document.createElement('div');
        subRow.className = 'nav-sub-row';

        Array.prototype.slice.call(navMenu.children).forEach(function (el) {
            if (el.classList && el.classList.contains('nav-sub')) {
                subRow.appendChild(el);
            } else {
                mainRow.appendChild(el);
            }
        });

        navMenu.innerHTML = '';
        navMenu.appendChild(mainRow);
        navMenu.appendChild(subRow);
        navMenu.dataset.mobileGrouped = '1';

        function syncSubRow() {
            var allSubs = subRow.querySelectorAll('.nav-sub');
            if (allSubs.length === 0) return;
            var activeSub = null;
            allSubs.forEach(function (sub) {
                if (sub.classList.contains('open')) activeSub = sub;
            });
            if (!activeSub) {
                allSubs.forEach(function (sub) {
                    if (sub.querySelector('.nav-sub-item.active')) activeSub = sub;
                });
            }
            if (!activeSub) {
                subRow.classList.remove('show');
                return;
            }
            allSubs.forEach(function (sub) {
                sub.classList.toggle('show', sub === activeSub);
            });
            subRow.classList.add('show');
        }
        window.syncMobileSubRow = syncSubRow;

        mainRow.querySelectorAll('.nav-item, .nav-group').forEach(function (el) {
            el.addEventListener('click', function () {
                setTimeout(function () {
                    if (el.classList.contains('nav-group')) {
                        var key = el.getAttribute('data-group');
                        var sub = subRow.querySelector('.nav-sub[data-sub="' + key + '"]');
                        if (sub) {
                            subRow.querySelectorAll('.nav-sub').forEach(function (s) {
                                s.classList.toggle('show', s === sub);
                            });
                            subRow.classList.add('show');
                        } else {
                            subRow.classList.remove('show');
                        }
                    } else {
                        subRow.classList.remove('show');
                    }
                }, 0);
            });
        });

        subRow.querySelectorAll('.nav-sub-item').forEach(function (item) {
            item.addEventListener('click', function () {
                setTimeout(function () { subRow.classList.add('show'); }, 0);
            });
        });

        syncSubRow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else { build(); }

    var resizeTimer = null;
    var lastMode = isMobile();
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            var now = isMobile();
            if (now !== lastMode) { lastMode = now; build(); }
            else if (now && window.syncMobileSubRow) { window.syncMobileSubRow(); }
        }, 150);
    });
})();

/* ============================================================ */
var SUPABASE_URL = 'https://syxawclhvreyxltynpnj.supabase.co';
var SUPABASE_KEY = 'sb_publishable_EvEBa8dU22MpK6E7UsnWbQ_2JRdVeZQ';
var supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

var DEFAULT_AVATAR = 'image/default-avatar.png';
var allProfiles = [];
var currentAdmin = null;
var currentBanUserIds = [];  
var currentPointsUserId = null;
var currentEditShopId = null;
var selectedProfileIds = []; 
var currentEditAchId = null; 
var currentGrantAchId = null; // ★ 新增：当前要发放的成就ID

var myFriendsCache = [];
var myCurrentChatFriend = null;
var myChatPollTimer = null;
var myLastMsgTs = null;

/* ============================================================
 *  工具函数
 * ============================================================ */
function writePointLog(userId, changeAmount, reason, balanceAfter) {
    if (!userId || !changeAmount) return Promise.resolve();
    return supabaseClient.from('point_logs').insert([{
        user_id: userId,
        change_amount: changeAmount,
        reason: reason || '积分变化',
        balance_after: balanceAfter != null ? balanceAfter : 0
    }]).then(function (r) {
        if (r.error) console.warn('[积分日志] 写入失败：', r.error.message);
    });
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function formatTime(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); }
    catch (e) { return iso; }
}
function formatDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleDateString('zh-CN'); }
    catch (e) { return iso; }
}
function getRemainingTime(bannedUntil) {
    if (!bannedUntil) return null;
    var diff = new Date(bannedUntil).getTime() - Date.now();
    if (diff <= 0) return t('adminDash.banUnlockingSoon', '即将解封');
    var totalMinutes = Math.floor(diff / 60000);
    var days = Math.floor(totalMinutes / 1440);
    var hours = Math.floor((totalMinutes % 1440) / 60);
    var minutes = totalMinutes % 60;
    var parts = [];
    if (days > 0) parts.push(days + t('adminDash.pointsDaysUnit', '天'));
    if (hours > 0) parts.push(hours + t('adminDash.banModalHours', '小时'));
    if (days === 0 && minutes > 0) parts.push(minutes + t('adminDash.banModalMinutes', '分钟'));
    return parts.join(' ') || t('adminDash.banLessThanMinute', '不到 1 分钟');
}

/* ============================================================
 *  侧边栏分组展开
 * ============================================================ */
document.querySelectorAll('.nav-group').forEach(function (group) {
    group.addEventListener('click', function () {
        var key = this.getAttribute('data-group');
        var sub = document.querySelector('.nav-sub[data-sub="' + key + '"]');
        var arrow = this.querySelector('.nav-arrow');
        if (!sub) return;

        var willOpen = !sub.classList.contains('open');
        document.querySelectorAll('.nav-sub').forEach(function (el) { el.classList.remove('open'); });
        document.querySelectorAll('.nav-group .nav-arrow').forEach(function (el) { el.classList.remove('open'); });
        document.querySelectorAll('.nav-group').forEach(function (el) { el.classList.remove('open'); });

        if (willOpen) {
            sub.classList.add('open');
            arrow.classList.add('open');
            this.classList.add('open');
        }
    });
});

/* ============================================================
 *  视图切换
 * ============================================================ */
var CARDS = {
    announce:  'cardAnnounce',
    points:    'cardPoints',
    pointLogs: 'cardPointLogs',
    forgot:    'cardForgot',
    achievements: 'cardAchievements', // ★ 新增
    profiles:  'cardProfiles',
    manage:    'cardManage',
    server:    'cardServer',
    shop:      'cardShop',
    purchases: 'cardPurchases',
    theme:     'cardTheme',
    sound:     'cardSound',
    myCheckin: 'cardMyCheckin',
    myFriends: 'cardMyFriends',
    feedback:  'cardFeedback'
};

function switchTab(tab) {
    document.querySelectorAll('.nav-item, .nav-sub-item').forEach(function (el) {
        el.classList.toggle('active', el.getAttribute('data-tab') === tab);
    });
    Object.keys(CARDS).forEach(function (k) {
        var el = document.getElementById(CARDS[k]);
        if (!el) return;
        if (k === tab) {
            el.classList.remove('active');
            void el.offsetWidth;
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    });
    if (tab === 'announce')  loadAnnouncements();
    if (tab === 'points')    loadPoints();
    if (tab === 'pointLogs') loadAllPointLogs();
    if (tab === 'forgot')    loadForgotRequests();
    if (tab === 'achievements') loadAchievements(); // ★ 新增
    if (tab === 'profiles')  loadProfiles();
    if (tab === 'server')    loadServerInfo();
    if (tab === 'shop')      loadAdminShop();
    if (tab === 'purchases') loadPurchases();
    if (tab === 'feedback')  loadAllFeedbacks();
    if (tab === 'myCheckin') { myRefreshCheckinUI(); myLoadCheckinCalendar(); }
    if (tab === 'myFriends') myLoadFriends();

    if (window.syncMobileSubRow) {
        setTimeout(window.syncMobileSubRow, 0);
    }
}

document.querySelectorAll('.nav-item[data-tab]').forEach(function (el) {
    el.addEventListener('click', function () {
        switchTab(this.getAttribute('data-tab'));
    });
});
document.querySelectorAll('.nav-sub-item[data-tab]').forEach(function (el) {
    el.addEventListener('click', function () {
        switchTab(this.getAttribute('data-tab'));
    });
});

function callRPC(funcName, params) {
    return supabaseClient.rpc(funcName, params).then(function (res) {
        return res.error ? { error: res.error, data: null } : { error: null, data: res.data };
    });
}
function callEdgeFunction(action, userId, banDuration, newValue, metadata) {
    return supabaseClient.functions.invoke('dynamic-handler', {
        body: { action: action, userId: userId, banDuration: banDuration, newValue: newValue, metadata: metadata }
    });
}

/* ============================================================
 *  权限守卫
 * ============================================================ */
supabaseClient.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) { location.href = 'index.html'; return; }
    var user = session.user;
    var role = user.app_metadata && user.app_metadata.role;
    if (role !== 'admin') {
        supabaseClient.auth.signOut().then(function () { location.href = 'index.html'; });
        return;
    }
    currentAdmin = user;
    document.getElementById('adminEmail').textContent = user.email;
    if (user.user_metadata && user.user_metadata.avatar_url) {
        document.getElementById('avatarImg').src = user.user_metadata.avatar_url;
    }
    switchTab('announce');
    var firstGroup = document.querySelector('.nav-group[data-group="msg"]');
    if (firstGroup) firstGroup.click();
});
supabaseClient.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT' || !session) location.href = 'index.html';
});

/* ============================================================
 *  头像上传
 * ============================================================ */
document.getElementById('avatarChangeBtn').addEventListener('click', function () {
    document.getElementById('avatarInput').click();
});

document.getElementById('avatarInput').addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var inputEl = this;

    if (file.size > 5 * 1024 * 1024) { alert(t('adminDash.avatarTooLarge', '头像文件大小不能超过 5 MB！')); inputEl.value = ''; return; }
    if (!file.type.startsWith('image/')) { alert(t('adminDash.avatarNotImage', '请上传图片文件！')); inputEl.value = ''; return; }

    supabaseClient.auth.getUser().then(function (userRes) {
        if (userRes.error || !userRes.data.user) { alert(t('adminDash.avatarGetUserFail', '获取用户信息失败')); return; }
        var userId = userRes.data.user.id;

        var storageKey = 'last_avatar_upload_' + userId;
        var lastUpload = localStorage.getItem(storageKey);
        if (lastUpload) {
            var elapsed = Date.now() - parseInt(lastUpload, 10);
            var oneHour = 60 * 60 * 1000;
            if (elapsed < oneHour) {
                var remainingMin = Math.ceil((oneHour - elapsed) / 60000);
                alert(t('adminDash.avatarTooFrequent', '头像修改过于频繁') + '\n' +
                      t('adminDash.avatarRetryPrefix', '请 ') + remainingMin + t('adminDash.avatarRetrySuffix', ' 分钟后再试'));
                inputEl.value = '';
                return;
            }
        }

        var fileExt = file.name.split('.').pop();
        var filePath = userId + '/' + Date.now() + '.' + fileExt;

        supabaseClient.storage.from('avatars')
            .upload(filePath, file, { upsert: true })
            .then(function (uploadRes) {
                if (uploadRes.error) { alert(t('adminDash.avatarUploadFail', '头像上传失败：') + uploadRes.error.message); return; }
                return supabaseClient.storage.from('avatars').createSignedUrl(filePath, 60*60*24*365*10);
            })
            .then(function (signRes) {
                if (!signRes || signRes.error) return;
                var signedUrl = signRes.data.signedUrl;
                return supabaseClient.auth.updateUser({ data: { avatar_url: signedUrl } })
                    .then(function () {
                        return supabaseClient.from('profiles').update({ avatar_url: signedUrl }).eq('id', userId);
                    })
                    .then(function () {
                        localStorage.setItem(storageKey, Date.now().toString());
                        document.getElementById('avatarImg').src = signedUrl;
                        alert(t('adminDash.avatarUpdated', '头像更新成功！'));
                    });
            });
    });
});

document.getElementById('logoutBtn').addEventListener('click', function () {
    if (myChatPollTimer) clearInterval(myChatPollTimer);
    supabaseClient.auth.signOut().then(function () { location.href = 'index.html'; });
});

/* ============================================================
 *  公告管理
 * ============================================================ */
function loadAnnouncements() {
    var listEl = document.getElementById('announceList');
    var badge = document.getElementById('badgeAnnounce');
    listEl.innerHTML = '<div class="empty">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('announcements').select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                return;
            }
            var data = res.data || [];
            badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '条' : '');
            if (data.length === 0) { listEl.innerHTML = '<div class="empty">' + t('adminDash.announceListEmpty', '暂无公告') + '</div>'; return; }

            var html = '';
            data.forEach(function (item) {
                html += '<div class="announce-item">' +
                    '<div class="announce-head">' +
                        (item.is_pinned ? '<span class="announce-pinned">' + t('userDash.announcePinned', '📌 置顶') + '</span>' : '') +
                        '<span class="announce-title">' + escapeHtml(item.title) + '</span>' +
                        '<span class="announce-time">' + formatTime(item.created_at) + '</span>' +
                    '</div>' +
                    '<div class="announce-content">' + escapeHtml(item.content) + '</div>' +
                    '<div class="announce-actions">' +
                        '<button class="action-btn del" data-id="' + item.id + '">' + t('common.delete', '删除') + '</button>' +
                    '</div>' +
                '</div>';
            });
            listEl.innerHTML = html;

            listEl.querySelectorAll('.action-btn.del').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    if (!confirm(t('adminDash.announceDeleteConfirm', '确定删除这条公告吗？'))) return;
                    supabaseClient.from('announcements').delete().eq('id', id).then(function (r) {
                        if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
                        loadAnnouncements();
                    });
                });
            });
        });
}
document.getElementById('refreshAnnounceBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add('spinning');
    loadAnnouncements();
    setTimeout(function () { btn.disabled = false; btn.classList.remove('spinning'); }, 500);
});
document.getElementById('createAnnounceBtn').addEventListener('click', function () {
    var title = document.getElementById('announceTitle').value.trim();
    var content = document.getElementById('announceContent').value.trim();
    var pinned = document.getElementById('announcePinned').checked;
    if (!title) { alert(t('adminDash.announceTitleRequired', '请填写公告标题')); return; }
    if (!content) { alert(t('adminDash.announceContentRequired', '请填写公告内容')); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');
    supabaseClient.from('announcements').insert([{
        title: title, content: content, is_pinned: pinned
    }]).then(function (res) {
        btn.disabled = false;
        btn.textContent = t('adminDash.announceFormSubmit', '✚ 发布公告');
        if (res.error) { alert(t('common.fail', '操作失败') + '：' + res.error.message); return; }
        document.getElementById('announceTitle').value = '';
        document.getElementById('announceContent').value = '';
        document.getElementById('announcePinned').checked = false;
        loadAnnouncements();
    });
});

/* ============================================================
 *  用户反馈管理
 * ============================================================ */
function loadAllFeedbacks() {
    var listEl = document.getElementById('adminFeedbackList');
    var filter = document.getElementById('feedbackFilter').value;
    if (!listEl) return;
    listEl.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    var query = supabaseClient.from('feedbacks').select('*');
    if (filter !== 'all') query = query.eq('status', filter);

    query.then(function (res) {
        if (res.error) {
            listEl.innerHTML = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
            return;
        }
        var data = res.data || [];

        var STATUS_ORDER = { pending: 0, processing: 1, resolved: 2 };
        data.sort(function (a, b) {
            var sa = (STATUS_ORDER[a.status] != null) ? STATUS_ORDER[a.status] : 99;
            var sb = (STATUS_ORDER[b.status] != null) ? STATUS_ORDER[b.status] : 99;
            if (sa !== sb) return sa - sb;
            return new Date(b.created_at) - new Date(a.created_at);
        });

        document.getElementById('badgeFeedback').textContent = data.length + ' ' + (getLang() === 'zh' ? '条' : '');
        if (data.length === 0) {
            listEl.innerHTML = '<div class="empty-state">📭</div>';
            resetAdminFbSelection();
            return;
        }

        var statusMap = {
            pending:    t('adminDash.feedbackStatusPending', '⏳ 待处理'),
            processing: t('adminDash.feedbackStatusProcessing', '🔄 处理中'),
            resolved:   t('adminDash.feedbackStatusResolved', '✅ 已解决')
        };
        var html = '';
        data.forEach(function (item) {
            var time = new Date(item.created_at).toLocaleString('zh-CN', { hour12: false });
            var initial = (item.user_email || '匿').charAt(0).toUpperCase();
            html += '<div class="feedback-item">' +
                '<label class="fb-check" title="Select"><input type="checkbox" class="fb-item-check" data-id="' + item.id + '"></label>' +
                '<div class="fb-main">' +
                    '<div class="feedback-head">' +
                        '<span class="fb-avatar">' + escapeHtml(initial) + '</span>' +
                        '<span class="feedback-email">' + escapeHtml(item.user_email || 'Anonymous') + '</span>' +
                        '<span class="feedback-status ' + item.status + '">' + (statusMap[item.status] || item.status) + '</span>' +
                        ((item.reward_points && item.reward_points > 0)
                            ? '<span class="feedback-reward-tag">+' + item.reward_points + ' ' + (getLang() === 'zh' ? '积分' : 'pts') + '</span>'
                            : '') +
                        '<span class="feedback-time">' + time + '</span>' +
                    '</div>' +
                    '<div class="feedback-content">' + escapeHtml(item.content) + '</div>' +
                    (item.reply ? '<div class="feedback-reply">💬 <b>' + t('userDash.feedbackAdminReply', '💬 管理员回复：') + '</b>' + escapeHtml(item.reply) + '</div>' : '') +
                    '<div class="feedback-actions">' +
                        '<select class="status-select" data-id="' + item.id + '" data-old-status="' + item.status + '">' +
                            '<option value="pending"' + (item.status==='pending'?' selected':'') + '>' + t('adminDash.feedbackStatusPending', '待处理') + '</option>' +
                            '<option value="processing"' + (item.status==='processing'?' selected':'') + '>' + t('adminDash.feedbackStatusProcessing', '处理中') + '</option>' +
                            '<option value="resolved"' + (item.status==='resolved'?' selected':'') + '>' + t('adminDash.feedbackStatusResolved', '已解决') + '</option>' +
                        '</select>' +
                        '<button class="action-btn edit reply-btn" data-id="' + item.id + '">' + (item.reply ? t('adminDash.feedbackEditReplyBtn', '✏️ 修改回复') : t('adminDash.feedbackReplyBtn', '💬 回复')) + '</button>' +
                        (item.status === 'resolved'
                            ? '<button class="action-btn edit fb-edit-reward" data-id="' + item.id + '">' + t('adminDash.feedbackEditRewardBtn', '🎁 编辑奖励') + '</button>'
                            : '') +
                        '<button class="action-btn del fb-del" data-id="' + item.id + '">' + t('adminDash.feedbackDelBtn', '🗑 删除') + '</button>' +
                    '</div>' +
                    '<div class="reply-box" id="replyBox_' + item.id + '" style="display:none;margin-top:10px;">' +
                        '<textarea class="reply-input" placeholder="' + t('adminDash.feedbackReplyPlaceholder', '输入回复内容...') + '" rows="2" style="width:100%;padding:10px 12px;border-radius:10px;background:var(--theme-info-box);color:var(--theme-text);border:1px solid var(--theme-border);font-family:inherit;font-size:0.9em;resize:vertical;outline:none;">' + (item.reply || '') + '</textarea>' +
                        '<div style="margin-top:6px;display:flex;gap:8px;">' +
                            '<button class="action-btn save-reply-btn" data-id="' + item.id + '">' + t('adminDash.feedbackSaveReply', '保存回复') + '</button>' +
                            '<button class="action-btn cancel-reply-btn" data-id="' + item.id + '">' + t('adminDash.feedbackCancelReply', '取消') + '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        });
        listEl.innerHTML = html;
        resetAdminFbSelection();

        listEl.querySelectorAll('.status-select').forEach(function (sel) {
            sel.addEventListener('change', function () {
                var selectEl = this;
                var id = selectEl.getAttribute('data-id');
                var status = selectEl.value;
                var oldStatus = selectEl.getAttribute('data-old-status') || '';

                if (status === 'resolved') {
                    openFeedbackRewardDialog(id, selectEl, oldStatus, selectEl.closest('.feedback-item'));
                    return;
                }
                updateFeedbackStatus(id, status, selectEl, oldStatus);
            });
        });

        listEl.querySelectorAll('.fb-edit-reward').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                var itemEl = this.closest('.feedback-item');
                openFeedbackRewardDialog(id, null, 'resolved', itemEl);
            });
        });

        listEl.querySelectorAll('.reply-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                var box = document.getElementById('replyBox_' + id);
                box.style.display = box.style.display === 'none' ? 'block' : 'none';
            });
        });

        listEl.querySelectorAll('.save-reply-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                var reply = document.querySelector('#replyBox_' + id + ' .reply-input').value.trim();
                supabaseClient.from('feedbacks').update({ reply: reply, updated_at: new Date().toISOString() }).eq('id', id).select().then(function (r) {
                    if (r.error) { showToast(t('common.fail', '操作失败') + '：' + r.error.message, 'error'); return; }
                    if (!r.data || r.data.length === 0) { showToast(t('adminDash.replyRls', '回复未保存：请检查 RLS 策略'), 'error'); return; }
                    showToast(t('adminDash.replySaved', '回复已保存'), 'success');
                    loadAllFeedbacks();
                });
            });
        });

        listEl.querySelectorAll('.cancel-reply-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var id = this.getAttribute('data-id');
                document.getElementById('replyBox_' + id).style.display = 'none';
            });
        });
    });
}

document.getElementById('refreshFeedbackBtn').addEventListener('click', function () { loadAllFeedbacks(); });
document.getElementById('feedbackFilter').addEventListener('change', function () { loadAllFeedbacks(); });

function resetAdminFbSelection() {
    var sa = document.getElementById('fbAdminSelectAll');
    if (sa) sa.checked = false;
    updateAdminFbSelected();
}
function getAdminFbCheckedIds() {
    var ids = [];
    document.querySelectorAll('#adminFeedbackList .fb-item-check:checked').forEach(function (c) {
        ids.push(c.getAttribute('data-id'));
    });
    return ids;
}
function updateAdminFbSelected() {
    var ids = getAdminFbCheckedIds();
    var btn = document.getElementById('fbAdminDeleteSelected');
    var cnt = document.getElementById('fbAdminSelectedCount');
    var sa  = document.getElementById('fbAdminSelectAll');
    if (btn) btn.disabled = ids.length === 0;
    if (cnt) cnt.textContent = t('adminDash.feedbackSelectedCountTpl', '已选 ') + ids.length + t('adminDash.feedbackSelectedCountUnit', ' 条');
    if (sa) {
        var total = document.querySelectorAll('#adminFeedbackList .fb-item-check').length;
        sa.checked = total > 0 && ids.length === total;
    }
}
function deleteAdminFb(ids, single) {
    if (!ids.length) return;
    var msg = single
        ? t('userDash.feedbackDeleteConfirm', '确定删除这条反馈吗？删除后不可恢复。')
        : t('userDash.feedbackDeleteConfirmMulti', '确定删除选中的 ') + ids.length + t('userDash.feedbackDeleteConfirmMulti2', ' 条反馈吗？删除后不可恢复。');
    confirmFb(msg).then(function (ok) {
        if (!ok) return;
        var q = supabaseClient.from('feedbacks').delete().select();
        q = single ? q.eq('id', ids[0]) : q.in('id', ids);
        q.then(function (res) {
            if (res.error) { showToast(t('common.fail', '操作失败') + '：' + res.error.message, 'error'); return; }
            if (!res.data || res.data.length === 0) {
                showToast(t('adminDash.deleteRls', '删除未生效：请检查 RLS 策略'), 'error');
                loadAllFeedbacks();
                return;
            }
            showToast(single
                ? t('adminDash.deletedOne', '已删除')
                : (t('adminDash.deletedManyPrefix', '已删除 ') + res.data.length + t('adminDash.deletedManySuffix', ' 条')),
                'success');
            loadAllFeedbacks();
        });
    });
}
function showToast(msg, type) {
    var toast = document.getElementById('fbToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'fbToast';
        toast.className = 'fb-toast';
        document.body.appendChild(toast);
    }
    toast.className = 'fb-toast ' + (type === 'success' ? 'fb-toast-success' : type === 'error' ? 'fb-toast-error' : '');
    toast.textContent = (type === 'success' ? '✅ ' : type === 'error' ? '⚠️ ' : 'ℹ️ ') + msg;
    void toast.offsetWidth;
    toast.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { toast.classList.remove('show'); }, 2600);
}
var fbPendingResolve = null;
function confirmFb(message) {
    return new Promise(function (resolve) {
        var mask = document.getElementById('fbModalMask');
        if (!mask) {
            mask = document.createElement('div');
            mask.id = 'fbModalMask';
            mask.className = 'fb-modal-mask';
            mask.innerHTML = '<div class="fb-modal"><div class="fb-modal-title">⚠️ ' + t('common.confirm', '确定') + '</div><div class="fb-modal-msg"></div><div class="fb-modal-actions"><button class="fb-btn" data-act="cancel">' + t('common.cancel', '取消') + '</button><button class="fb-btn fb-btn-ok" data-act="ok">' + t('common.confirm', '确定') + '</button></div></div>';
            mask.addEventListener('click', function (e) {
                if (e.target === mask || (e.target.getAttribute && e.target.getAttribute('data-act') === 'cancel')) {
                    mask.classList.remove('show');
                    if (fbPendingResolve) fbPendingResolve(false);
                } else if (e.target.getAttribute && e.target.getAttribute('data-act') === 'ok') {
                    mask.classList.remove('show');
                    if (fbPendingResolve) fbPendingResolve(true);
                }
            });
            document.body.appendChild(mask);
        }
        mask.querySelector('.fb-modal-msg').textContent = message;
        fbPendingResolve = resolve;
        mask.classList.add('show');
    });
}

document.getElementById('fbAdminSelectAll').addEventListener('change', function () {
    var checked = this.checked;
    document.querySelectorAll('#adminFeedbackList .fb-item-check').forEach(function (c) { c.checked = checked; });
    updateAdminFbSelected();
});
document.getElementById('fbAdminDeleteSelected').addEventListener('click', function () {
    deleteAdminFb(getAdminFbCheckedIds(), false);
});
document.getElementById('adminFeedbackList').addEventListener('change', function (e) {
    if (e.target && e.target.classList.contains('fb-item-check')) updateAdminFbSelected();
});
document.getElementById('adminFeedbackList').addEventListener('click', function (e) {
    var del = e.target.closest ? e.target.closest('.fb-del') : null;
    if (del) deleteAdminFb([del.getAttribute('data-id')], true);
});

/* ============================================================
 *  反馈状态更新 + 积分奖励
 * ============================================================ */
function updateFeedbackStatus(id, status, selectEl, oldStatus) {
    supabaseClient.from('feedbacks').update({
        status: status,
        updated_at: new Date().toISOString()
    }).eq('id', id).select().then(function (r) {
        if (r.error) {
            showToast(t('common.fail', '操作失败') + '：' + r.error.message, 'error');
            if (selectEl) selectEl.value = oldStatus;
            return;
        }
        if (!r.data || r.data.length === 0) {
            showToast(t('adminDash.statusRls', '状态未生效：请检查 RLS 策略'), 'error');
            if (selectEl) selectEl.value = oldStatus;
            return;
        }
        if (selectEl) selectEl.setAttribute('data-old-status', status);
        showToast(t('adminDash.statusUpdated', '状态已更新'), 'success');
    });
}

var fbRewardPending = null;

function openFeedbackRewardDialog(feedbackId, selectEl, oldStatus, itemEl) {
    var modal     = document.getElementById('feedbackRewardModal');
    var hint      = document.getElementById('feedbackRewardHint');
    var inputEl   = document.getElementById('feedbackRewardPoints');
    var previewEl = document.getElementById('feedbackRewardPreview');

    var emailEl = itemEl ? itemEl.querySelector('.feedback-email') : null;
    var emailText = emailEl ? emailEl.textContent : t('adminDash.feedbackRewardHintTpl3', '该用户');

    hint.textContent = t('adminDash.feedbackRewardHintTpl', '给「') + emailText + t('adminDash.feedbackRewardHintTpl2', '」奖励积分：');
    inputEl.value = '5';

    var oldPoints = 0;

    function updatePreview() {
        var v = parseInt(inputEl.value, 10) || 0;
        if (oldPoints > 0) {
            if (v === oldPoints) {
                previewEl.textContent = t('adminDash.rewardKeepPrefix', '保持 ') + v + t('adminDash.rewardKeepSuffix', ' 积分（无变化）');
            } else if (v > oldPoints) {
                previewEl.textContent = t('adminDash.rewardIncPrefix', '从 ') + oldPoints
                    + t('adminDash.rewardIncMid', ' 增加到 ') + v
                    + t('adminDash.rewardIncSuffix', ' 积分（+') + (v - oldPoints) + '）';
            } else {
                previewEl.textContent = t('adminDash.rewardDecPrefix', '从 ') + oldPoints
                    + t('adminDash.rewardDecMid', ' 减少到 ') + v
                    + t('adminDash.rewardDecSuffix', ' 积分（-') + (oldPoints - v) + '）';
            }
        } else {
            previewEl.textContent = v > 0
                ? (t('adminDash.rewardGivePrefix', '奖励 ') + v + t('adminDash.rewardGiveSuffix', ' 积分'))
                : t('adminDash.rewardNone', '不奖励（仅标记已解决）');
        }
    }
    inputEl.oninput = updatePreview;
    updatePreview();

    supabaseClient.from('feedbacks').select('reward_points').eq('id', feedbackId).maybeSingle()
        .then(function (r) {
            oldPoints = (r.data && r.data.reward_points) || 0;
            inputEl.value = oldPoints > 0 ? String(oldPoints) : '5';
            updatePreview();
        });

    modal.style.display = 'flex';
    setTimeout(function () { inputEl.focus(); inputEl.select(); }, 50);

    fbRewardPending = {
        id: feedbackId,
        selectEl: selectEl,
        oldStatus: oldStatus
    };
}

function closeFeedbackRewardDialog() {
    document.getElementById('feedbackRewardModal').style.display = 'none';
    if (fbRewardPending && fbRewardPending.selectEl) {
        fbRewardPending.selectEl.value = fbRewardPending.oldStatus;
    }
    fbRewardPending = null;
}

document.getElementById('feedbackRewardConfirmBtn').addEventListener('click', function () {
    if (!fbRewardPending) return;
    var id = fbRewardPending.id;
    var selectEl = fbRewardPending.selectEl;
    var points = parseInt(document.getElementById('feedbackRewardPoints').value, 10) || 0;
    if (points < 0) points = 0;

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.from('feedbacks').select('user_id, user_email, reward_points').eq('id', id).maybeSingle()
    .then(function (r) {
        if (r.error || !r.data) throw new Error(t('adminDash.fbReadFail', '无法读取反馈信息'));
        var userId = r.data.user_id;
        var delta = points - (r.data.reward_points || 0);

        return supabaseClient.from('feedbacks').update({
            status: 'resolved',
            reward_points: points,
            updated_at: new Date().toISOString()
        }).eq('id', id).then(function (uRes) {
            if (uRes.error) throw new Error(t('adminDash.fbUpdateFail', '更新反馈状态失败：') + uRes.error.message);
            return { userId: userId, delta: delta };
        });
    })
    .then(function (info) {
        if (!info.userId || info.delta === 0) {
            return { newPoints: null, userId: info.userId, delta: 0 };
        }
        return supabaseClient.from('profiles')
            .select('points')
            .eq('id', info.userId)
            .maybeSingle()
            .then(function (pRes) {
                if (pRes.error || !pRes.data) throw new Error(t('adminDash.fbReadPointsFail', '无法读取用户积分'));
                var newPoints = (pRes.data.points || 0) + info.delta;
                return supabaseClient.from('profiles')
                    .update({ points: newPoints })
                    .eq('id', info.userId)
                    .then(function (upRes) {
                        if (upRes.error) throw new Error(t('adminDash.fbAddPointsFail', '加分失败：') + upRes.error.message);
                        return { newPoints: newPoints, userId: info.userId, delta: info.delta };
                    });
            });
    })
    .then(function (result) {
        btn.disabled = false;
        btn.textContent = t('adminDash.feedbackRewardConfirm', '确认并奖励');
        document.getElementById('feedbackRewardModal').style.display = 'none';

        if (selectEl) selectEl.setAttribute('data-old-status', 'resolved');
        fbRewardPending = null;

        if (result && result.newPoints != null) {
            showToast(t('adminDash.fbResolvedRewardedPrefix', '已标记为已解决，奖励 ') + points + t('adminDash.fbResolvedRewardedSuffix', ' 积分'), 'success');
            writePointLog(result.userId, result.delta, t('adminDash.fbRewardReason', '反馈奖励'), result.newPoints);
        } else {
            showToast(t('adminDash.fbResolvedOnly', '已标记为已解决'), 'success');
        }
        loadAllFeedbacks();
    })
    .catch(function (err) {
        btn.disabled = false;
        btn.textContent = t('adminDash.feedbackRewardConfirm', '确认并奖励');
        showToast((err && err.message) ? err.message : t('adminDash.fbProcessFail', '处理失败'), 'error');
    });
});

document.getElementById('feedbackRewardCancelBtn').addEventListener('click', closeFeedbackRewardDialog);
document.getElementById('feedbackRewardModal').addEventListener('click', function (e) {
    if (e.target === this) closeFeedbackRewardDialog();
});

/* ============================================================
 *  每日签到积分管理
 * ============================================================ */
function loadPointsConfig() {
    supabaseClient.from('checkin_config').select('*').eq('id', 1).maybeSingle()
        .then(function (res) {
            if (res.error || !res.data) return;
            var c = res.data;
            document.getElementById('cfgMonday').value    = c.monday    != null ? c.monday    : 1;
            document.getElementById('cfgTuesday').value   = c.tuesday   != null ? c.tuesday   : 1;
            document.getElementById('cfgWednesday').value = c.wednesday != null ? c.wednesday : 2;
            document.getElementById('cfgThursday').value  = c.thursday  != null ? c.thursday  : 2;
            document.getElementById('cfgFriday').value    = c.friday    != null ? c.friday    : 3;
            document.getElementById('cfgSaturday').value  = c.saturday  != null ? c.saturday  : 5;
            document.getElementById('cfgSunday').value    = c.sunday    != null ? c.sunday    : 5;
        });
}
document.getElementById('saveConfigBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');
    var data = {
        id: 1,
        monday:    parseInt(document.getElementById('cfgMonday').value)    || 0,
        tuesday:   parseInt(document.getElementById('cfgTuesday').value)   || 0,
        wednesday: parseInt(document.getElementById('cfgWednesday').value) || 0,
        thursday:  parseInt(document.getElementById('cfgThursday').value)  || 0,
        friday:    parseInt(document.getElementById('cfgFriday').value)    || 0,
        saturday:  parseInt(document.getElementById('cfgSaturday').value)  || 0,
        sunday:    parseInt(document.getElementById('cfgSunday').value)    || 0,
        updated_at: new Date().toISOString()
    };
    supabaseClient.from('checkin_config').upsert(data, { onConflict: 'id' })
        .then(function (res) {
            btn.disabled = false;
            btn.textContent = t('adminDash.pointsSaveConfigBtn', '💾 保存配置');
            if (res.error) { alert(t('common.fail', '操作失败') + '：' + res.error.message); return; }
            alert(t('adminDash.pointsConfigSaved', '配置已保存！'));
        });
});
function loadPoints() {
    loadPointsConfig();

    var body = document.getElementById('pointsBody');
    var badge = document.getElementById('badgePoints');
    body.innerHTML = '<tr><td colspan="6" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';

    supabaseClient.from('profiles')
        .select('id, uid, email, full_name, avatar_url, points, checkin_streak, last_checkin_date')
        .order('points', { ascending: false })
        .then(function (res) {
            if (res.error) {
                body.innerHTML = '<tr><td colspan="6" class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</td></tr>';
                return;
            }
            var data = res.data || [];
            badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '人' : '');
            if (data.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="empty">' + t('common.noData', '暂无数据') + '</td></tr>';
                return;
            }
            var html = '';
            data.forEach(function (item) {
                var avatar = item.avatar_url || DEFAULT_AVATAR;
                html += '<tr>' +
                    '<td><strong style="color:var(--theme-accent);">' + (item.uid || '—') + '</strong></td>' +
                    '<td><div class="user-cell">' +
                        '<img class="user-avatar" src="' + escapeHtml(avatar) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
                        '<div style="display:flex;flex-direction:column;">' +
                            '<span>' + escapeHtml(item.email || '—') + '</span>' +
                            '<span style="font-size:0.8em;color:var(--theme-text-faint);">' + escapeHtml(item.full_name || '—') + '</span>' +
                        '</div>' +
                    '</div></td>' +
                    '<td><strong style="color:var(--theme-accent);">' + (item.points || 0) + '</strong></td>' +
                    '<td>' + (item.checkin_streak || 0) + t('adminDash.pointsDaysUnit', ' 天') + '</td>' +
                    '<td>' + formatDate(item.last_checkin_date) + '</td>' +
                    '<td><button class="action-btn edit" data-id="' + item.id + '" data-email="' + escapeHtml(item.email || '') + '" data-points="' + (item.points || 0) + '" data-streak="' + (item.checkin_streak || 0) + '">' + t('adminDash.pointsAdjustBtn', '调整数据') + '</button></td>' +
                '</tr>';
            });
            body.innerHTML = html;
            body.querySelectorAll('.action-btn.edit').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    currentPointsUserId = this.getAttribute('data-id');
                    var email  = this.getAttribute('data-email');
                    var pts    = this.getAttribute('data-points');
                    var streak = this.getAttribute('data-streak');
                    document.getElementById('pointsTargetHint').textContent = email;
                    document.getElementById('pointsNewValue').value = pts;
                    document.getElementById('streakNewValue').value = streak;
                    document.getElementById('pointsModal').style.display = 'flex';
                });
            });
        });
}
document.getElementById('refreshPointsBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add('spinning');
    loadPoints();
    setTimeout(function () { btn.disabled = false; btn.classList.remove('spinning'); }, 500);
});
document.getElementById('pointsCancelBtn').addEventListener('click', function () {
    document.getElementById('pointsModal').style.display = 'none';
    currentPointsUserId = null;
});
document.getElementById('pointsConfirmBtn').addEventListener('click', function () {
    if (!currentPointsUserId) return;

    var pointsVal = parseInt(document.getElementById('pointsNewValue').value, 10);
    var streakVal = parseInt(document.getElementById('streakNewValue').value, 10);
    if (isNaN(pointsVal) || pointsVal < 0) { alert(t('adminDash.pointsInvalid', '请输入有效的积分值（≥0）')); return; }
    if (isNaN(streakVal) || streakVal < 0) { alert(t('adminDash.streakInvalid', '请输入有效的连续天数（≥0）')); return; }

    var targetUserId = currentPointsUserId;
    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.from('profiles').select('points').eq('id', targetUserId).maybeSingle()
        .then(function (r) {
            var oldPoints = (r.data && r.data.points) || 0;
            var delta = pointsVal - oldPoints;

            return Promise.all([
                supabaseClient.from('profiles').update({ points: pointsVal }).eq('id', targetUserId),
                supabaseClient.rpc('admin_update_streak', { target_user_id: targetUserId, new_streak: streakVal })
            ]).then(function (results) {
                return { oldPoints: oldPoints, delta: delta, results: results };
            });
        })
        .then(function (info) {
            btn.disabled = false;
            btn.textContent = t('adminDash.pointsModalSave', '保存');
            var pErr = info.results[0].error;
            var sRes = info.results[1];
            var sErr = sRes.error || (sRes.data && sRes.data.error);
            if (pErr || sErr) {
                alert(t('common.fail', '操作失败') + '：\n' + (pErr ? t('adminDash.pointsLabel', '积分：') + pErr.message + '\n' : '') + (sErr ? t('adminDash.streakLabel', '连续天数：') + (sErr.message || sErr) : ''));
                return;
            }

            if (info.delta !== 0) {
                writePointLog(
                    targetUserId,
                    info.delta,
                    t('adminDash.adminAdjustReasonPrefix', '管理员调整积分（') + info.oldPoints + ' → ' + pointsVal + '）',
                    pointsVal
                );
            }

            document.getElementById('pointsModal').style.display = 'none';
            currentPointsUserId = null;
            loadPoints();
        })
        .catch(function (err) {
            btn.disabled = false;
            btn.textContent = t('adminDash.pointsModalSave', '保存');
            alert(t('common.fail', '操作失败') + '：' + (err && err.message ? err.message : err));
        });
});

/* ============================================================
 *  积分明细（管理端，最近 100 条）
 * ============================================================ */
function loadAllPointLogs() {
    var body = document.getElementById('pointLogsBody');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="5" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';

    supabaseClient.from('point_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)
        .then(function (res) {
            if (res.error) {
                body.innerHTML = '<tr><td colspan="5" class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</td></tr>';
                return;
            }
            var data = res.data || [];
            if (data.length === 0) {
                body.innerHTML = '<tr><td colspan="5" class="empty">' + t('adminDash.pointLogsEmpty', '暂无积分记录') + '</td></tr>';
                var badge0 = document.getElementById('badgePointLogs');
                if (badge0) badge0.textContent = '0';
                return;
            }

            var badge = document.getElementById('badgePointLogs');
            if (badge) badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '条' : '');

            var userIds = [];
            data.forEach(function (log) {
                if (log.user_id && userIds.indexOf(log.user_id) === -1) {
                    userIds.push(log.user_id);
                }
            });

            supabaseClient.from('profiles')
                .select('id, uid, email, full_name')
                .in('id', userIds)
                .then(function (pRes) {
                    var map = {};
                    (pRes.data || []).forEach(function (p) { map[p.id] = p; });

                    var html = '';
                    data.forEach(function (log) {
                        var isPlus = log.change_amount > 0;
                        var sign   = isPlus ? '+' : '';
                        var color  = isPlus ? '#8cc8a0' : 'var(--danger)';
                        var user   = map[log.user_id] || {};
                        var uname  = user.full_name || user.email || '—';
                        var uidTag = user.uid ? ('[UID ' + user.uid + '] ') : '';
                        var time   = new Date(log.created_at)
                            .toLocaleString('zh-CN', { hour12: false });

                        html += '<tr>' +
                            '<td style="white-space:nowrap;">' + time + '</td>' +
                            '<td><div style="display:flex; flex-direction:column; gap:2px;">' +
                                '<span>' + escapeHtml(uidTag + uname) + '</span>' +
                                '<span style="font-size:0.78em; color:var(--theme-text-faint);">' +
                                    escapeHtml(user.email || '') +
                                '</span>' +
                            '</div></td>' +
                            '<td><strong style="color:' + color + ';">' +
                                sign + log.change_amount +
                            '</strong></td>' +
                            '<td>' + escapeHtml(log.reason || '—') + '</td>' +
                            '<td>' + (log.balance_after != null ? log.balance_after : '—') + '</td>' +
                        '</tr>';
                    });
                    body.innerHTML = html;
                })
                .catch(function () {
                    body.innerHTML = '<tr><td colspan="5" class="empty">' + t('common.loadFailed', '加载失败：') + '</td></tr>';
                });
        });
}

(function () {
    var btn = document.getElementById('refreshPointLogsBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.add('spinning');
        loadAllPointLogs();
        setTimeout(function () {
            btn.disabled = false;
            btn.classList.remove('spinning');
        }, 800);
    });
})();

/* ============================================================
 *  忘记密码申请
 * ============================================================ */
function loadForgotRequests() {
    var body = document.getElementById('forgotBody');
    var badge = document.getElementById('badgeForgot');
    body.innerHTML = '<tr><td colspan="5" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';
    supabaseClient.from('forgot_requests').select('*')
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                body.innerHTML = '<tr><td colspan="5" class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</td></tr>';
                return;
            }
            var data = res.data || [];
            badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '条' : '');
            if (data.length === 0) {
                body.innerHTML = '<tr><td colspan="5" class="empty">' + t('adminDash.forgotEmpty', '暂无申请') + '</td></tr>';
                return;
            }
            var html = '';
            data.forEach(function (item) {
                html += '<tr>' +
                    '<td>' + escapeHtml(item.email) + '</td>' +
                    '<td>' + escapeHtml(item.contact) + '</td>' +
                    '<td>' + escapeHtml(item.reason || '—') + '</td>' +
                    '<td>' + formatTime(item.created_at) + '</td>' +
                    '<td><button class="action-btn del" data-id="' + item.id + '">' + t('common.delete', '删除') + '</button></td>' +
                '</tr>';
            });
            body.innerHTML = html;
            body.querySelectorAll('.action-btn.del').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    if (!confirm(t('adminDash.forgotDeleteConfirm', '确定删除这条记录吗？'))) return;
                    supabaseClient.from('forgot_requests').delete().eq('id', id)
                        .then(function (r) {
                            if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
                            loadForgotRequests();
                        });
                });
            });
        });
}
document.getElementById('refreshForgotBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add('spinning');
    loadForgotRequests();
    setTimeout(function () { btn.disabled = false; btn.classList.remove('spinning'); }, 500);
});
/* ============================================================
 *  ★ 新增：成就系统管理（含单独发放）
 * ============================================================ */
function loadAchievements() {
    var body = document.getElementById('achievementsBody');
    var badge = document.getElementById('badgeAchievements');
    if (!body) return;

    body.innerHTML = '<tr><td colspan="6" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';

    supabaseClient.from('achievements').select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                body.innerHTML = '<tr><td colspan="6" class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</td></tr>';
                return;
            }
            var data = res.data || [];
            badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '个' : '');

            if (data.length === 0) {
                body.innerHTML = '<tr><td colspan="6" class="empty">暂无成就</td></tr>';
                return;
            }

            var typeMap = {
                'manual': '手动发放',
                'checkin_streak': '连续签到',
                'points_reached': '积分达到',
                'purchase_count': '兑换次数'
            };

            var html = '';
            data.forEach(function (item) {
                var typeText = typeMap[item.condition_type] || item.condition_type;
                var conditionText = typeText;
                if (item.condition_type !== 'manual' && item.condition_value > 0) {
                    conditionText += ' ' + item.condition_value + (item.condition_type === 'checkin_streak' ? ' 天' : '');
                }
                var statusTag = item.is_active 
                    ? '<span class="status-tag active">启用</span>' 
                    : '<span class="status-tag blocked">停用</span>';

                html += '<tr>' +
                    '<td style="font-size: 1.5em; text-align: center;">' + escapeHtml(item.icon || '🏆') + '</td>' +
                    '<td><strong>' + escapeHtml(item.name) + '</strong><br><span style="font-size:0.8em;color:var(--theme-text-faint);">' + escapeHtml(item.description || '') + '</span></td>' +
                    '<td>' + escapeHtml(conditionText) + '</td>' +
                    '<td><strong style="color:var(--theme-accent);">+' + (item.reward_points || 0) + '</strong></td>' +
                    '<td>' + statusTag + '</td>' +
                    '<td>' +
                        '<button class="action-btn edit ach-edit-btn" data-id="' + item.id + '">编辑</button>' +
                        '<button class="action-btn edit ach-grant-btn" data-id="' + item.id + '" style="background:rgba(130,225,160,.12); border-color:rgba(130,225,160,.3); color:#82e1a0; margin-left:4px;">发放</button>' +
                        '<button class="action-btn del ach-del-btn" data-id="' + item.id + '">删除</button>' +
                    '</td>' +
                '</tr>';
            });
            body.innerHTML = html;

            // 绑定编辑按钮
            body.querySelectorAll('.ach-edit-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    var item = data.find(function (x) { return String(x.id) === String(id); });
                    if (item) openEditAchievementModal(item);
                });
            });

            // 绑定发放按钮
            body.querySelectorAll('.ach-grant-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    var item = data.find(function (x) { return String(x.id) === String(id); });
                    if (item) openGrantAchievementModal(item);
                });
            });

            // 绑定删除按钮
            body.querySelectorAll('.ach-del-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    if (!confirm('⚠️ 确定要删除这个成就吗？')) return;
                    supabaseClient.from('achievements').delete().eq('id', id)
                        .then(function (r) {
                            if (r.error) { alert('删除失败：' + r.error.message); return; }
                            loadAchievements();
                        });
                });
            });
        });
}

// 刷新按钮
document.getElementById('refreshAchievementsBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add('spinning');
    loadAchievements();
    setTimeout(function () { btn.disabled = false; btn.classList.remove('spinning'); }, 500);
});

// 添加成就
document.getElementById('addAchievementBtn').addEventListener('click', function () {
    var name = document.getElementById('achName').value.trim();
    if (!name) { alert('请填写成就名称'); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = '保存中...';

    var newAch = {
        name: name,
        description: document.getElementById('achDesc').value.trim(),
        icon: document.getElementById('achIcon').value.trim() || '🏆',
        condition_type: document.getElementById('achType').value,
        condition_value: parseInt(document.getElementById('achValue').value, 10) || 0,
        reward_points: parseInt(document.getElementById('achReward').value, 10) || 0,
        sort_order: parseInt(document.getElementById('achSort').value, 10) || 0,
        is_active: true
    };

    supabaseClient.from('achievements').insert([newAch]).then(function (res) {
        btn.disabled = false;
        btn.textContent = '➕ 保存成就';
        if (res.error) { alert('添加失败：' + res.error.message); return; }

        // 清空表单
        document.getElementById('achName').value = '';
        document.getElementById('achDesc').value = '';
        document.getElementById('achIcon').value = '🏆';
        document.getElementById('achType').value = 'manual';
        document.getElementById('achValue').value = '0';
        document.getElementById('achReward').value = '0';
        document.getElementById('achSort').value = '0';

        loadAchievements();
        alert('添加成功！');
    });
});

// 打开编辑弹窗
function openEditAchievementModal(item) {
    currentEditAchId = item.id;
    document.getElementById('editAchName').value = item.name || '';
    document.getElementById('editAchIcon').value = item.icon || '🏆';
    document.getElementById('editAchType').value = item.condition_type || 'manual';
    document.getElementById('editAchValue').value = item.condition_value || 0;
    document.getElementById('editAchReward').value = item.reward_points || 0;
    document.getElementById('editAchSort').value = item.sort_order || 0;
    document.getElementById('editAchDesc').value = item.description || '';
    document.getElementById('editAchActive').value = item.is_active ? 'true' : 'false';

    document.getElementById('editAchievementModal').style.display = 'flex';
}

// 关闭编辑弹窗
function closeEditAchievementModal() {
    document.getElementById('editAchievementModal').style.display = 'none';
    currentEditAchId = null;
}

document.getElementById('editAchCancelBtn').addEventListener('click', closeEditAchievementModal);
document.getElementById('editAchievementModal').addEventListener('click', function(e) {
    if (e.target === this) closeEditAchievementModal();
});

// 保存编辑
document.getElementById('editAchSaveBtn').addEventListener('click', function () {
    if (!currentEditAchId) return;
    var name = document.getElementById('editAchName').value.trim();
    if (!name) { alert('请填写成就名称'); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = '保存中...';

    var updatedAch = {
        name: name,
        description: document.getElementById('editAchDesc').value.trim(),
        icon: document.getElementById('editAchIcon').value.trim() || '🏆',
        condition_type: document.getElementById('editAchType').value,
        condition_value: parseInt(document.getElementById('editAchValue').value, 10) || 0,
        reward_points: parseInt(document.getElementById('editAchReward').value, 10) || 0,
        sort_order: parseInt(document.getElementById('editAchSort').value, 10) || 0,
        is_active: document.getElementById('editAchActive').value === 'true'
    };

    supabaseClient.from('achievements').update(updatedAch).eq('id', currentEditAchId).then(function (res) {
        btn.disabled = false;
        btn.textContent = '保存修改';
        if (res.error) { alert('修改失败：' + res.error.message); return; }

        closeEditAchievementModal();
        loadAchievements();
        alert('修改成功！');
    });
});

/* ============================================================
 *  单独发放成就给指定用户（★ 新增）
 * ============================================================ */
function openGrantAchievementModal(achItem) {
    currentGrantAchId = achItem.id;
    document.getElementById('grantAchNameHint').innerHTML = '成就：<strong>' + escapeHtml(achItem.name) + '</strong>（+' + (achItem.reward_points || 0) + ' 积分）';
    
    var selectEl = document.getElementById('grantUserSelect');
    selectEl.innerHTML = '<option value="">加载用户中...</option>';
    document.getElementById('grantAchievementModal').style.display = 'flex';

    // 如果之前已经加载过用户列表（allProfiles），直接用，否则重新查
    if (allProfiles && allProfiles.length > 0) {
        renderGrantUserOptions(allProfiles);
    } else {
        supabaseClient.from('profiles').select('id, uid, email, full_name').order('created_at', { ascending: false })
            .then(function (res) {
                if (res.error) {
                    selectEl.innerHTML = '<option value="">加载失败</option>';
                    return;
                }
                allProfiles = res.data || [];
                renderGrantUserOptions(allProfiles);
            });
    }
}

function renderGrantUserOptions(users) {
    var selectEl = document.getElementById('grantUserSelect');
    var html = '<option value="">-- 请选择用户 --</option>';
    users.forEach(function (u) {
        var uidTag = u.uid ? ('[UID ' + u.uid + '] ') : '';
        html += '<option value="' + u.id + '">' +
            escapeHtml(uidTag + (u.email || '—') + '（' + (u.full_name || '—') + '）') +
            '</option>';
    });
    selectEl.innerHTML = html;
}

function closeGrantAchievementModal() {
    document.getElementById('grantAchievementModal').style.display = 'none';
    currentGrantAchId = null;
}

document.getElementById('grantAchCancelBtn').addEventListener('click', closeGrantAchievementModal);
document.getElementById('grantAchievementModal').addEventListener('click', function(e) {
    if (e.target === this) closeGrantAchievementModal();
});

document.getElementById('grantAchConfirmBtn').addEventListener('click', function () {
    if (!currentGrantAchId) return;
    var targetUserId = document.getElementById('grantUserSelect').value;
    if (!targetUserId) { alert('请选择要发放的用户'); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = '发放中...';

    // 1. 先获取成就的详细信息（积分等）
    supabaseClient.from('achievements').select('*').eq('id', currentGrantAchId).maybeSingle()
    .then(function(achRes) {
        if (achRes.error || !achRes.data) throw new Error('获取成就信息失败');
        var ach = achRes.data;

        // 2. 检查该用户是否已经拥有这个成就
        return supabaseClient.from('user_achievements')
            .select('id')
            .eq('user_id', targetUserId)
            .eq('achievement_id', ach.id)
            .maybeSingle()
            .then(function(uaRes) {
                if (uaRes.data) {
                    throw new Error('该用户已经拥有此成就，无需重复发放');
                }

                // 3. 插入用户成就记录
                return supabaseClient.from('user_achievements').insert([{
                    user_id: targetUserId,
                    achievement_id: ach.id
                }]).then(function(insertRes) {
                    if (insertRes.error) throw new Error('发放成就失败：' + insertRes.error.message);
                    return ach;
                });
            });
    })
    .then(function(ach) {
        // 4. 如果成就有奖励积分，给用户加分并写明细
        if (ach.reward_points > 0) {
            return supabaseClient.from('profiles').select('points').eq('id', targetUserId).maybeSingle()
                .then(function(pRes) {
                    var currentPoints = (pRes.data && pRes.data.points) || 0;
                    var newPoints = currentPoints + ach.reward_points;

                    return supabaseClient.from('profiles').update({ points: newPoints }).eq('id', targetUserId)
                        .then(function() {
                            // 写入积分日志
                            return writePointLog(
                                targetUserId, 
                                ach.reward_points, 
                                '管理员发放成就：' + ach.name, 
                                newPoints
                            );
                        });
                });
        }
        return Promise.resolve();
    })
    .then(function() {
        btn.disabled = false;
        btn.textContent = '确认发放';
        closeGrantAchievementModal();
        alert('🎉 成就发放成功！用户刷新页面即可看到。');
    })
    .catch(function(err) {
        btn.disabled = false;
        btn.textContent = '确认发放';
        alert((err && err.message) ? err.message : '发放失败');
    });
});

/* ============================================================
 *  注册用户列表（包含多选批量操作）
 * ============================================================ */
function loadProfiles() {
    var body = document.getElementById('profilesBody');
    var badge = document.getElementById('badgeProfiles');
    body.innerHTML = '<tr><td colspan="8" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';
    
    selectedProfileIds = [];
    updateProfilesSelection();

    supabaseClient.from('profiles').select('*')
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                body.innerHTML = '<tr><td colspan="8" class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</td></tr>';
                return;
            }
            var data = res.data || [];
            allProfiles = data;
            badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '人' : '');
            updateManageSelect();
            if (data.length === 0) {
                body.innerHTML = '<tr><td colspan="8" class="empty">' + t('adminDash.profilesEmpty', '暂无用户') + '</td></tr>';
                return;
            }
            var html = '';
            data.forEach(function (item) {
                var isBlocked = item.is_blocked === true;
                var avatar = item.avatar_url || DEFAULT_AVATAR;
                var statusHtml = isBlocked
                    ? '<span class="status-tag blocked">' + t('adminDash.profilesStatusBlocked', '已拉黑') + '</span>'
                    : '<span class="status-tag active">' + t('adminDash.profilesStatusNormal', '正常') + '</span>';
                var blockBtn = isBlocked
                    ? '<button class="action-btn unblock" data-id="' + item.id + '">' + t('adminDash.profilesUnblockBtn', '解除拉黑') + '</button>'
                    : '<button class="action-btn block" data-id="' + item.id + '">' + t('adminDash.profilesBlockBtn', '拉黑') + '</button>';
                var remain = '';
                if (isBlocked) {
                    var rt = getRemainingTime(item.banned_until);
                    if (rt) remain = '<span class="remaining-tag">' + t('adminDash.profilesRemainPrefix', '剩余：') + escapeHtml(rt) + '</span>';
                }
                html += '<tr>' +
                    '<td style="text-align: center;"><input type="checkbox" class="profile-checkbox" data-id="' + item.id + '"></td>' +
                    '<td><strong style="color:var(--theme-accent);">' + (item.uid || '—') + '</strong></td>' +
                    '<td><div class="user-cell">' +
                        '<img class="user-avatar" src="' + escapeHtml(avatar) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
                        '<span>' + escapeHtml(item.email) + '</span>' +
                    '</div></td>' +
                    '<td>' + escapeHtml(item.full_name || '—') + '</td>' +
                    '<td>' + escapeHtml(item.phone || '—') + '</td>' +
                    '<td>' + statusHtml + '</td>' +
                    '<td>' + formatTime(item.created_at) + '</td>' +
                    '<td>' +
                        '<button class="action-btn del" data-id="' + item.id + '">' + t('common.delete', '删除') + '</button>' +
                        blockBtn + remain +
                    '</td>' +
                '</tr>';
            });
            body.innerHTML = html;
            
            bindProfileActions();
            bindProfilesSelectionEvents();
        });
}
document.getElementById('refreshProfilesBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add('spinning');
    loadProfiles();
    setTimeout(function () { btn.disabled = false; btn.classList.remove('spinning'); }, 500);
});

/* ============================================================
 *  批量选择与操作逻辑
 * ============================================================ */
function bindProfilesSelectionEvents() {
    var selectAll = document.getElementById('profilesSelectAll');
    var checkboxes = document.querySelectorAll('.profile-checkbox');

    if (selectAll) {
        selectAll.onclick = function () {
            var checked = this.checked;
            checkboxes.forEach(function (cb) { cb.checked = checked; });
            updateProfilesSelection();
        };
    }

    checkboxes.forEach(function (cb) {
        cb.onchange = function () {
            updateProfilesSelection();
        };
    });

    updateProfilesSelection();
}

function updateProfilesSelection() {
    selectedProfileIds = [];
    document.querySelectorAll('.profile-checkbox:checked').forEach(function (cb) {
        selectedProfileIds.push(cb.getAttribute('data-id'));
    });

    var countEl = document.getElementById('profilesSelectedCount');
    var delBtn = document.getElementById('profilesBatchDeleteBtn');
    var blockBtn = document.getElementById('profilesBatchBlockBtn');
    var selectAll = document.getElementById('profilesSelectAll');
    var total = document.querySelectorAll('.profile-checkbox').length;

    if (countEl) countEl.textContent = '已选 ' + selectedProfileIds.length + ' 人';
    if (delBtn) delBtn.disabled = selectedProfileIds.length === 0;
    if (blockBtn) blockBtn.disabled = selectedProfileIds.length === 0;
    
    if (selectAll) {
        selectAll.checked = total > 0 && selectedProfileIds.length === total;
    }
}

// 批量删除
document.getElementById('profilesBatchDeleteBtn').addEventListener('click', function () {
    if (selectedProfileIds.length === 0) return;
    if (!confirm('⚠️ 确定要彻底删除选中的 ' + selectedProfileIds.length + ' 个用户吗？此操作不可恢复！')) return;

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    var promises = selectedProfileIds.map(function (id) {
        return callEdgeFunction('delete', id);
    });

    Promise.all(promises).then(function (results) {
        btn.disabled = false;
        btn.innerHTML = '🗑 批量删除';
        
        var failed = results.filter(function (r) { return r.error || (r.data && r.data.error); });
        if (failed.length > 0) {
            alert('操作完成，但有 ' + failed.length + ' 个用户删除失败。');
        } else {
            alert('成功删除 ' + selectedProfileIds.length + ' 个用户。');
        }
        loadProfiles();
    }).catch(function (err) {
        btn.disabled = false;
        btn.innerHTML = '🗑 批量删除';
        alert('批量删除发生错误：' + (err.message || err));
        loadProfiles();
    });
});

// 批量拉黑（打开弹窗）
document.getElementById('profilesBatchBlockBtn').addEventListener('click', function () {
    if (selectedProfileIds.length === 0) return;
    currentBanUserIds = selectedProfileIds.slice();
    document.getElementById('banDays').value = '0';
    document.getElementById('banHours').value = '0';
    document.getElementById('banMinutes').value = '0';
    updateBanPreview();
    document.getElementById('banDurationModal').style.display = 'flex';
});

/* ============================================================
 *  用户列表单行操作绑定
 * ============================================================ */
function bindProfileActions() {
    var body = document.getElementById('profilesBody');
    if (!body) return;
    body.querySelectorAll('.action-btn.del[data-id]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = this.getAttribute('data-id');
            if (!confirm(t('adminDash.profilesDeleteConfirm', '⚠️ 确定要彻底删除该用户吗？此操作不可恢复！'))) return;
            callEdgeFunction('delete', id).then(function (res) {
                if (res.error || (res.data && res.data.error)) {
                    alert(t('common.fail', '操作失败') + '：' + (res.error ? res.error.message : res.data.error));
                    return;
                }
                loadProfiles();
            });
        });
    });
    body.querySelectorAll('.action-btn.block').forEach(function (btn) {
        btn.addEventListener('click', function () {
            currentBanUserIds = [this.getAttribute('data-id')];
            document.getElementById('banDays').value = '0';
            document.getElementById('banHours').value = '0';
            document.getElementById('banMinutes').value = '0';
            updateBanPreview();
            document.getElementById('banDurationModal').style.display = 'flex';
        });
    });
    body.querySelectorAll('.action-btn.unblock').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var id = this.getAttribute('data-id');
            if (!confirm(t('adminDash.profilesBlockConfirm', '确定要解除拉黑吗？'))) return;
            callRPC('admin_unban_user', { target_user_id: id }).then(function (res) {
                if (res.error || (res.data && res.data.error)) {
                    alert(t('common.fail', '操作失败') + '：' + (res.error ? res.error.message : res.data.error));
                    return;
                }
                loadProfiles();
            });
        });
    });
}
function updateBanPreview() {
    var d = parseInt(document.getElementById('banDays').value) || 0;
    var h = parseInt(document.getElementById('banHours').value) || 0;
    var m = parseInt(document.getElementById('banMinutes').value) || 0;
    if (d === 0 && h === 0 && m === 0) {
        document.getElementById('banPreview').textContent = t('adminDash.banModalPermanent', '永久封禁');
        return;
    }
    var parts = [];
    if (d > 0) parts.push(d + ' ' + t('adminDash.banModalDays', '天'));
    if (h > 0) parts.push(h + ' ' + t('adminDash.banModalHours', '小时'));
    if (m > 0) parts.push(m + ' ' + t('adminDash.banModalMinutes', '分钟'));
    document.getElementById('banPreview').textContent = t('adminDash.banModalTotal', '总封禁时长：') + parts.join(' ');
}

document.getElementById('banDays').addEventListener('input', updateBanPreview);
document.getElementById('banHours').addEventListener('input', updateBanPreview);
document.getElementById('banMinutes').addEventListener('input', updateBanPreview);

document.getElementById('banCancelBtn').addEventListener('click', function () {
    document.getElementById('banDurationModal').style.display = 'none';
    currentBanUserIds = [];
});
document.getElementById('banDurationModal').addEventListener('click', function (e) {
    if (e.target === this) {
        this.style.display = 'none';
        currentBanUserIds = [];
    }
});
document.getElementById('banConfirmBtn').addEventListener('click', function () {
    if (!currentBanUserIds || currentBanUserIds.length === 0) return;
    var d = parseInt(document.getElementById('banDays').value)    || 0;
    var h = parseInt(document.getElementById('banHours').value)   || 0;
    var m = parseInt(document.getElementById('banMinutes').value) || 0;

    var totalSeconds = 0;
    if (d !== 0 || h !== 0 || m !== 0) {
        totalSeconds = d * 86400 + h * 3600 + m * 60;
    }

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    var promises = currentBanUserIds.map(function (userId) {
        return callRPC('admin_ban_user', {
            target_user_id: userId,
            ban_seconds: totalSeconds
        });
    });

    Promise.all(promises).then(function (results) {
        btn.disabled = false;
        btn.textContent = t('adminDash.banModalConfirm', '确定封禁');
        
        var failed = results.filter(function (res) {
            return res.error || (res.data && res.data.error);
        });

        if (failed.length > 0) {
            alert('操作完成，但有 ' + failed.length + ' 个用户封禁失败。');
        }
        
        document.getElementById('banDurationModal').style.display = 'none';
        currentBanUserIds = [];
        loadProfiles();
    }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = t('adminDash.banModalConfirm', '确定封禁');
        alert(t('common.fail', '操作失败') + '：' + (err.message || err));
    });
});

/* ============================================================
 *  用户管理
 * ============================================================ */
function updateManageSelect() {
    var sel = document.getElementById('manageUserSelect');
    var cur = sel.value;
    var html = '<option value="">' + t('adminDash.manageSelectPlaceholder', '-- 请选择用户 --') + '</option>';
    allProfiles.forEach(function (p) {
        var uidTag = p.uid ? ('[UID ' + p.uid + '] ') : '';
        html += '<option value="' + p.id + '">' + escapeHtml(uidTag + (p.email || '—') + ' （' + (p.full_name || '—') + '）') + '</option>';
    });
    sel.innerHTML = html;
    if (cur) sel.value = cur;
}
document.getElementById('manageUserSelect').addEventListener('change', function () {
    var id = this.value;
    if (!id) { clearManageForm(); updatePreview(null); return; }
    var user = allProfiles.find(function (p) { return p.id === id; });
    if (!user) { clearManageForm(); updatePreview(null); return; }
    document.getElementById('manageUid').value = user.uid != null ? String(user.uid) : '';
    document.getElementById('manageName').value = user.full_name || '';
    document.getElementById('managePhone').value = user.phone || '';
    document.getElementById('manageEmail').value = user.email || '';
    document.getElementById('managePassword').value = '';
    updatePreview(user);
});

function updatePreview(user) {
    var av = document.getElementById('previewAvatar');
    var nm = document.getElementById('previewName');
    var em = document.getElementById('previewEmail');
    var st = document.getElementById('previewStatus');
    if (!user) {
        av.src = DEFAULT_AVATAR;
        nm.textContent = t('adminDash.manageNoUser', '未选择用户');
        em.textContent = t('adminDash.manageSelectHint', '请从右侧下拉框选择');
        st.style.display = 'none';
        return;
    }
    av.src = user.avatar_url || DEFAULT_AVATAR;
    nm.textContent = user.full_name || t('userDash.homeNotSet', '未设置');
    em.textContent = user.email || '—';
    st.style.display = 'inline-block';
    if (user.is_blocked === true) {
        st.className = 'preview-status blocked';
        st.textContent = t('adminDash.profilesStatusBlocked', '已拉黑');
    } else {
        st.className = 'preview-status active';
        st.textContent = t('adminDash.profilesStatusNormal', '正常');
    }
}

function clearManageForm() {
    document.getElementById('manageUid').value = '';
    document.getElementById('manageName').value = '';
    document.getElementById('managePhone').value = '';
    document.getElementById('manageEmail').value = '';
    document.getElementById('managePassword').value = '';
}

document.getElementById('resetManageBtn').addEventListener('click', function () {
    document.getElementById('manageUserSelect').value = '';
    clearManageForm();
    updatePreview(null);
});

document.getElementById('saveManageBtn').addEventListener('click', function () {
    var userId = document.getElementById('manageUserSelect').value;
    if (!userId) { alert(t('adminDash.manageSelectUser', '请先选择用户')); return; }
    var user = allProfiles.find(function (p) { return p.id === userId; });
    if (!user) { alert(t('adminDash.manageUserNotFound', '找不到该用户信息')); return; }

    var newUid   = document.getElementById('manageUid').value.trim();
    var newName  = document.getElementById('manageName').value.trim();
    var newPhone = document.getElementById('managePhone').value.trim();
    var newEmail = document.getElementById('manageEmail').value.trim();
    var newPwd   = document.getElementById('managePassword').value;

    var tasks = [];
    var messages = [];

    var oldUid = user.uid != null ? String(user.uid) : '';
    if (newUid !== oldUid) {
        if (newUid === '') { alert(t('adminDash.manageUidEmpty', 'UID 不能为空')); return; }
        if (!/^\d{5,9}$/.test(newUid)) { alert(t('adminDash.manageUidInvalid', 'UID 必须是 5 到 9 位的纯数字！')); return; }
        tasks.push(
            supabaseClient.from('profiles').update({ uid: parseInt(newUid, 10) }).eq('id', userId)
                .then(function (r) {
                    if (r.error) {
                        if (r.error.code === '23505') {
                            return { ok: false, field: 'UID', err: { message: t('adminDash.manageUidTaken', '该 UID 已被其他用户占用，请更换') } };
                        }
                        return { ok: false, field: 'UID', err: r.error };
                    }
                    return { ok: true, field: 'UID' };
                })
        );
        messages.push('UID');
    }

    var nameChanged  = newName  !== (user.full_name || '');
    var phoneChanged = newPhone !== (user.phone || '');

    if (nameChanged || phoneChanged) {
        var fields = [];
        if (nameChanged)  fields.push(t('adminDash.manageFieldName', '昵称'));
        if (phoneChanged) fields.push(t('adminDash.manageFieldPhone', '手机号'));
        tasks.push(
            callRPC('admin_update_profile', {
                target_user_id: userId,
                new_full_name: newName || null,
                new_phone: newPhone || null
            }).then(function (r) {
                if (r.error || (r.data && r.data.error)) return { ok: false, field: fields.join('+'), err: r.error };
                return { ok: true, field: fields.join('+') };
            })
        );
        messages.push(fields.join('、'));
    }

    if (newEmail && newEmail !== (user.email || '')) {
        tasks.push(callEdgeFunction('update_email', userId, null, newEmail).then(function (r) {
            if (r.error || (r.data && r.data.error)) return { ok: false, field: t('adminDash.manageFieldEmail', '邮箱'), err: r.error };
            return { ok: true, field: t('adminDash.manageFieldEmail', '邮箱') };
        }));
        messages.push(t('adminDash.manageFieldEmail', '邮箱'));
    }

    if (newPwd) {
        if (newPwd.length < 6) { alert(t('adminDash.managePwdTooShort', '密码至少 6 位')); return; }
        tasks.push(callEdgeFunction('update_password', userId, null, newPwd).then(function (r) {
            if (r.error || (r.data && r.data.error)) return { ok: false, field: t('adminDash.manageFieldPwd', '密码'), err: r.error };
            return { ok: true, field: t('adminDash.manageFieldPwd', '密码') };
        }));
        messages.push(t('adminDash.manageFieldPwd', '密码'));
    }

    if (tasks.length === 0) { alert(t('adminDash.manageNoChange', '没有任何修改')); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    Promise.all(tasks).then(function (results) {
        btn.disabled = false;
        btn.textContent = t('adminDash.manageSave', '💾 保存修改');
        var failures = results.filter(function (r) { return !r.ok; });
        if (failures.length > 0) {
            alert(t('common.fail', '操作失败') + '：\n\n' + failures.map(function (f) {
                return f.field + '：' + (f.err && f.err.message ? f.err.message : t('common.fail', '失败'));
            }).join('\n'));
        } else {
            alert(t('common.success', '操作成功') + '：\n\n' + messages.join('、'));
        }
        loadProfiles();
    });
});

/* ============================================================
 *  积分商城管理
 * ============================================================ */
function bindLimitToggle(toggleId, inputId) {
    var toggleBtn = document.getElementById(toggleId);
    var inputEl = document.getElementById(inputId);
    if (!toggleBtn || !inputEl) return;

    function sync() {
        var on = toggleBtn.dataset.on === 'true';
        inputEl.disabled = !on;
        toggleBtn.textContent = on
            ? t('adminDash.shopLimitOn', '开启限购')
            : t('adminDash.shopLimitOff', '关闭（无限）');
    }
    toggleBtn.addEventListener('click', function () {
        toggleBtn.dataset.on = (toggleBtn.dataset.on === 'true') ? 'false' : 'true';
        sync();
    });
    sync();
}
bindLimitToggle('addLimitToggle',  'addShopLimit');
bindLimitToggle('editLimitToggle', 'editShopLimit');

function readLimit(toggleId, inputId) {
    var toggleBtn = document.getElementById(toggleId);
    if (!toggleBtn || toggleBtn.dataset.on !== 'true') return null;
    var v = parseInt(document.getElementById(inputId).value, 10) || 1;
    if (v < 1) v = 1;
    return v;
}

function loadAdminShop() {
    var grid = document.getElementById('adminShopGrid');
    var badge = document.getElementById('badgeShop');
    if (!grid) return;

    grid.innerHTML = '<div class="empty">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('shop_items').select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                grid.innerHTML = '<div class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                return;
            }
            var items = res.data || [];
            badge.textContent = items.length + ' ' + (getLang() === 'zh' ? '件' : '');
            if (items.length === 0) {
                grid.innerHTML = '<div class="empty">' + t('common.noData', '暂无数据') + '</div>';
                return;
            }

            var html = '';
            items.forEach(function (it) {
                var stockText = (it.stock === 0) ? t('adminDash.shopStockNone', '已售罄') : (t('adminDash.shopStockPrefix', '库存: ') + (it.stock || 0));
                var activeTag = it.is_active === false ? ' (—)' : '';
                var limitTag = '';
                if (it.per_user_limit != null && it.per_user_limit > 0) {
                    limitTag = '<div class="shop-item-limit">' + t('userDash.shopLimitPerUser', '每人限购 ') + it.per_user_limit + t('userDash.shopLimitUnit', ' 份') + '</div>';
                }

                html +=
                    '<div class="shop-item">' +
                        '<div class="shop-item-icon">' + escapeHtml(it.icon || '🎁') + '</div>' +
                        '<div class="shop-item-name">' + escapeHtml(it.name) + activeTag + '</div>' +
                        '<div class="shop-item-price">' + (it.price || 0) + t('userDash.shopPointsUnit', ' 积分') + '</div>' +
                        '<div class="shop-item-stock">' + stockText + '</div>' +
                        limitTag +
                        '<div class="shop-item-actions">' +
                            '<button class="btn-edit" data-id="' + it.id + '">' + t('adminDash.shopEditBtn', '编辑') + '</button>' +
                            '<button class="btn-del" data-id="' + it.id + '">' + t('adminDash.shopDelBtn', '删除') + '</button>' +
                        '</div>' +
                    '</div>';
            });
            grid.innerHTML = html;

            grid.querySelectorAll('.btn-del').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    if (!confirm(t('adminDash.shopDelConfirm', '确定删除该商品吗？此操作不可恢复。'))) return;
                    supabaseClient.from('shop_items').delete().eq('id', id)
                        .then(function (r) {
                            if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
                            loadAdminShop();
                        });
                });
            });

            grid.querySelectorAll('.btn-edit').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    var it = items.find(function (x) { return String(x.id) === String(id); });
                    if (!it) return;

                    currentEditShopId = id;

                    document.getElementById('editShopName').value   = it.name || '';
                    document.getElementById('editShopPrice').value  = it.price || 0;
                    document.getElementById('editShopStock').value  = it.stock || 0;
                    document.getElementById('editShopDesc').value   = it.description || '';
                    document.getElementById('editShopDetail').value = it.detail || '';
                    document.getElementById('editShopImage').value  = it.image_url || '';
                    document.getElementById('editShopIcon').value   = it.icon || '🎁';

                    var editToggle = document.getElementById('editLimitToggle');
                    var editLimitInput = document.getElementById('editShopLimit');
                    if (it.per_user_limit != null && it.per_user_limit > 0) {
                        editToggle.dataset.on = 'true';
                        editLimitInput.value = it.per_user_limit;
                        editLimitInput.disabled = false;
                        editToggle.textContent = t('adminDash.shopLimitOn', '开启限购');
                    } else {
                        editToggle.dataset.on = 'false';
                        editLimitInput.value = 1;
                        editLimitInput.disabled = true;
                        editToggle.textContent = t('adminDash.shopLimitOff', '关闭（无限）');
                    }

                    document.getElementById('editShopModal').style.display = 'flex';
                });
            });
        });
}

document.getElementById('refreshShopBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add('spinning');
    loadAdminShop();
    setTimeout(function () { btn.disabled = false; btn.classList.remove('spinning'); }, 500);
});

document.getElementById('addShopBtn').addEventListener('click', function () {
    var name   = document.getElementById('addShopName').value.trim();
    var price  = parseInt(document.getElementById('addShopPrice').value, 10) || 0;
    var stock  = parseInt(document.getElementById('addShopStock').value, 10) || 0;
    var desc   = document.getElementById('addShopDesc').value.trim();
    var detail = document.getElementById('addShopDetail').value.trim();
    var image  = document.getElementById('addShopImage').value.trim();
    var icon   = document.getElementById('addShopIcon').value.trim() || '🎁';
    var limitVal = readLimit('addLimitToggle', 'addShopLimit');

    if (!name) { alert(t('adminDash.shopNameRequired', '请填写商品名称')); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.from('shop_items').insert([{
        name: name,
        description: desc,
        detail: detail,
        price: price,
        stock: stock,
        icon: icon,
        image_url: image,
        per_user_limit: limitVal,
        is_active: true,
        sort_order: 0
    }]).then(function (res) {
        btn.disabled = false;
        btn.textContent = t('adminDash.shopAddBtn', '➕ 上架商品');
        if (res.error) {
            alert(t('adminDash.shopAddFail', '上架失败：') + res.error.message);
            return;
        }
        alert(t('adminDash.shopAddSuccess', '上架成功！'));
        ['addShopName','addShopPrice','addShopDesc','addShopDetail','addShopImage'].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('addShopStock').value = '10';
        document.getElementById('addShopIcon').value  = '🎁';
        var addToggle = document.getElementById('addLimitToggle');
        var addLimitInput = document.getElementById('addShopLimit');
        addToggle.dataset.on = 'false';
        addToggle.textContent = t('adminDash.shopLimitOff', '关闭（无限）');
        addLimitInput.value = 1;
        addLimitInput.disabled = true;

        loadAdminShop();
    });
});

document.getElementById('editShopSaveBtn').addEventListener('click', function () {
    var id = currentEditShopId;
    if (!id) return;

    var name   = document.getElementById('editShopName').value.trim();
    var price  = parseInt(document.getElementById('editShopPrice').value, 10) || 0;
    var stock  = parseInt(document.getElementById('editShopStock').value, 10) || 0;
    var desc   = document.getElementById('editShopDesc').value.trim();
    var detail = document.getElementById('editShopDetail').value.trim();
    var image  = document.getElementById('editShopImage').value.trim();
    var icon   = document.getElementById('editShopIcon').value.trim() || '🎁';
    var limitVal = readLimit('editLimitToggle', 'editShopLimit');

    if (!name) { alert(t('adminDash.shopNameRequired', '商品名称不能为空')); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.from('shop_items').update({
        name: name,
        price: price,
        stock: stock,
        description: desc,
        detail: detail,
        image_url: image,
        icon: icon,
        per_user_limit: limitVal
    }).eq('id', id).then(function (r) {
        btn.disabled = false;
        btn.textContent = t('adminDash.editShopSaveBtn', '保存修改');
        if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
        document.getElementById('editShopModal').style.display = 'none';
        currentEditShopId = null;
        loadAdminShop();
    });
});

document.getElementById('editShopCancelBtn').addEventListener('click', function () {
    document.getElementById('editShopModal').style.display = 'none';
    currentEditShopId = null;
});
document.getElementById('editShopModal').addEventListener('click', function (e) {
    if (e.target === this) {
        this.style.display = 'none';
        currentEditShopId = null;
    }
});

/* ============================================================
 *  兑换记录
 * ============================================================ */
function loadPurchases() {
    var listEl = document.getElementById('purchaseUsersList');
    var badge  = document.getElementById('badgePurchases');
    if (!listEl) return;

    listEl.innerHTML = '<div class="empty">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('user_purchases').select('*')
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="empty">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                return;
            }
            var records = res.data || [];
            if (records.length === 0) {
                listEl.innerHTML = '<div class="empty">' + t('adminDash.purchasesEmpty', '暂无兑换记录') + '</div>';
                badge.textContent = '0';
                return;
            }

            var groups = {};
            records.forEach(function (r) {
                var uid = r.user_id || 'unknown';
                if (!groups[uid]) {
                    groups[uid] = { user_id: uid, records: [] };
                }
                groups[uid].records.push(r);
            });

            var userIds = Object.keys(groups);

            supabaseClient.from('profiles')
                .select('id, uid, email, full_name, avatar_url')
                .in('id', userIds)
                .then(function (pRes) {
                    var profiles = {};
                    (pRes.data || []).forEach(function (p) { profiles[p.id] = p; });

                    badge.textContent = userIds.length + ' ' + (getLang() === 'zh' ? '人' : '');

                    var html = '';
                    userIds.forEach(function (uid) {
                        var u = profiles[uid] || {};
                        var recs = groups[uid].records;
                        var lastTime = recs[0]
                            ? new Date(recs[0].created_at).toLocaleString('zh-CN', { hour12: false })
                            : '—';
                        var name = u.full_name || u.email || '—';
                        var email = u.email || '';
                        var avatar = u.avatar_url || DEFAULT_AVATAR;
                        var uidTag = u.uid ? ('UID ' + u.uid + ' · ') : '';

                        var recordsHtml = '';
                        recs.forEach(function (r) {
                            var time = new Date(r.created_at).toLocaleString('zh-CN', { hour12: false });
                            recordsHtml +=
                                '<div class="purchase-record">' +
                                    '<span class="pr-icon">' + escapeHtml(r.item_icon || '🎁') + '</span>' +
                                    '<div class="pr-info">' +
                                        '<div class="pr-name">' + escapeHtml(r.item_name || '—') + '</div>' +
                                        '<div class="pr-time">' + time + '</div>' +
                                    '</div>' +
                                    '<span class="pr-price">-' + (r.price_paid || 0) + '</span>' +
                                '</div>';
                        });

                        html +=
                            '<div class="purchase-user" data-uid="' + uid + '">' +
                                '<div class="purchase-user-head">' +
                                    '<img class="pu-avatar" src="' + escapeHtml(avatar) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
                                    '<div class="pu-info">' +
                                        '<div class="pu-name">' + escapeHtml(name) + '</div>' +
                                        '<div class="pu-email">' + escapeHtml(uidTag + email) + '</div>' +
                                    '</div>' +
                                    '<span class="pu-count">' + recs.length + t('adminDash.purchasesCountUnit', ' 件') + '</span>' +
                                    '<span class="pu-last">' + t('adminDash.purchasesLastPrefix', '最近：') + lastTime + '</span>' +
                                    '<span class="pu-arrow">▾</span>' +
                                '</div>' +
                                '<div class="purchase-user-body">' + recordsHtml + '</div>' +
                            '</div>';
                    });

                    listEl.innerHTML = html;

                    listEl.querySelectorAll('.purchase-user-head').forEach(function (head) {
                        head.addEventListener('click', function () {
                            var card = this.parentElement;
                            var wasOpen = card.classList.contains('open');

                            listEl.querySelectorAll('.purchase-user').forEach(function (el) {
                                el.classList.remove('open');
                            });

                            if (!wasOpen) card.classList.add('open');
                        });
                    });
                });
        });
}

document.getElementById('refreshPurchasesBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add('spinning');
    loadPurchases();
    setTimeout(function () { btn.disabled = false; btn.classList.remove('spinning'); }, 500);
});

/* ============================================================
 *  服务端信息
 * ============================================================ */
function renderHealthCard(name, ok) {
    return '<div class="health-card">' +
        '<div class="health-dot ' + (ok ? 'ok' : 'error') + '"></div>' +
        '<div class="health-info">' +
            '<span class="name">' + name + '</span>' +
            '<span class="status">' + (ok ? t('adminDash.serverHealthOk', '运行正常') : t('adminDash.serverHealthError', '异常')) + '</span>' +
        '</div>' +
    '</div>';
}

function loadServerInfo() {
    var btn = document.getElementById('refreshServerBtn');
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.functions.invoke('server-info', { body: {} }).then(function (res) {
        btn.disabled = false;
        btn.textContent = '🔄 ' + t('common.refresh', '刷新');
        if (res.error) { alert(t('common.fail', '操作失败') + '：' + res.error.message); return; }
        var data = res.data;
        if (!data || !data.success) { alert(t('common.fail', '操作失败') + '：' + (data && data.error ? data.error : t('common.fail', '未知错误'))); return; }

        var health = data.health || {};
        document.getElementById('healthGrid').innerHTML =
            renderHealthCard('Database', health.database === true) +
            renderHealthCard('Auth', health.auth === true) +
            renderHealthCard('Storage', health.storage === true) +
            renderHealthCard('Edge Functions', health.edgeFunctions === true);

        var stats = data.stats || {};
        document.getElementById('statAuthUsers').textContent = stats.authUsers || 0;
        document.getElementById('statProfiles').textContent  = stats.profiles || 0;
        document.getElementById('statForgot').textContent    = stats.forgotRequests || 0;
        document.getElementById('statBlocked').textContent   = stats.blockedUsers || 0;
        document.getElementById('statAvatars').textContent   = stats.avatars || 0;
        document.getElementById('statAvatarSize').innerHTML  = (stats.avatarSizeMB || 0) + '<span class="unit">MB</span>';

        var proj = data.project || {};
        document.getElementById('infoUrl').textContent    = proj.url || '—';
        document.getElementById('infoRegion').textContent = proj.region || '—';

        var rt = data.runtime || {};
        document.getElementById('infoQueryTime').textContent = (rt.queryTimeMs || 0) + ' ms';
        document.getElementById('infoMemory').textContent    = (rt.memoryUsageMB || 0) + ' MB';
        document.getElementById('infoDeno').textContent      = rt.denoVersion || '—';
        document.getElementById('infoTimestamp').textContent = data.timestamp
            ? new Date(data.timestamp).toLocaleString('zh-CN', { hour12: false }) : '—';

        document.getElementById('lastUpdate').textContent = t('adminDash.serverLastUpdatePrefix', '最后更新：') + new Date().toLocaleString('zh-CN', { hour12: false });
    }).catch(function (err) {
        btn.disabled = false;
        btn.textContent = '🔄 ' + t('common.refresh', '刷新');
        alert(t('common.fail', '操作失败') + '：' + (err && err.message ? err.message : err));
    });
}

document.getElementById('refreshServerBtn').addEventListener('click', loadServerInfo);

/* ============================================================
 *  我的签到
 * ============================================================ */
function myToDateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
}
function myShanghaiNow() {
    var now = new Date();
    return new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
}

function myLoadCheckinCalendar() {
    if (!currentAdmin) return;

    var today = myShanghaiNow();
    var dow = today.getDay();
    var diff = dow === 0 ? -6 : 1 - dow;
    var monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    var startStr = myToDateStr(monday);
    var endStr   = myToDateStr(sunday);

    Promise.all([
        supabaseClient.from('checkin_config').select('*').eq('id', 1).maybeSingle(),
        supabaseClient.from('checkins')
            .select('checkin_date, points')
            .eq('user_id', currentAdmin.id)
            .gte('checkin_date', startStr)
            .lte('checkin_date', endStr)
    ]).then(function (results) {
        var cfg = results[0].data || {};
        var checked = {};
        (results[1].data || []).forEach(function (c) { checked[c.checkin_date] = c.points; });
        myRenderCalendar(monday, cfg, checked);
    }).catch(function () { myRenderCalendar(monday, {}, {}); });
}

function myRenderCalendar(monday, cfg, checked) {
    var names = [
        t('adminDash.pointsMon', '周一'), t('adminDash.pointsTue', '周二'), t('adminDash.pointsWed', '周三'),
        t('adminDash.pointsThu', '周四'), t('adminDash.pointsFri', '周五'), t('adminDash.pointsSat', '周六'),
        t('adminDash.pointsSun', '周日')
    ];
    var keys  = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    var todayStr = myToDateStr(myShanghaiNow());

    var html = '';
    for (var i = 0; i < 7; i++) {
        var d = new Date(monday);
        d.setDate(monday.getDate() + i);
        var dateStr = myToDateStr(d);
        var isToday = dateStr === todayStr;
        var isChecked = Object.prototype.hasOwnProperty.call(checked, dateStr);
        var reward = cfg[keys[i]] != null ? cfg[keys[i]] : 1;

        var cls = 'checkin-day';
        if (isToday)   cls += ' today';
        if (isChecked) cls += ' checked';
        var pointText = isChecked ? ('+' + checked[dateStr]) : ('+' + reward);

        html += '<div class="' + cls + '">' +
            '<div class="day-name">' + names[i] + '</div>' +
            '<div class="day-date">' + (d.getMonth() + 1) + '/' + d.getDate() + '</div>' +
            '<div class="day-points">' + pointText + '</div>' +
        '</div>';
    }
    document.getElementById('myCheckinCalendar').innerHTML = html;
}

function myRefreshCheckinUI() {
    if (!currentAdmin) return;
    var today = myToDateStr(myShanghaiNow());

    Promise.all([
        supabaseClient.from('profiles')
            .select('points, checkin_streak')
            .eq('id', currentAdmin.id).maybeSingle(),
        supabaseClient.from('checkins')
            .select('checkin_date, points')
            .eq('user_id', currentAdmin.id)
            .eq('checkin_date', today)
            .maybeSingle()
    ]).then(function (results) {
        var p = results[0].data || {};
        var todayRow = results[1].data;
        var hasCheckedToday = !!todayRow;

        document.getElementById('myPoints').textContent = p.points || 0;
        document.getElementById('myStreak').textContent = p.checkin_streak || 0;

        var btn = document.getElementById('myCheckinBtn');
        if (hasCheckedToday) {
            btn.textContent = t('adminDash.myCheckinDone', '✓ 今日已签到');
            btn.disabled = true;
            document.getElementById('myTodayReward').textContent = '+' + (todayRow.points || 0);
        } else {
            btn.textContent = t('adminDash.myCheckinBtn', '签 到');
            btn.disabled = false;
            document.getElementById('myTodayReward').textContent = '—';
        }

        myLoadRank(currentAdmin.id);
    });
}

function myLoadRank(userId) {
    supabaseClient.from('profiles')
        .select('points')
        .eq('id', userId)
        .maybeSingle()
        .then(function (r) {
            if (r.error || !r.data) return;
            var myPoints = r.data.points || 0;

            Promise.all([
                supabaseClient.from('profiles')
                    .select('id', { count: 'exact', head: true })
                    .gt('points', myPoints),
                supabaseClient.from('profiles')
                    .select('id', { count: 'exact', head: true })
            ]).then(function (res) {
                var higher = (res[0] && res[0].count) || 0;
                var total  = (res[1] && res[1].count) || 0;
                var rank   = higher + 1;
                var el = document.getElementById('myAdminRank');
                if (el) el.textContent = rank + ' / ' + total;
            });
        });
}

document.getElementById('myCheckinBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.rpc('do_checkin').then(function (res) {
        if (res.error) {
            alert(t('userDash.checkinFail', '签到失败：') + res.error.message);
            btn.disabled = false;
            btn.textContent = t('adminDash.myCheckinBtn', '签 到');
            return;
        }
        var data = res.data || {};
        if (data.error) {
            alert(data.error);
            myRefreshCheckinUI();
            myLoadCheckinCalendar();
            return;
        }
        btn.textContent = t('adminDash.myCheckinDone', '✓ 今日已签到');
        document.getElementById('myPoints').textContent =
            (parseInt(document.getElementById('myPoints').textContent) || 0) + (data.points || 0);
        document.getElementById('myStreak').textContent = data.streak || 0;
        document.getElementById('myTodayReward').textContent = '+' + (data.points || 0);
        myLoadCheckinCalendar();

        var _newBal = parseInt(document.getElementById('myPoints').textContent) || 0;
        writePointLog(currentAdmin.id, data.points, t('adminDash.checkinReason', '每日签到'), _newBal);

        alert(t('userDash.checkinSuccess', '签到成功！') + '\n' +
              t('userDash.checkinGotPoints', '获得 ') + data.points + t('userDash.checkinPointsUnit', ' 积分') + '\n' +
              t('userDash.checkinStreakDay', '连续签到 ') + data.streak + t('userDash.checkinStreakDayUnit', ' 天'));
    }).catch(function (err) {
        alert(t('userDash.checkinFail', '签到失败：') + (err.message || err));
        btn.disabled = false;
        btn.textContent = t('adminDash.myCheckinBtn', '签 到');
    });
});

/* ============================================================
 *  我的好友
 * ============================================================ */
function myLoadFriends() {
    if (!currentAdmin) return;

    var pendingList = document.getElementById('myPendingList');
    var friendList  = document.getElementById('myFriendList');
    var badge       = document.getElementById('myBadgeFriends');

    pendingList.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';
    friendList.innerHTML  = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('friendships').select('*')
        .or('user_id.eq.' + currentAdmin.id + ',friend_id.eq.' + currentAdmin.id)
        .then(function (res) {
            if (res.error) {
                pendingList.innerHTML = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                friendList.innerHTML  = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + '</div>';
                return;
            }

            var all = res.data || [];
            var pendingFromOthers = [];
            var friendIds = [];

            all.forEach(function (f) {
                if (f.status === 'pending' && f.friend_id === currentAdmin.id) {
                    pendingFromOthers.push(f);
                } else if (f.status === 'accepted') {
                    friendIds.push(f.user_id === currentAdmin.id ? f.friend_id : f.user_id);
                }
            });

            badge.textContent = friendIds.length + t('userDash.friendsBadge', ' 位好友');

            var allIds = friendIds.concat(pendingFromOthers.map(function (f) { return f.user_id; }));
            if (allIds.length === 0) {
                pendingList.innerHTML = '<div class="empty-state">' + t('userDash.friendsPendingEmpty', '暂无待处理的请求') + '</div>';
                friendList.innerHTML  = '<div class="empty-state">' + t('userDash.friendsEmpty', '还没有好友，输入邮箱添加吧~') + '</div>';
                return;
            }

            supabaseClient.from('profiles').select('id, email, full_name, avatar_url').in('id', allIds)
                .then(function (pRes) {
                    var map = {};
                    (pRes.data || []).forEach(function (p) { map[p.id] = p; });

                    if (pendingFromOthers.length === 0) {
                        pendingList.innerHTML = '<div class="empty-state">' + t('userDash.friendsPendingEmpty', '暂无待处理的请求') + '</div>';
                    } else {
                        var ph = '';
                        pendingFromOthers.forEach(function (f) {
                            var u = map[f.user_id] || {};
                            ph += myRenderFriendItem(u, f.id, true);
                        });
                        pendingList.innerHTML = ph;
                        myBindPendingActions();
                    }

                    myFriendsCache = friendIds.map(function (id) { return map[id]; }).filter(Boolean);
                    if (myFriendsCache.length === 0) {
                        friendList.innerHTML = '<div class="empty-state">' + t('userDash.friendsEmpty', '还没有好友，输入邮箱添加吧~') + '</div>';
                    } else {
                        var fh = '';
                        myFriendsCache.forEach(function (u) {
                            fh += myRenderFriendItem(u, null, false);
                        });
                        friendList.innerHTML = fh;
                        myBindFriendClicks();
                    }
                });
        });
}

function myRenderFriendItem(user, fsId, isPending) {
    var avatar = user.avatar_url || DEFAULT_AVATAR;
    var name = user.full_name || user.email || '—';
    var email = user.email || '';
    if (isPending) {
        return '<div class="friend-item pending" data-fsid="' + fsId + '" data-uid="' + user.id + '">' +
            '<img src="' + escapeHtml(avatar) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
            '<div class="friend-info">' +
                '<div class="friend-name">' + escapeHtml(name) + '</div>' +
                '<div class="friend-email">' + escapeHtml(email) + '</div>' +
            '</div>' +
            '<div class="friend-actions">' +
                '<button class="accept-btn">' + t('userDash.friendsAccept', '同意') + '</button>' +
                '<button class="reject-btn">' + t('userDash.friendsReject', '拒绝') + '</button>' +
            '</div>' +
        '</div>';
    }
    return '<div class="friend-item" data-uid="' + user.id + '">' +
        '<img src="' + escapeHtml(avatar) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
        '<div class="friend-info">' +
            '<div class="friend-name">' + escapeHtml(name) + '</div>' +
            '<div class="friend-email">' + escapeHtml(email) + '</div>' +
        '</div>' +
        '<div class="friend-arrow">💬</div>' +
    '</div>';
}

function myBindPendingActions() {
    document.querySelectorAll('#myPendingList .friend-item.pending').forEach(function (item) {
        var fsId = item.getAttribute('data-fsid');
        item.querySelector('.accept-btn').addEventListener('click', function () {
            supabaseClient.from('friendships').update({ status: 'accepted' }).eq('id', fsId)
                .then(function (r) {
                    if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
                    myLoadFriends();
                });
        });
        item.querySelector('.reject-btn').addEventListener('click', function () {
            if (!confirm(t('userDash.friendsRejectConfirm', '确定拒绝该好友请求吗？'))) return;
            supabaseClient.from('friendships').delete().eq('id', fsId)
                .then(function (r) {
                    if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
                    myLoadFriends();
                });
        });
    });
}

function myBindFriendClicks() {
    document.querySelectorAll('#myFriendList .friend-item[data-uid]').forEach(function (item) {
        item.addEventListener('click', function () {
            var uid = this.getAttribute('data-uid');
            var friend = myFriendsCache.find(function (u) { return u.id === uid; });
            if (friend) myOpenChat(friend);
        });
    });
}

document.getElementById('myAddFriendBtn').addEventListener('click', function () {
    var input = document.getElementById('myFriendEmailInput');
    var email = input.value.trim().toLowerCase();
    if (!email) { alert(t('userDash.friendsEnterEmail', '请输入对方邮箱')); return; }
    if (email === (currentAdmin.email || '').toLowerCase()) {
        alert(t('userDash.friendsAddSelf', '不能添加自己为好友'));
        return;
    }

    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.from('profiles').select('id, email, full_name').eq('email', email).maybeSingle()
        .then(function (res) {
            if (res.error || !res.data) {
                btn.disabled = false;
                btn.textContent = t('adminDash.myFriendsAddBtn', '➕ 添加好友');
                alert(t('userDash.friendsAddNoUser', '找不到这个邮箱的用户'));
                return;
            }

            var targetId = res.data.id;

            supabaseClient.from('friendships').select('*')
                .or('and(user_id.eq.' + currentAdmin.id + ',friend_id.eq.' + targetId + '),and(user_id.eq.' + targetId + ',friend_id.eq.' + currentAdmin.id + ')')
                .maybeSingle()
                .then(function (fRes) {
                    if (fRes.data) {
                        btn.disabled = false;
                        btn.textContent = t('adminDash.myFriendsAddBtn', '➕ 添加好友');
                        if (fRes.data.status === 'accepted') alert(t('userDash.friendsAddAlready', '你们已经是好友了'));
                        else if (fRes.data.user_id === currentAdmin.id) alert(t('userDash.friendsAddSent', '已发送过请求，等待对方同意'));
                        else alert(t('userDash.friendsAddCameIn', '对方已经向你发起了请求，去"待处理"里同意吧'));
                        return;
                    }

                    supabaseClient.from('friendships').insert([{
                        user_id: currentAdmin.id,
                        friend_id: targetId,
                        status: 'pending'
                    }]).then(function (iRes) {
                        btn.disabled = false;
                        btn.textContent = t('adminDash.myFriendsAddBtn', '➕ 添加好友');
                        if (iRes.error) { alert(t('userDash.friendsAddFail', '添加失败：') + iRes.error.message); return; }
                        input.value = '';
                        alert(t('userDash.friendsAddSuccess', '好友请求已发送！'));
                        myLoadFriends();
                    });
                });
        });
});

function myOpenChat(friend) {
    myCurrentChatFriend = friend;
    myLastMsgTs = null;
    document.getElementById('myChatFriendName').textContent = friend.full_name || friend.email;
    document.getElementById('myChatFriendAvatar').src = friend.avatar_url || DEFAULT_AVATAR;
    document.getElementById('myChatModal').style.display = 'flex';
    document.getElementById('myChatBody').innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';
    myLoadMessages();

    if (myChatPollTimer) clearInterval(myChatPollTimer);
    myChatPollTimer = setInterval(myLoadMessages, 3000);
    setTimeout(function () { document.getElementById('myChatInput').focus(); }, 100);
}

function myCloseChat() {
    document.getElementById('myChatModal').style.display = 'none';
    if (myChatPollTimer) { clearInterval(myChatPollTimer); myChatPollTimer = null; }
    myCurrentChatFriend = null;
    myLastMsgTs = null;
}

document.getElementById('myChatCloseBtn').addEventListener('click', myCloseChat);
document.getElementById('myChatModal').addEventListener('click', function (e) {
    if (e.target === this) myCloseChat();
});

function myLoadMessages() {
    if (!currentAdmin || !myCurrentChatFriend) return;

    supabaseClient.from('messages').select('*')
        .or('and(from_user.eq.' + currentAdmin.id + ',to_user.eq.' + myCurrentChatFriend.id + '),and(from_user.eq.' + myCurrentChatFriend.id + ',to_user.eq.' + currentAdmin.id + ')')
        .order('created_at', { ascending: true })
        .then(function (res) {
            if (res.error) return;
            var data = res.data || [];
            var body = document.getElementById('myChatBody');

            if (data.length === 0) {
                body.innerHTML = '<div class="empty-state">' + t('userDash.chatEmpty', '还没有聊天记录，说点什么吧~') + '</div>';
                return;
            }

            var latestFromFriend = null;
            data.forEach(function (m) {
                if (m.from_user !== currentAdmin.id) {
                    if (!latestFromFriend || new Date(m.created_at) > new Date(latestFromFriend)) {
                        latestFromFriend = m.created_at;
                    }
                }
            });
            if (latestFromFriend) {
                var isFirst = (myLastMsgTs === null);
                if (!isFirst && new Date(latestFromFriend) > new Date(myLastMsgTs)) {
                    if (window.LoginSound && window.LoginSound.playMessageIfEnabled) {
                        window.LoginSound.playMessageIfEnabled();
                    }
                }
                myLastMsgTs = latestFromFriend;
            }

            var html = '';
            data.forEach(function (m) {
                var mine = m.from_user === currentAdmin.id;
                var time = new Date(m.created_at).toLocaleString('zh-CN', { hour12: false });
                html += '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + '">' +
                    escapeHtml(m.content) +
                    '<span class="chat-time">' + time + '</span>' +
                '</div>';
            });
            body.innerHTML = html;
            body.scrollTop = body.scrollHeight;

            var unreadIds = data.filter(function (m) { return m.to_user === currentAdmin.id && !m.is_read; })
                                .map(function (m) { return m.id; });
            if (unreadIds.length > 0) {
                supabaseClient.from('messages').update({ is_read: true }).in('id', unreadIds).then(function () {});
            }
        });
}

function mySendMessage() {
    if (!currentAdmin || !myCurrentChatFriend) return;
    var input = document.getElementById('myChatInput');
    var content = input.value.trim();
    if (!content) return;

    var btn = document.getElementById('myChatSendBtn');
    btn.disabled = true;

    supabaseClient.from('messages').insert([{
        from_user: currentAdmin.id,
        to_user: myCurrentChatFriend.id,
        content: content
    }]).then(function (res) {
        btn.disabled = false;
        if (res.error) { alert(t('userDash.chatSendFail', '发送失败：') + res.error.message); return; }
        input.value = '';
        myLoadMessages();
    });
}

document.getElementById('myChatSendBtn').addEventListener('click', mySendMessage);
document.getElementById('myChatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') mySendMessage();
});

/* ============================================================
 *  音效设置
 * ============================================================ */
(function initSoundSetting() {
    var pairs = [
        { elId: 'toggleLoginSound',   key: 'nangua_loginSound'   },
        { elId: 'toggleMessageSound', key: 'nangua_messageSound' }
    ];

    pairs.forEach(function (p) {
        var el = document.getElementById(p.elId);
        if (!el) return;

        function syncUI() {
            var on = localStorage.getItem(p.key) === 'on';
            el.classList.toggle('active', on);
            el.setAttribute('aria-pressed', on ? 'true' : 'false');
        }
        syncUI();

        el.addEventListener('click', function () {
            var willBeOn = !el.classList.contains('active');
            localStorage.setItem(p.key, willBeOn ? 'on' : 'off');
            syncUI();
        });
    });

    var t1 = document.getElementById('testLoginSoundBtn');
    if (t1) t1.addEventListener('click', function () {
        if (window.LoginSound && window.LoginSound.play) {
            window.LoginSound.play();
        }
    });

    var t2 = document.getElementById('testMessageSoundBtn');
    if (t2) t2.addEventListener('click', function () {
        if (window.LoginSound && window.LoginSound.playMessage) {
            window.LoginSound.playMessage();
        }
    });
})();

/* ============================================================
 *  动态语言刷新
 * ============================================================ */
function refreshDynamicText() {
    try {
        var cards = {
            'cardAnnounce':  loadAnnouncements,
            'cardPoints':    loadPoints,
            'cardPointLogs': loadAllPointLogs,
            'cardForgot':    loadForgotRequests,
            'cardAchievements': loadAchievements,
            'cardProfiles':  loadProfiles,
            'cardShop':      loadAdminShop,
            'cardPurchases': loadPurchases,
            'cardFeedback':  loadAllFeedbacks,
            'cardMyCheckin': function () { myRefreshCheckinUI(); myLoadCheckinCalendar(); },
            'cardMyFriends': myLoadFriends
        };
        Object.keys(cards).forEach(function (id) {
            var el = document.getElementById(id);
            if (el && el.classList.contains('active')) {
                try { cards[id](); } catch (e) {}
            }
        });
        if (window.LangHelper && window.LangHelper.apply) {
            window.LangHelper.apply();
        }
    } catch (e) {}
}
window.refreshDynamicText = refreshDynamicText;

/* ============================================================
 *  初次加载 + 应用语言
 * ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(applyLang, 100);
});