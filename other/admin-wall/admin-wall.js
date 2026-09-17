/* ============================================================
 *  管理端动态墙 · AI 控制中枢
 *  依赖：window.supabaseClient, window.t / LangHelper
 * ============================================================ */
(function () {
    'use strict';
    var sb = window.supabaseClient;
    if (!sb) { console.warn('[admin-wall] supabaseClient 未定义'); return; }

    var DEFAULT_AVATAR = 'image/default-avatar.png';
    var allDecisions = [];
    var allPosts = [];
    var allTrust = [];
    var allLogs = [];

    function t(k, fb) {
        return (window.LangHelper && window.LangHelper.t) ? window.LangHelper.t(k, fb) : (fb != null ? fb : k);
    }
    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/&#39;/g,'&#39;');
    }
    function fmtTime(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); }
        catch (e) { return iso; }
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleDateString('zh-CN'); }
        catch (e) { return iso; }
    }
    function levelLabel(lv) {
        return ['L0', 'L1', 'L2', 'L3'][lv] || 'L?';
    }
    function levelClass(lv) {
        return ['l0', 'l1', 'l2', 'l3'][lv] || 'l3';
    }

    /* ============================================================
     *  ① AI 决策复审
     * ============================================================ */
    function loadAiDecisions() {
        var listEl = document.getElementById('aiDecisionsList');
        var badge  = document.getElementById('badgeAiDecisions');
        if (!listEl) return;
        var filter = document.getElementById('aiDecisionsFilter').value;
        listEl.innerHTML = '<div class="empty">' + t('common.loading', '加载中...') + '</div>';

        var q = sb.from('ai_decisions').select('*').order('created_at', { ascending: false }).limit(200);

        q.then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="empty">' + t('common.loadFailed','加载失败') + '：' + esc(res.error.message) + '</div>';
                return;
            }
            var data = res.data || [];

            if (filter === 'pending')       data = data.filter(function (d) { return d.applied && !d.reverted; });
            else if (filter === 'applied')  data = data.filter(function (d) { return d.applied && !d.reverted; });
            else if (filter === 'reverted') data = data.filter(function (d) { return d.reverted; });

            allDecisions = data;
            badge.textContent = data.length + ' ' + (t('wall.badgeCount',' 条').trim() || '条');

            if (!data.length) {
                listEl.innerHTML = '<div class="empty">' + t('adminWall.decisionsEmpty', '暂无决策记录') + '</div>';
                return;
            }

            var html = '';
            data.forEach(function (d) {
                var verdictClass = d.ai_verdict === 'ok' ? 'ok' : (d.ai_verdict === 'block' ? 'block' : 'warn');
                var statusHtml = '';
                if (d.reverted)      statusHtml = '<span class="status-tag blocked">' + t('adminWall.decisionsFilterReverted', '已回滚') + '</span>';
                else if (d.applied)  statusHtml = '<span class="status-tag active">' + t('adminWall.decisionsFilterApplied', '已应用') + '</span>';
                else                 statusHtml = '<span class="status-tag pending">' + t('adminWall.decisionsFilterPending', '待复审') + '</span>';

                var revertBtn = (d.applied && !d.reverted)
                    ? '<button class="action-btn block ai-revert-btn" data-id="' + d.id + '">' + t('adminWall.decisionsRevertBtn','↺ 回滚') + '</button>'
                    : '';

                html += '<div class="ai-decision-card">' +
                    '<div class="ai-decision-head">' +
                        '<span class="level-badge ' + levelClass(d.level) + '">' + levelLabel(d.level) + '</span>' +
                        '<span class="verdict-badge ' + verdictClass + '">' + esc(d.ai_verdict || '—') + '</span>' +
                        (d.ai_confidence != null ? '<span class="confidence">' + (Number(d.ai_confidence) * 100).toFixed(0) + '%</span>' : '') +
                        '<span class="dec-target">' + esc(d.target_type) + '#' + (d.target_id || '—') + '</span>' +
                        statusHtml +
                        '<span class="dec-time">' + fmtTime(d.created_at) + '</span>' +
                    '</div>' +
                    '<div class="ai-decision-reason">' + esc(d.ai_reason || '—') + '</div>' +
                    (d.ai_tags && d.ai_tags.length
                        ? '<div class="ai-decision-tags">' + d.ai_tags.map(function (tg) {
                              return '<span class="tag">' + esc(tg) + '</span>';
                          }).join('') + '</div>'
                        : '') +
                    '<div class="ai-decision-actions">' + revertBtn + '</div>' +
                '</div>';
            });
            listEl.innerHTML = html;

            listEl.querySelectorAll('.ai-revert-btn').forEach(function (btn) {
                btn.addEventListener('click', function () { revertDecision(this.getAttribute('data-id')); });
            });
        });
    }

    function revertDecision(id) {
        var reason = prompt(t('adminWall.decisionsRevertReason', '回滚原因（可选）'));
        if (reason === null) return;
        if (!confirm(t('adminWall.decisionsRevertConfirm', '确定回滚这条 AI 决策吗？'))) return;

        sb.rpc('ai_revert_decision', { p_decision_id: Number(id), p_reason: reason || null })
            .then(function (r) {
                if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                alert(t('common.success', '操作成功'));
                loadAiDecisions();
                if (typeof window.loadWall === 'function') {}
            });
    }

    /* ============================================================
     *  ② AI 分级配置
     * ============================================================ */
    var MODULES = [
        { module: 'post',    action: 'audit',  label: '动态审核' },
        { module: 'post',    action: 'delete', label: '动态删除' },
        { module: 'comment', action: 'audit',  label: '评论审核' },
        { module: 'comment', action: 'delete', label: '评论删除' },
        { module: 'user',    action: 'mute',   label: '用户禁言' },
        { module: 'user',    action: 'ban',    label: '用户封禁' }
    ];

    function loadAiConfig() {
        var listEl = document.getElementById('aiConfigList');
        var badge  = document.getElementById('badgeAiConfig');
        if (!listEl) return;
        listEl.innerHTML = '<div class="empty">' + t('common.loading', '加载中...') + '</div>';

        sb.from('dw_config').select('*').then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="empty">' + t('common.loadFailed','加载失败') + '：' + esc(res.error.message) + '</div>';
                return;
            }
            var rows = res.data || [];
            var map = {};
            rows.forEach(function (r) { map[r.module + '.' + r.action] = r; });

            badge.textContent = rows.length + ' ' + (t('wall.badgeCount',' 条').trim() || '条');

            var html = '<div class="dw-config-grid">';
            MODULES.forEach(function (m) {
                var r = map[m.module + '.' + m.action] || {};
                var level = r.level != null ? r.level : 2;
                var enabled = r.enabled !== false;

                html += '<div class="config-item">' +
                    '<div class="config-item-head">' +
                        '<span class="config-item-label">' + esc(m.label) + '</span>' +
                        '<code class="config-item-code">' + m.module + '.' + m.action + '</code>' +
                    '</div>' +
                    '<div class="level-picker" data-module="' + m.module + '" data-action="' + m.action + '">' +
                        [0,1,2,3].map(function (lv) {
                            return '<button type="button" class="level-btn' + (lv === level ? ' active' : '') + '" data-level="' + lv + '">' +
                                levelLabel(lv) + '<small>' + ['自动','半自动','建议','手动'][lv] + '</small>' +
                            '</button>';
                        }).join('') +
                    '</div>' +
                    '<div class="config-item-foot">' +
                        '<label class="switch-mini"><input type="checkbox" class="config-enabled" ' + (enabled ? 'checked' : '') + '/> ' + t('adminWall.configEnabled', '启用') + '</label>' +
                        '<button class="action-btn edit config-save-btn">' + t('common.save','保存') + '</button>' +
                    '</div>' +
                '</div>';
            });
            html += '</div>';
            listEl.innerHTML = html;

            listEl.querySelectorAll('.level-picker').forEach(function (picker) {
                picker.querySelectorAll('.level-btn').forEach(function (btn) {
                    btn.addEventListener('click', function () {
                        picker.querySelectorAll('.level-btn').forEach(function (b) { b.classList.remove('active'); });
                        this.classList.add('active');
                    });
                });
            });

            listEl.querySelectorAll('.config-save-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var item = this.closest('.config-item');
                    var picker = item.querySelector('.level-picker');
                    var module = picker.getAttribute('data-module');
                    var action = picker.getAttribute('data-action');
                    var level = Number(picker.querySelector('.level-btn.active').getAttribute('data-level'));
                    var enabled = item.querySelector('.config-enabled').checked;

                    btn.disabled = true;
                    sb.from('dw_config').upsert({
                        module: module, action: action, level: level, enabled: enabled,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'module,action' }).then(function (r) {
                        btn.disabled = false;
                        if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                        alert(t('adminWall.configSaveSuccess', '配置已保存'));
                    });
                });
            });
        });
    }

    /* ============================================================
     *  ③ 敏感词库
     * ============================================================ */
    function loadAiWordlist() {
        var listEl = document.getElementById('aiWordlistBody');
        var badge  = document.getElementById('badgeAiWordlist');
        if (!listEl) return;
        listEl.innerHTML = '<tr><td colspan="6" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';

        sb.from('ai_wordlist').select('*').order('created_at', { ascending: false }).then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<tr><td colspan="6" class="empty">' + t('common.loadFailed','加载失败') + '：' + esc(res.error.message) + '</td></tr>';
                return;
            }
            var data = res.data || [];
            badge.textContent = data.length + ' ' + (t('wall.badgeCount',' 条').trim() || '条');

            if (!data.length) {
                listEl.innerHTML = '<tr><td colspan="6" class="empty">' + t('adminWall.wordlistEmpty', '暂无敏感词') + '</td></tr>';
                return;
            }

            var html = '';
            data.forEach(function (w) {
                html += '<tr>' +
                    '<td><strong>' + esc(w.word) + '</strong></td>' +
                    '<td>' + esc(w.category || 'general') + '</td>' +
                    '<td>' + levelLabel(w.level || 2) + '</td>' +
                    '<td>' + (w.enabled !== false
                        ? '<span class="status-tag active">' + t('adminWall.wordlistEnabled','启用') + '</span>'
                        : '<span class="status-tag blocked">—</span>') + '</td>' +
                    '<td>' + fmtTime(w.created_at) + '</td>' +
                    '<td><button class="action-btn del wordlist-del-btn" data-id="' + w.id + '">' + t('common.delete','删除') + '</button></td>' +
                '</tr>';
            });
            listEl.innerHTML = html;

            listEl.querySelectorAll('.wordlist-del-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    if (!confirm(t('adminWall.wordlistDeleteConfirm', '确定删除这个敏感词吗？'))) return;
                    sb.from('ai_wordlist').delete().eq('id', this.getAttribute('data-id')).then(function (r) {
                        if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                        loadAiWordlist();
                    });
                });
            });
        });
    }

    function bindWordlistAdd() {
        var btn = document.getElementById('addWordlistBtn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var word = document.getElementById('wordlistWord').value.trim();
            var cat  = document.getElementById('wordlistCategory').value.trim() || 'general';
            var lv   = parseInt(document.getElementById('wordlistLevel').value, 10) || 2;
            if (!word) { alert(t('adminWall.wordlistPlaceholder', '输入敏感词')); return; }

            btn.disabled = true;
            sb.from('ai_wordlist').insert([{ word: word, category: cat, level: lv, enabled: true }])
                .then(function (r) {
                    btn.disabled = false;
                    if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                    document.getElementById('wordlistWord').value = '';
                    loadAiWordlist();
                });
        });
    }

    /* ============================================================
     *  ④ 动态管理
     * ============================================================ */
    function loadWallPosts() {
        var body = document.getElementById('wallPostsBody');
        var badge = document.getElementById('badgeWallPosts');
        if (!body) return;
        var status = document.getElementById('wallPostsStatus').value;
        body.innerHTML = '<tr><td colspan="7" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';

        var q = sb.from('posts').select('*').order('created_at', { ascending: false }).limit(100);
        if (status !== 'all') q = q.eq('status', status);

        q.then(function (res) {
            if (res.error) {
                body.innerHTML = '<tr><td colspan="7" class="empty">' + t('common.loadFailed','加载失败') + '：' + esc(res.error.message) + '</td></tr>';
                return;
            }
            var data = res.data || [];
            allPosts = data;
            badge.textContent = data.length + ' ' + (t('wall.badgeCount',' 条').trim() || '条');

            if (!data.length) {
                body.innerHTML = '<tr><td colspan="7" class="empty">' + t('adminWall.postsEmpty','暂无动态') + '</td></tr>';
                return;
            }

            var userIds = [];
            data.forEach(function (p) { if (p.user_id && userIds.indexOf(p.user_id) === -1) userIds.push(p.user_id); });

            sb.from('profiles').select('id, uid, email, full_name, avatar_url').in('id', userIds)
                .then(function (pr) {
                    var users = {};
                    (pr.data || []).forEach(function (u) { users[u.id] = u; });

                    var html = '';
                    data.forEach(function (p) {
                        var u = users[p.user_id] || {};
                        var avatar = u.avatar_url || DEFAULT_AVATAR;
                        var statusTag = '';
                        if (p.status === 'pending')   statusTag = '<span class="status-tag pending">' + t('adminWall.postsStatusPending','待审核') + '</span>';
                        if (p.status === 'published') statusTag = '<span class="status-tag active">'  + t('adminWall.postsStatusPublished','已发布') + '</span>';
                        if (p.status === 'hidden')    statusTag = '<span class="status-tag blocked">' + t('adminWall.postsStatusHidden','已隐藏') + '</span>';
                        if (p.status === 'deleted')   statusTag = '<span class="status-tag blocked">deleted</span>';
                        if (p.status === 'rejected')  statusTag = '<span class="status-tag blocked">rejected</span>';

                        var pinBtn     = p.is_pinned   ? '<button class="action-btn block pin-btn" data-id="' + p.id + '">' + t('adminWall.postsUnpin','取消置顶') + '</button>'
                                                       : '<button class="action-btn edit pin-btn" data-id="' + p.id + '">'  + t('adminWall.postsPin','📌 置顶') + '</button>';
                        var featureBtn = p.is_featured ? '<button class="action-btn block feature-btn" data-id="' + p.id + '">' + t('adminWall.postsUnfeature','取消加精') + '</button>'
                                                       : '<button class="action-btn edit feature-btn" data-id="' + p.id + '">'  + t('adminWall.postsFeature','✨ 加精') + '</button>';
                        var approveBtn = p.status === 'pending'
                            ? '<button class="action-btn unblock approve-btn" data-id="' + p.id + '">' + t('adminWall.postsApprove','✓ 通过') + '</button>' +
                              '<button class="action-btn block reject-btn" data-id="' + p.id + '">'  + t('adminWall.postsReject','✗ 驳回') + '</button>'
                            : '';

                        html += '<tr>' +
                            '<td><div class="user-cell">' +
                                '<img class="user-avatar" src="' + esc(avatar) + '" onerror="this.src=\'' + DEFAULT_AVATAR + '\'">' +
                                '<div style="display:flex;flex-direction:column;">' +
                                    '<span>' + esc(u.full_name || u.email || '—') + '</span>' +
                                    '<span style="font-size:0.78em;color:var(--theme-text-faint);">' + (u.uid ? 'UID ' + u.uid : '') + '</span>' +
                                '</div>' +
                            '</div></td>' +
                            '<td style="max-width:280px;word-break:break-word;">' + esc((p.content || '').slice(0, 80)) + ((p.content || '').length > 80 ? '…' : '') + '</td>' +
                            '<td>' + statusTag + '</td>' +
                            '<td>' + (p.like_count || 0) + '</td>' +
                            '<td>' + (p.comment_count || 0) + '</td>' +
                            '<td style="white-space:nowrap;">' + fmtTime(p.created_at) + '</td>' +
                            '<td style="white-space:nowrap;">' +
                                approveBtn + pinBtn + featureBtn +
                                '<button class="action-btn del del-post-btn" data-id="' + p.id + '">' + t('adminWall.postsDelete','🗑 删除') + '</button>' +
                            '</td>' +
                        '</tr>';
                    });
                    body.innerHTML = html;

                    body.querySelectorAll('.approve-btn').forEach(function (b) {
                        b.onclick = function () { updatePostStatus(this.getAttribute('data-id'), 'published'); };
                    });
                    body.querySelectorAll('.reject-btn').forEach(function (b) {
                        b.onclick = function () { updatePostStatus(this.getAttribute('data-id'), 'rejected'); };
                    });
                    body.querySelectorAll('.pin-btn').forEach(function (b) {
                        b.onclick = function () {
                            var id = this.getAttribute('data-id');
                            var cur = allPosts.find(function (x) { return String(x.id) === String(id); });
                            sb.from('posts').update({ is_pinned: !cur.is_pinned }).eq('id', id).then(function () { loadWallPosts(); });
                        };
                    });
                    body.querySelectorAll('.feature-btn').forEach(function (b) {
                        b.onclick = function () {
                            var id = this.getAttribute('data-id');
                            var cur = allPosts.find(function (x) { return String(x.id) === String(id); });
                            sb.from('posts').update({ is_featured: !cur.is_featured }).eq('id', id).then(function () { loadWallPosts(); });
                        };
                    });
                    body.querySelectorAll('.del-post-btn').forEach(function (b) {
                        b.onclick = function () {
                            if (!confirm(t('adminWall.postsDeleteConfirm', '确定永久删除这条动态吗？'))) return;
                            var id = this.getAttribute('data-id');
                            sb.from('posts').delete().eq('id', id).then(function (r) {
                                if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                                loadWallPosts();
                            });
                        };
                    });
                });
        });
    }

    function updatePostStatus(id, status) {
        sb.from('posts').update({ status: status, reviewed_at: new Date().toISOString() }).eq('id', id)
            .then(function (r) {
                if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                loadWallPosts();
            });
    }

    /* ============================================================
     *  ⑤ 用户信任度
     * ============================================================ */
    function loadAiTrust() {
        var body = document.getElementById('aiTrustBody');
        var badge = document.getElementById('badgeAiTrust');
        if (!body) return;
        body.innerHTML = '<tr><td colspan="6" class="loading">' + t('common.loading', '加载中...') + '</td></tr>';

        sb.from('ai_user_trust').select('*').order('trust_score', { ascending: true }).limit(100)
            .then(function (res) {
                if (res.error) {
                    body.innerHTML = '<tr><td colspan="6" class="empty">' + t('common.loadFailed','加载失败') + '：' + esc(res.error.message) + '</td></tr>';
                    return;
                }
                var data = res.data || [];
                badge.textContent = data.length + ' ' + (t('wall.badgeCount',' 条').trim() || '条');

                if (!data.length) {
                    body.innerHTML = '<tr><td colspan="6" class="empty">暂无信任度记录</td></tr>';
                    return;
                }

                var uids = data.map(function (r) { return r.user_id; });
                sb.from('profiles').select('id, uid, email, full_name').in('id', uids).then(function (pr) {
                    var users = {};
                    (pr.data || []).forEach(function (u) { users[u.id] = u; });

                    var html = '';
                    data.forEach(function (r) {
                        var u = users[r.user_id] || {};
                        var scoreClass = r.trust_score < 40 ? 'blocked' : (r.trust_score < 60 ? 'pending' : 'active');
                        html += '<tr>' +
                            '<td>' + (u.uid || '—') + '</td>' +
                            '<td>' + esc(u.full_name || u.email || '—') + '</td>' +
                            '<td><span class="status-tag ' + scoreClass + '">' + (r.trust_score || 0) + '</span></td>' +
                            '<td>' + (r.total_violations || 0) + '</td>' +
                            '<td>' + (r.forced_manual ? '<span class="status-tag blocked">✓</span>' : '—') + '</td>' +
                            '<td><button class="action-btn edit trust-adjust-btn" data-id="' + r.user_id + '" data-score="' + r.trust_score + '">' + t('adminWall.trustAdjust','调整') + '</button></td>' +
                        '</tr>';
                    });
                    body.innerHTML = html;

                    body.querySelectorAll('.trust-adjust-btn').forEach(function (b) {
                        b.onclick = function () {
                            var uid = this.getAttribute('data-id');
                            var cur = this.getAttribute('data-score');
                            var delta = prompt(t('adminWall.trustDeltaLabel','增减（正加负减）') + '（当前 ' + cur + '）', '0');
                            if (delta === null) return;
                            delta = parseInt(delta, 10) || 0;
                            if (delta === 0) return;
                            sb.rpc('ai_trust_delta', { p_user_id: uid, p_delta: delta, p_reason: 'admin adjust' })
                                .then(function (r) {
                                    if (r.error) { alert(t('common.fail','操作失败') + '：' + r.error.message); return; }
                                    loadAiTrust();
                                });
                        };
                    });
                });
            });
    }

    /* ============================================================
     *  ⑥ AI 成本监控
     * ============================================================ */
    function loadAiCost() {
        var statEl = document.getElementById('aiCostStats');
        var chartEl = document.getElementById('aiCostChart');
        var badge  = document.getElementById('badgeAiCost');
        if (!statEl) return;
        statEl.innerHTML = '<div class="empty">' + t('common.loading', '加载中...') + '</div>';

        var since30 = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
        sb.from('ai_logs').select('*').gte('created_at', since30).order('created_at', { ascending: false })
            .then(function (res) {
                if (res.error) {
                    statEl.innerHTML = '<div class="empty">' + t('common.loadFailed','加载失败') + '：' + esc(res.error.message) + '</div>';
                    return;
                }
                var data = res.data || [];
                allLogs = data;
                badge.textContent = data.length + ' ' + (t('wall.badgeCount',' 条').trim() || '条');

                var now = new Date();
                var todayStr = now.toISOString().slice(0, 10);
                var weekAgo = new Date(now.getTime() - 7 * 86400 * 1000);
                var monthAgo = new Date(now.getTime() - 30 * 86400 * 1000);

                var todayCost = 0, weekCost = 0, monthCost = 0, totalCalls = 0, totalLatency = 0;
                var dayMap = {};

                data.forEach(function (l) {
                    var c = Number(l.cost_usd || 0);
                    var d = new Date(l.created_at);
                    var dStr = l.created_at.slice(0, 10);
                    monthCost += c;
                    if (d >= weekAgo) weekCost += c;
                    if (dStr === todayStr) todayCost += c;
                    if (l.latency_ms) { totalLatency += l.latency_ms; totalCalls++; }
                    dayMap[dStr] = (dayMap[dStr] || 0) + c;
                });

                var avgLatency = totalCalls ? Math.round(totalLatency / totalCalls) : 0;

                var stats = [
                    { k: t('adminWall.costToday','今日消耗'), v: '$' + todayCost.toFixed(4) },
                    { k: t('adminWall.costWeek','本周消耗'), v: '$' + weekCost.toFixed(4) },
                    { k: t('adminWall.costMonth','本月消耗'), v: '$' + monthCost.toFixed(4) },
                    { k: t('adminWall.costTotalCalls','总调用次数'), v: String(data.length) },
                    { k: t('adminWall.costAvgLatency','平均耗时'), v: avgLatency + t('adminWall.costMsUnit', ' ms') }
                ];

                statEl.innerHTML = '<div class="stat-grid">' + stats.map(function (s) {
                    return '<div class="stat-box"><span class="label">' + s.k + '</span><span class="value">' + s.v + '</span></div>';
                }).join('') + '</div>';

                // 近 7 天趋势
                if (chartEl) {
                    var days = [];
                    for (var i = 6; i >= 0; i--) {
                        var d = new Date(now.getTime() - i * 86400 * 1000);
                        days.push(d.toISOString().slice(0, 10));
                    }
                    var maxCost = Math.max.apply(null, days.map(function (d) { return dayMap[d] || 0; })) || 1;

                    chartEl.innerHTML = '<div class="cost-bars">' + days.map(function (d) {
                        var c = dayMap[d] || 0;
                        var h = Math.round((c / maxCost) * 100);
                        return '<div class="cost-bar-wrap">' +
                            '<div class="cost-bar" style="height:' + h + '%" title="$' + c.toFixed(4) + '"></div>' +
                            '<div class="cost-bar-label">' + d.slice(5) + '</div>' +
                        '</div>';
                    }).join('') + '</div>';
                }
            });
    }

    /* ============================================================
     *  事件绑定
     * ============================================================ */
