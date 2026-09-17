/* 动态墙 · 用户端逻辑 */
(function () {
    'use strict';
    var sb = window.supabaseClient;
    if (!sb) { console.warn('[wall] supabaseClient 未定义'); return; }

    var DEFAULT_AVATAR = 'image/default-avatar.png';
    var currentUser = null;
    var wallCache = [];
    var myLikes = {};
    var myProfile = {};
    var authorCache = {};

    function t(k, fb) { return (window.LangHelper && window.LangHelper.t) ? window.LangHelper.t(k, fb) : (fb != null ? fb : k); }
    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }
    function fmtTime(iso) {
        if (!iso) return '';
        var d = new Date(iso); var diff = Date.now() - d.getTime();
        if (diff < 60000) return t('wall.justNow','刚刚');
        if (diff < 3600000) return Math.floor(diff/60000) + t('wall.minutesAgo',' 分钟前');
        if (diff < 86400000) return Math.floor(diff/3600000) + t('wall.hoursAgo',' 小时前');
        if (diff < 7*86400000) return Math.floor(diff/86400000) + t('wall.daysAgo',' 天前');
        return d.toLocaleDateString('zh-CN');
    }

    function ensureUser() {
        if (currentUser) return Promise.resolve(currentUser);
        return sb.auth.getSession().then(function (r) {
            var s = r.data && r.data.session;
            if (s && s.user) {
                currentUser = s.user;
                return sb.from('profiles').select('full_name, avatar_url').eq('id', s.user.id).maybeSingle()
                    .then(function (pr) { myProfile = pr.data || {}; return currentUser; });
            }
            return null;
        });
    }
    function fetchAuthors(userIds) {
        var missing = userIds.filter(function (id) { return id && !authorCache[id]; });
        if (!missing.length) return Promise.resolve();
        return sb.from('profiles').select('id, full_name, avatar_url').in('id', missing)
            .then(function (r) { (r.data || []).forEach(function (p) { authorCache[p.id] = p; }); })
            .catch(function () {});
    }

    function loadWall() {
        var listEl = document.getElementById('wallList');
        if (!listEl) return;
        listEl.innerHTML = '<div class="wall-empty">' + t('common.loading','加载中...') + '</div>';
        return ensureUser().then(function () {
            return sb.from('posts').select('*')
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(50);
        }).then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="wall-empty">' + t('wall.loadFailed','加载失败') + '：' + esc(res.error.message) + '</div>';
                return;
            }
            wallCache = res.data || [];
            var badge = document.getElementById('badgeWall');
            if (badge) badge.textContent = wallCache.length + t('wall.badgeCount',' 条');

            var authorIds = wallCache.filter(function (p) { return !p.is_anonymous && p.user_id !== (currentUser && currentUser.id); })
                                     .map(function (p) { return p.user_id; });
            var tasks = [fetchAuthors(authorIds)];

            if (currentUser && wallCache.length) {
                var ids = wallCache.map(function (p) { return p.id; });
                tasks.push(
                    sb.from('post_likes').select('post_id').eq('user_id', currentUser.id).in('post_id', ids)
                        .then(function (lr) {
                            myLikes = {};
                            (lr.data || []).forEach(function (row) { myLikes[row.post_id] = true; });
                        })
                );
            }
            return Promise.all(tasks).then(renderWall);
        });
    }

    function renderWall() {
        var listEl = document.getElementById('wallList');
        if (!listEl) return;
        if (!wallCache.length) {
            listEl.innerHTML = '<div class="wall-empty">' + t('wall.empty','还没有动态，来发第一条吧~') + '</div>';
            return;
        }
        listEl.innerHTML = wallCache.map(renderCard).join('');
        bindCardEvents();
    }

    function renderCard(p) {
        var isMine = currentUser && p.user_id === currentUser.id;
        var liked = !!myLikes[p.id];
        var au = authorCache[p.user_id] || {};
        var author = p.is_anonymous ? t('wall.anonBadge','🕶️ 匿名')
            : (isMine ? (myProfile.full_name || currentUser.email || '我')
                      : (au.full_name || '用户'));
        var avatar = p.is_anonymous ? DEFAULT_AVATAR
            : (isMine ? (myProfile.avatar_url || DEFAULT_AVATAR)
                      : (au.avatar_url || DEFAULT_AVATAR));

        var statusBadge = '';
        if (p.status === 'pending')  statusBadge = '<span class="wall-badge warn">'  + t('wall.statusPending','⏳ 待审核') + '</span>';
        if (p.status === 'hidden')   statusBadge = '<span class="wall-badge danger">'+ t('wall.statusHidden','🚫 已隐藏') + '</span>';
        if (p.status === 'rejected') statusBadge = '<span class="wall-badge danger">'+ t('wall.statusRejected','❌ 已驳回') + '</span>';
        var pinBadge     = p.is_pinned   ? '<span class="wall-badge">' + t('wall.pinnedBadge','📌 置顶') + '</span>' : '';
        var featureBadge = p.is_featured ? '<span class="wall-badge">' + t('wall.featuredBadge','✨ 加精') + '</span>' : '';
        var delBtn = isMine
            ? '<button class="wall-action-btn danger" data-act="delete" data-id="' + p.id + '">🗑 ' + t('wall.deleteBtn','删除') + '</button>'
            : '<button class="wall-action-btn" data-act="report" data-id="' + p.id + '">🚩 ' + t('wall.report','举报') + '</button>';

        return '<div class="wall-card status-' + p.status + '" data-post-id="' + p.id + '">' +
            '<div class="wall-head">' +
                '<img class="wall-avatar" src="' + esc(avatar) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
                '<div class="wall-meta">' +
                    '<div class="wall-author">' + esc(author) + '</div>' +
                    '<div class="wall-time">' + fmtTime(p.created_at) + '</div>' +
                '</div>' +
                '<div class="wall-badges">' + pinBadge + featureBadge + statusBadge + '</div>' +
            '</div>' +
            '<div class="wall-content">' + esc(p.content) + '</div>' +
            '<div class="wall-actions">' +
                '<button class="wall-action-btn ' + (liked ? 'liked' : '') + '" data-act="like" data-id="' + p.id + '">' +
                    (liked ? '❤️' : '🤍') + ' <span>' + (p.like_count || 0) + '</span>' +
                '</button>' +
                '<button class="wall-action-btn" data-act="comment-toggle" data-id="' + p.id + '">' +
                    '💬 <span>' + (p.comment_count || 0) + '</span>' +
                '</button>' + delBtn +
            '</div>' +
            '<div class="wall-comments" id="wallComments_' + p.id + '"></div>' +
        '</div>';
    }

    function bindCardEvents() {
        document.querySelectorAll('#wallList .wall-action-btn').forEach(function (btn) {
            btn.onclick = function () {
                var act = this.getAttribute('data-act');
                var id = parseInt(this.getAttribute('data-id'), 10);
                if (act === 'like') doToggleLike(id);
                else if (act === 'comment-toggle') toggleComments(id);
                else if (act === 'delete') doDeletePost(id);
                else if (act === 'report') doReport(id);
            };
        });
    }

    function doToggleLike(postId) {
        ensureUser().then(function (u) {
            if (!u) { alert(t('wall.publishNeedLogin','请先登录')); return; }
            var liked = !!myLikes[postId];
            if (liked) return sb.from('post_likes').delete().eq('post_id', postId).eq('user_id', u.id)
                .then(function () { delete myLikes[postId]; });
            return sb.from('post_likes').insert([{ post_id: postId, user_id: u.id }])
                .then(function () { myLikes[postId] = true; });
        }).then(function () { loadWall(); });
    }

    function toggleComments(postId) {
        var box = document.getElementById('wallComments_' + postId);
        if (!box) return;
        if (box.classList.contains('open')) { box.classList.remove('open'); return; }
        box.classList.add('open');
        box.innerHTML = '<div class="wall-empty" style="padding:12px;">' + t('common.loading','加载中...') + '</div>';
        loadComments(postId);
    }

    function loadComments(postId) {
        var box = document.getElementById('wallComments_' + postId);
        if (!box) return;
        sb.from('post_comments').select('*').eq('post_id', postId).eq('status','published')
            .order('created_at', { ascending: true })
            .then(function (res) {
                if (res.error) { box.innerHTML = '<div class="wall-empty" style="padding:12px;">' + t('wall.commentLoadFailed','加载失败') + '</div>'; return; }
                var list = res.data || [];
                var uids = list.map(function (c) { return c.user_id; });
                fetchAuthors(uids).then(function () {
                    var html = '';
                    if (!list.length) {
                        html = '<div class="wall-empty" style="padding:8px 0; font-size:.85em;">' + t('wall.commentEmpty','还没有评论，来抢沙发~') + '</div>';
                    } else {
                        html = '<div class="wall-comment-list">' + list.map(function (c) {
                            var cu = authorCache[c.user_id] || {};
                            var isMe = currentUser && c.user_id === currentUser.id;
                            var name = isMe ? (myProfile.full_name || currentUser.email) : (cu.full_name || '用户');
                            var av = cu.avatar_url || DEFAULT_AVATAR;
                            return '<div class="wall-comment">' +
                                '<img src="' + esc(av) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
                                '<div class="wall-comment-body">' +
                                    '<div class="wall-comment-name">' + esc(name) +
                                        '<span class="wall-comment-time">' + fmtTime(c.created_at) + '</span>' +
                                    '</div>' +
                                    '<div class="wall-comment-text">' + esc(c.content) + '</div>' +
                                '</div></div>';
                        }).join('') + '</div>';
                    }
                    html += '<div class="wall-comment-input">' +
                        '<input type="text" id="wallCommentInput_' + postId + '" placeholder="' + t('wall.commentPlaceholder','友善评论...') + '" maxlength="200">' +
                        '<button>' + t('wall.commentSend','发送') + '</button>' +
                    '</div>';
                    box.innerHTML = html;
                    var btn = box.querySelector('.wall-comment-input button');
                    var inp = box.querySelector('.wall-comment-input input');
                    btn.onclick = function () { doComment(postId, inp.value.trim(), this); };
                    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') doComment(postId, inp.value.trim(), btn); });
                });
            });
    }

    function doComment(postId, content, btnEl) {
        if (!content) return;
        ensureUser().then(function (u) {
            if (!u) { alert(t('wall.publishNeedLogin','请先登录')); return; }
            btnEl.disabled = true;
            return sb.from('post_comments').insert([{ post_id: postId, user_id: u.id, content: content, status: 'published' }])
                .select().single().then(function (res) {
                    btnEl.disabled = false;
                    if (res.error) { alert(t('common.fail','操作失败') + '：' + res.error.message); return; }
                    var newCid = res.data ? res.data.id : null;
                    loadComments(postId);
                    if (newCid) callAI('comment','audit','comment', newCid, content, u.id);
                });
        });
    }

    function doDeletePost(postId) {
        if (!confirm(t('wall.deleteConfirm','确定删除这条动态吗？'))) return;
        sb.from('posts').update({ status: 'deleted' }).eq('id', postId)
            .then(function (r) {
                if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                loadWall();
            });
    }

    function doReport(postId) {
        var reason = prompt(t('wall.reportReasonPlaceholder','请说明举报原因...'));
        if (reason === null) return;
        reason = reason.trim();
        if (!reason) { alert(t('wall.reportEmpty','请填写举报原因')); return; }
        ensureUser().then(function (u) {
            if (!u) { alert(t('wall.publishNeedLogin','请先登录')); return; }
            sb.from('post_reports').insert([{ post_id: postId, reporter_id: u.id, reason: reason }])
                .then(function (r) {
                    if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                    alert(t('wall.reportSuccess','举报已提交'));
                });
        });
    }

    function doPublish() {
        var ta = document.getElementById('wallPublishInput');
        var anonEl = document.getElementById('wallPublishAnon');
        var content = (ta.value || '').trim();
        if (!content) { alert(t('wall.publishEmpty','请输入内容')); return; }
        var btn = document.getElementById('wallPublishBtn');
        btn.disabled = true;
        btn.textContent = t('wall.publishing','发布中...');

        ensureUser().then(function (u) {
            if (!u) {
                btn.disabled = false;
                btn.textContent = t('wall.publishBtn','发布动态');
                alert(t('wall.publishNeedLogin','请先登录'));
                return;
            }
            return sb.from('posts').insert([{
                user_id: u.id, content: content,
                is_anonymous: !!anonEl.checked, status: 'pending'
            }]).select().single().then(function (ins) {
                ta.value = ''; anonEl.checked = false;
                btn.disabled = false;
                btn.textContent = t('wall.publishBtn','发布动态');
                var newPostId = ins.data ? ins.data.id : null;
                loadWall();
                if (newPostId) {
                    callAI('post','audit','post', newPostId, content, u.id).then(function (resp) {
                        if (resp && resp.verdict) {
                            var v = resp.verdict.verdict;
                            var newStatus = v === 'ok' ? 'published' : (v === 'block' ? 'hidden' : 'pending');
                            sb.from('posts').update({ status: newStatus }).eq('id', newPostId)
                                .then(function () { setTimeout(loadWall, 300); });
                        }
                    });
                }
            });
        }).catch(function (e) {
            btn.disabled = false;
            btn.textContent = t('wall.publishBtn','发布动态');
            alert(t('common.fail','操作失败') + '：' + (e.message || e));
        });
    }

    function callAI(module, action, targetType, targetId, content, userId) {
        var url = (window.SUPABASE_URL || 'https://syxawclhvreyxltynpnj.supabase.co') + '/functions/v1/ai-gateway';
        return sb.auth.getSession().then(function (r) {
            var token = r.data && r.data.session && r.data.session.access_token;
            if (!token) return null;
            return fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ module: module, action: action, target_type: targetType, target_id: targetId, content: content, user_id: userId })
            }).then(function (res) { return res.json(); });
        }).catch(function (e) { console.warn('[wall] AI 调用失败', e); return null; });
    }

    function init() {
        var ready = (window.i18n && window.i18n.ready) || Promise.resolve();
        ready.then(function () {
            ensureUser();
            var btn = document.getElementById('wallPublishBtn');
            if (btn) btn.onclick = doPublish;
        });
    }
    window.loadWall = loadWall;
    window.initWall = init;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();