/* 刷新按钮统一处理：点击 → 旋转 → 自动停 */
function bindRefreshBtn(btnId, loader) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.add('spinning');
        try { loader(); } catch (e) { console.warn('[admin-wall] refresh error', e); }
        setTimeout(function () {
            btn.disabled = false;
            btn.classList.remove('spinning');
        }, 600);
    });
}

function bindEvents() {
    bindRefreshBtn('refreshAiDecisionsBtn', loadAiDecisions);
    bindRefreshBtn('refreshAiConfigBtn',    loadAiConfig);
    bindRefreshBtn('refreshAiWordlistBtn',  loadAiWordlist);
    bindRefreshBtn('refreshWallPostsBtn',   loadWallPosts);
    bindRefreshBtn('refreshAiTrustBtn',     loadAiTrust);
    bindRefreshBtn('refreshAiCostBtn',      loadAiCost);

    var flt1 = document.getElementById('aiDecisionsFilter');
    if (flt1) flt1.onchange = loadAiDecisions;

    bindWordlistAdd();

    var flt4 = document.getElementById('wallPostsStatus');
    if (flt4) flt4.onchange = loadWallPosts;
}
    /* ============================================================
     *  对外暴露入口（供 admin-dashboard.js 的 switchTab 调用）
     * ============================================================ */
    window.adminWallLoaders = {
        aiDecisions: loadAiDecisions,
        aiConfig:    loadAiConfig,
        aiWordlist:  loadAiWordlist,
        wallPosts:   loadWallPosts,
        aiTrust:     loadAiTrust,
        aiCost:      loadAiCost
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindEvents);
    } else {
        bindEvents();
    }
})();