/* ============================================================
 *  user-dashboard.html 主逻辑（多语言版 + 成就系统）
 * ============================================================ */

/* ============================================================
 *  语言辅助：t() 和 applyLang()
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
    // 更新页面动态内容
    if (typeof refreshDynamicText === 'function') {
        try { refreshDynamicText(); } catch (e) {}
    }
}
window.__udLangChanged = applyLang;   // 语言切换后 hook

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

    var t2 = null;
    var lastMode = isMobile();
    window.addEventListener('resize', function () {
        clearTimeout(t2);
        t2 = setTimeout(function () {
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
var currentUser = null;
var myProfile = null;

var userEmailEl    = document.getElementById('userEmail');
var logoutBtn      = document.getElementById('logoutBtn');
var avatarInput    = document.getElementById('avatarInput');
var avatarImg      = document.getElementById('avatarImg');
var welcomeAvatar  = document.getElementById('welcomeAvatar');
var welcomeTitle   = document.getElementById('welcomeTitle');
var infoEmail      = document.getElementById('infoEmail');
var infoName       = document.getElementById('infoName');
var infoPhone      = document.getElementById('infoPhone');
var infoCreated    = document.getElementById('infoCreated');

supabaseClient.auth.getSession().then(function (res) {
    var session = res.data && res.data.session;
    if (!session) { location.href = 'index.html'; return; }
    bootUser(session.user);
});
supabaseClient.auth.onAuthStateChange(function (event, session) {
    if (event === 'SIGNED_OUT' || !session) location.href = 'index.html';
});

function bootUser(user) {
    currentUser = user;
    var role = user.app_metadata && user.app_metadata.role;

    if (role === 'admin') {
        var navMenu = document.querySelector('.nav-menu');
        if (navMenu && !document.getElementById('adminEntry')) {
            var entry = document.createElement('div');
            entry.id = 'adminEntry';
            entry.className = 'nav-item';
            entry.innerHTML = '<span class="nav-text">' + t('userDash.navAdmin', '🔧 进入管理后台') + '</span>';
            entry.addEventListener('click', function () {
                location.href = 'admin-dashboard.html';
            });
            var mainRow = navMenu.querySelector('.nav-main-row') || navMenu;
            mainRow.appendChild(entry);
        }
        var roleBadge = document.querySelector('.user-name-row .role');
        if (roleBadge) roleBadge.textContent = t('common.admin', '管理员');
    }

    userEmailEl.textContent =
        (user.user_metadata && user.user_metadata.full_name) ||
        user.email || '未知';

    var avatarUrl = (user.user_metadata && user.user_metadata.avatar_url)
        ? user.user_metadata.avatar_url : DEFAULT_AVATAR;
    avatarImg.src = avatarUrl;
    welcomeAvatar.src = avatarUrl;

    supabaseClient.from('profiles').select('*').eq('id', user.id).maybeSingle()
        .then(function (profileRes) {
            myProfile = profileRes.data || {};
            var profile = myProfile;

            userEmailEl.textContent = profile.full_name || user.email || '未知';

            welcomeTitle.textContent = profile.full_name
                ? t('userDash.homeWelcomeName', '欢迎回来，') + profile.full_name
                : t('userDash.homeWelcome', '欢迎回来');

            infoEmail.textContent = user.email || '—';
            infoName.textContent  = profile.full_name || t('userDash.homeNotSet', '未设置');
            infoPhone.textContent = profile.phone || t('userDash.homeNotSet', '未设置');
            infoCreated.textContent = profile.created_at
                ? new Date(profile.created_at).toLocaleString('zh-CN', { hour12: false })
                : '—';

            var userBio = profile.bio || '';
            document.getElementById('infoUid').textContent = profile.uid || t('userDash.homeUidUnassigned', '未分配');
            document.getElementById('infoBio').textContent = userBio || t('userDash.homeNoBio', '暂无简介');
            document.getElementById('welcomeBio').textContent = userBio || t('userDash.homeBioDefault', '这里是你的个人主页');

            document.getElementById('editBioBtn').addEventListener('click', function () {
                document.getElementById('bioInput').value = userBio;
                document.getElementById('bioModal').style.display = 'flex';
            });

            document.getElementById('bioCancelBtn').addEventListener('click', function () {
                document.getElementById('bioModal').style.display = 'none';
            });

            document.getElementById('bioSaveBtn').addEventListener('click', function () {
                var newBio = document.getElementById('bioInput').value.trim();
                if (newBio.length > 50) { alert(t('userDash.homeBioTooLong', '个人简介不能超过50个字')); return; }

                supabaseClient.from('profiles').update({ bio: newBio }).eq('id', user.id).then(function (res) {
                    if (res.error) { alert(t('common.fail', '操作失败') + '：' + res.error.message); return; }
                    userBio = newBio;
                    document.getElementById('infoBio').textContent = newBio || t('userDash.homeNoBio', '暂无简介');
                    document.getElementById('welcomeBio').textContent = newBio || t('userDash.homeBioDefault', '这里是你的个人主页');
                    document.getElementById('bioModal').style.display = 'none';
                    alert(t('userDash.homeBioUpdated', '个人简介已更新！'));
                });
            });

            document.getElementById('editNameBtn').addEventListener('click', function () {
                document.getElementById('nameInput').value = profile.full_name || '';
                document.getElementById('nameModal').style.display = 'flex';
                setTimeout(function () {
                    document.getElementById('nameInput').focus();
                    document.getElementById('nameInput').select();
                }, 50);
            });

            document.getElementById('nameCancelBtn').addEventListener('click', function () {
                document.getElementById('nameModal').style.display = 'none';
            });

            document.getElementById('nameModal').addEventListener('click', function (e) {
                if (e.target === this) this.style.display = 'none';
            });

            document.getElementById('nameSaveBtn').addEventListener('click', function () {
                var newName = document.getElementById('nameInput').value.trim();
                if (newName.length < 2) { alert(t('userDash.homeNameTooShort', '昵称至少 2 个字')); return; }
                if (newName.length > 20) { alert(t('userDash.homeNameTooLong', '昵称最多 20 个字')); return; }

                var btn = this;
                btn.disabled = true;
                btn.textContent = t('common.loading', '加载中...');

                supabaseClient.from('profiles').update({ full_name: newName }).eq('id', user.id)
                    .then(function (res) {
                        if (res.error) throw new Error(res.error.message);
                        return supabaseClient.auth.updateUser({ data: { full_name: newName } });
                    })
                    .then(function () {
                        btn.disabled = false;
                        btn.textContent = t('common.save', '保存');

                        profile.full_name = newName;
                        document.getElementById('infoName').textContent = newName;
                        document.getElementById('welcomeTitle').textContent = t('userDash.homeWelcomeName', '欢迎回来，') + newName;
                        userEmailEl.textContent = newName;

                        document.getElementById('nameModal').style.display = 'none';
                        alert(t('userDash.homeNameUpdated', '昵称已更新！'));
                    })
                    .catch(function (err) {
                        btn.disabled = false;
                        btn.textContent = t('common.save', '保存');
                        alert(t('common.fail', '操作失败') + '：' + ((err && err.message) || err));
                    });
            });

            document.getElementById('myPoints').textContent = profile.points || 0;
            document.getElementById('myStreak').textContent = profile.checkin_streak || 0;

            var todayStr = toDateStr(shanghaiNow());
            supabaseClient.from('checkins')
                .select('points')
                .eq('user_id', user.id)
                .eq('checkin_date', todayStr)
                .maybeSingle()
                .then(function (ckRes) {
                    if (ckRes.data) {
                        var btn = document.getElementById('checkinBtn');
                        btn.textContent = t('userDash.checkinDone', '✓ 今日已签到');
                        btn.disabled = true;
                        document.getElementById('todayReward').textContent =
                            '+' + (ckRes.data.points || 0);
                    }
                });

            loadCheckinCalendar();
            loadMyRank(user.id);
            loadMyPointLogs();
        });
}

var profilePanel = document.getElementById('profilePanel');
var profileArrow = document.getElementById('profileArrow');
document.getElementById('homeNavItem').addEventListener('click', function () {
    switchTab('home');
    profilePanel.classList.toggle('open');
    profileArrow.classList.toggle('open', profilePanel.classList.contains('open'));
});

var msgGroup = document.getElementById('msgGroup');
var msgArrow = document.getElementById('msgArrow');
var msgSub   = document.getElementById('msgSub');
msgGroup.addEventListener('click', function () {
    msgSub.classList.toggle('open');
    msgArrow.classList.toggle('open', msgSub.classList.contains('open'));
    msgGroup.classList.toggle('open', msgSub.classList.contains('open'));
});

var CARDS = {
    home:        'cardHome',
    announce:    'cardAnnounce',
    checkin:     'cardCheckin',
    achievements:'cardAchievements', // ★ 新增
    shop:        'cardShop',
    friends:     'cardFriends',
    theme:       'cardTheme',
    feedback:    'cardFeedback'
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

    if (tab === 'announce') loadAnnouncements();
    if (tab === 'feedback') {
        loadMyFeedbacks();
        if (currentUser) {
            supabaseClient.from('profiles')
                .select('points')
                .eq('id', currentUser.id)
                .maybeSingle()
                .then(function (r) {
                    if (r.data) {
                        var el = document.getElementById('myPoints');
                        if (el) el.textContent = r.data.points || 0;
                    }
                });
        }
    }
    if (tab === 'checkin')  { refreshCheckinUI(); loadCheckinCalendar(); loadMyPointLogs(); checkAndUnlockAchievements('checkin'); } // ★ 触发成就检查
    if (tab === 'achievements') loadMyAchievements(); // ★ 加载成就
    if (tab === 'shop')     loadShop();
    if (tab === 'friends')  loadFriends();

    if (window.syncMobileSubRow) {
        setTimeout(window.syncMobileSubRow, 0);
    }
}

document.querySelectorAll('.nav-item[data-tab]').forEach(function (el) {
    if (el.id === 'homeNavItem') return;
    el.addEventListener('click', function (e) {
        if (e.target.classList.contains('nav-arrow')) return;
        switchTab(this.getAttribute('data-tab'));
    });
});
document.querySelectorAll('.nav-sub-item[data-tab]').forEach(function (el) {
    el.addEventListener('click', function () {
        switchTab(this.getAttribute('data-tab'));
    });
});

function toDateStr(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + dd;
}
function shanghaiNow() {
    var now = new Date();
    return new Date(now.getTime() + (now.getTimezoneOffset() + 480) * 60000);
}

function loadCheckinCalendar() {
    if (!currentUser) return;

    var today = shanghaiNow();
    var dow = today.getDay();
    var diff = dow === 0 ? -6 : 1 - dow;
    var monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    monday.setHours(0, 0, 0, 0);

    var sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);

    var startStr = toDateStr(monday);
    var endStr   = toDateStr(sunday);

    Promise.all([
        supabaseClient.from('checkin_config').select('*').eq('id', 1).maybeSingle(),
        supabaseClient.from('checkins')
            .select('checkin_date, points')
            .eq('user_id', currentUser.id)
            .gte('checkin_date', startStr)
            .lte('checkin_date', endStr)
    ]).then(function (results) {
        var cfg = results[0].data || {};
        var checked = {};
        (results[1].data || []).forEach(function (c) { checked[c.checkin_date] = c.points; });
        renderCalendar(monday, cfg, checked);
    }).catch(function () { renderCalendar(monday, {}, {}); });
}

function renderCalendar(monday, cfg, checked) {
    var names = [
        t('adminDash.pointsMon', '周一'), t('adminDash.pointsTue', '周二'), t('adminDash.pointsWed', '周三'),
        t('adminDash.pointsThu', '周四'), t('adminDash.pointsFri', '周五'), t('adminDash.pointsSat', '周六'),
        t('adminDash.pointsSun', '周日')
    ];
    var keys  = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
    var todayStr = toDateStr(shanghaiNow());

    var html = '';
    for (var i = 0; i < 7; i++) {
        var d = new Date(monday);
        d.setDate(monday.getDate() + i);
        var dateStr = toDateStr(d);
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
    document.getElementById('checkinCalendar').innerHTML = html;
}

function loadAnnouncements() {
    var listEl = document.getElementById('announceList');
    var badge  = document.getElementById('badgeAnnounce');
    listEl.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('announcements').select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                return;
            }
            var data = res.data || [];
            badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '条' : '');
            if (data.length === 0) {
                listEl.innerHTML = '<div class="empty-state">' + t('userDash.announceEmpty', '暂无公告') + '</div>';
                return;
            }
            var html = '';
            data.forEach(function (item) {
                var time = new Date(item.created_at).toLocaleString('zh-CN', { hour12: false });
                html += '<div class="announce-item">' +
                    '<div class="announce-head">' +
                        (item.is_pinned ? '<span class="announce-pinned">' + t('userDash.announcePinned', '📌 置顶') + '</span>' : '') +
                        '<span class="announce-title">' + escapeHtml(item.title) + '</span>' +
                        '<span class="announce-time">' + time + '</span>' +
                    '</div>' +
                    '<div class="announce-content">' + escapeHtml(item.content) + '</div>' +
                '</div>';
            });
            listEl.innerHTML = html;
        });
}

/* ============================================================
 *  ★ 用户端成就系统
 * ============================================================ */
function loadMyAchievements() {
    if (!currentUser) return;
    var grid = document.getElementById('achievementsGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    // 使用 Promise.all 同时查询所有成就配置 + 用户已解锁的成就
    Promise.all([
        supabaseClient.from('achievements').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabaseClient.from('user_achievements').select('*').eq('user_id', currentUser.id)
    ]).then(function (results) {
        if (results[0].error || results[1].error) {
            grid.innerHTML = '<div class="empty-state">加载失败，请稍后重试</div>';
            return;
        }

        var allAch = results[0].data || [];
        var myUnlocked = results[1].data || [];
        
        // 把用户已解锁的成就 ID 存到一个对象里，方便快速查找
        var unlockedMap = {};
        var unlockTimeMap = {};
        myUnlocked.forEach(function (ua) {
            unlockedMap[ua.achievement_id] = true;
            unlockTimeMap[ua.achievement_id] = ua.unlocked_at;
        });

        if (allAch.length === 0) {
            grid.innerHTML = '<div class="empty-state">暂时没有可解锁的成就</div>';
            return;
        }

        var html = '';
        allAch.forEach(function (item) {
            var isUnlocked = !!unlockedMap[item.id];
            var cardClass = isUnlocked ? 'unlocked' : 'locked';
            
            // 如果是已解锁，显示解锁时间；如果是未解锁，显示条件描述
            var footerHtml = '';
            if (isUnlocked) {
                var time = new Date(unlockTimeMap[item.id]).toLocaleDateString('zh-CN');
                footerHtml = '<div class="achieve-time">' + time + ' 解锁</div>';
            } else {
                var typeMap = { 'manual': '手动发放', 'checkin_streak': '连续签到', 'points_reached': '积分达到', 'purchase_count': '兑换次数' };
                var conditionText = typeMap[item.condition_type] || '';
                if (item.condition_value > 0) conditionText += ' ' + item.condition_value + (item.condition_type === 'checkin_streak' ? ' 天' : '');
                footerHtml = '<div class="achieve-time" style="color:var(--theme-accent);">条件：' + conditionText + '</div>';
            }

            html += 
                '<div class="achieve-card ' + cardClass + '">' +
                    '<div class="achieve-icon">' + escapeHtml(item.icon || '🏆') + '</div>' +
                    '<div class="achieve-name">' + escapeHtml(item.name) + '</div>' +
                    '<div class="achieve-desc">' + escapeHtml(item.description || '') + '</div>' +
                    (item.reward_points > 0 ? '<div class="achieve-reward">+' + item.reward_points + ' 积分</div>' : '') +
                    footerHtml +
                '</div>';
        });
        grid.innerHTML = html;
    }).catch(function () {
        grid.innerHTML = '<div class="empty-state">网络错误，加载失败</div>';
    });
}

/* ============================================================
 *  ★ 成就触发检查器（核心逻辑）
 *  actionType: 'checkin' (签到后), 'purchase' (兑换后), 'points' (积分变动时)
 * ============================================================ */
function checkAndUnlockAchievements(actionType) {
    if (!currentUser) return Promise.resolve();
    
    // 获取用户最新的数据
    return supabaseClient.from('profiles').select('points, checkin_streak').eq('id', currentUser.id).maybeSingle()
    .then(function (pRes) {
        if (pRes.error || !pRes.data) return;
        var profile = pRes.data;

        // 获取所有启用中的成就
        return supabaseClient.from('achievements').select('*').eq('is_active', true).then(function (achRes) {
            var achievements = achRes.data || [];
            var unlockPromises = [];

            achievements.forEach(function (ach) {
                var isQualified = false;

                // 判断条件
                if (ach.condition_type === 'checkin_streak' && profile.checkin_streak >= ach.condition_value) {
                    isQualified = true;
                } else if (ach.condition_type === 'points_reached' && profile.points >= ach.condition_value) {
                    isQualified = true;
                }
                
                if (isQualified) {
                    // 使用 upsert 防止重复插入报错
                    var promise = supabaseClient.from('user_achievements')
                        .insert([{ user_id: currentUser.id, achievement_id: ach.id }])
                        .then(function (insertRes) {
                            // 如果没有报错（即之前没领过），就给用户加积分
                            if (!insertRes.error && ach.reward_points > 0) {
                                var newPoints = (profile.points || 0) + ach.reward_points;
                                return supabaseClient.from('profiles').update({ points: newPoints }).eq('id', currentUser.id)
                                .then(function() {
                                    // 写入积分明细
                                    addPointLog(currentUser.id, ach.reward_points, '解锁成就：' + ach.name, null, newPoints);
                                    return { ach: ach, newPoints: newPoints };
                                });
                            }
                            return null;
                        });
                    unlockPromises.push(promise);
                }
            });

            return Promise.all(unlockPromises);
        });
    })
    .then(function (unlockedResults) {
        var unlockedList = unlockedResults.filter(function (r) { return r != null; });
        if (unlockedList.length > 0) {
            // 弹出提示
            unlockedList.forEach(function (item) {
                showToast('🎉 解锁成就：「' + item.ach.name + '」 +' + item.ach.reward_points + ' 积分', 'success');
            });
            // 刷新页面数据
            refreshCheckinUI(); 
            loadMyAchievements();
        }
    }).catch(function (err) {
        console.warn('[成就系统] 检查异常：', err);
    });
}

/* ============================================================
 *  使用反馈
 * ============================================================ */
function loadMyFeedbacks() {
    var listEl = document.getElementById('myFeedbackList');
    var badge  = document.getElementById('badgeFeedback');
    if (!listEl || !currentUser) return;
    listEl.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('feedbacks')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                return;
            }
            var data = res.data || [];
            badge.textContent = data.length + ' ' + (getLang() === 'zh' ? '条' : '');
            if (data.length === 0) {
                listEl.innerHTML = '<div class="empty-state">' + t('userDash.feedbackListEmpty', '📭 暂无反馈记录') + '</div>';
                resetFbSelection();
                return;
            }
            var statusMap = {
                pending:    t('userDash.feedbackStatusPending', '⏳ 待处理'),
                processing: t('userDash.feedbackStatusProcessing', '🔄 处理中'),
                resolved:   t('userDash.feedbackStatusResolved', '✅ 已解决')
            };
            var html = '';
            data.forEach(function (item) {
                var time = new Date(item.created_at).toLocaleString('zh-CN', { hour12: false });
                html += '<div class="feedback-item">' +
                    '<label class="fb-check" title="Select"><input type="checkbox" class="fb-item-check" data-id="' + item.id + '"></label>' +
                    '<div class="fb-main">' +
                        '<div class="feedback-head">' +
                            '<span class="feedback-status ' + item.status + '">' + (statusMap[item.status] || item.status) + '</span>' +
                            ((item.reward_points && item.reward_points > 0)
                                ? '<span class="feedback-reward-tag">+' + item.reward_points + ' ' + (getLang() === 'zh' ? '积分' : 'pts') + '</span>'
                                : '') +
                            '<span class="feedback-time">' + time + '</span>' +
                        '</div>' +
                        '<div class="feedback-content">' + escapeHtml(item.content) + '</div>' +
                        (item.reply ? '<div class="feedback-reply">💬 <b>' + t('userDash.feedbackAdminReply', '💬 管理员回复：') + '</b>' + escapeHtml(item.reply) + '</div>' : '') +
                        '<div class="feedback-actions">' +
                            '<button class="fb-del-btn fb-del" data-id="' + item.id + '">' + t('userDash.feedbackDeleteBtn', '🗑 删除') + '</button>' +
                        '</div>' +
                    '</div>' +
                '</div>';
            });
            listEl.innerHTML = html;
            resetFbSelection();
        });
}

document.getElementById('submitFeedbackBtn').addEventListener('click', function () {
    var content = document.getElementById('feedbackContent').value.trim();
    if (!content) { showToast(t('userDash.feedbackSubmitEmpty', '请填写反馈内容'), 'error'); return; }
    if (!currentUser) { showToast('请先登录', 'error'); return; }

    var btn = this;
    btn.disabled = true;

    supabaseClient.from('feedbacks').insert([{
        user_id: currentUser.id,
        user_email: currentUser.email,
        content: content
    }]).then(function (res) {
        btn.disabled = false;
        if (res.error) { showToast(t('userDash.feedbackSubmitFail', '提交失败：') + res.error.message, 'error'); return; }
        document.getElementById('feedbackContent').value = '';
        showToast(t('userDash.feedbackSubmitSuccess', '反馈提交成功，感谢你的反馈！'), 'success');
        loadMyFeedbacks();
    });
});

document.getElementById('refreshFeedbackBtn').addEventListener('click', function () {
    loadMyFeedbacks();
});

function resetFbSelection() {
    var sa = document.getElementById('fbSelectAll');
    if (sa) sa.checked = false;
    updateFbSelected();
}
function getFbCheckedIds() {
    var ids = [];
    document.querySelectorAll('#myFeedbackList .fb-item-check:checked').forEach(function (c) {
        ids.push(c.getAttribute('data-id'));
    });
    return ids;
}
function updateFbSelected() {
    var ids = getFbCheckedIds();
    var btn = document.getElementById('fbDeleteSelected');
    var cnt = document.getElementById('fbSelectedCount');
    var sa  = document.getElementById('fbSelectAll');
    if (btn) btn.disabled = ids.length === 0;
    if (cnt) cnt.textContent = t('userDash.feedbackSelectedCountTpl', '已选 ') + ids.length + t('userDash.feedbackSelectedCountUnit', ' 条');
    if (sa) {
        var total = document.querySelectorAll('#myFeedbackList .fb-item-check').length;
        sa.checked = total > 0 && ids.length === total;
    }
}
function deleteFbRecords(ids, single) {
    if (!ids.length) return;
    var msg = single
        ? t('userDash.feedbackDeleteConfirm', '确定删除这条反馈吗？删除后不可恢复。')
        : t('userDash.feedbackDeleteConfirmMulti', '确定删除选中的 ') + ids.length + t('userDash.feedbackDeleteConfirmMulti2', ' 条反馈吗？删除后不可恢复。');
    confirmFb(msg).then(function (ok) {
        if (!ok) return;
        var q = supabaseClient.from('feedbacks').delete().select();
        q = single ? q.eq('id', ids[0]) : q.in('id', ids);
        q.then(function (res) {
            if (res.error) { showToast('删除失败：' + res.error.message, 'error'); return; }
            if (!res.data || res.data.length === 0) {
                showToast('删除未生效：反馈表缺少删除权限（RLS 策略）', 'error');
                loadMyFeedbacks();
                return;
            }
            showToast(single ? '已删除该反馈' : '已删除 ' + res.data.length + ' 条反馈', 'success');
            loadMyFeedbacks();
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

document.getElementById('fbSelectAll').addEventListener('change', function () {
    var checked = this.checked;
    document.querySelectorAll('#myFeedbackList .fb-item-check').forEach(function (c) { c.checked = checked; });
    updateFbSelected();
});
document.getElementById('fbDeleteSelected').addEventListener('click', function () {
    deleteFbRecords(getFbCheckedIds(), false);
});
document.getElementById('myFeedbackList').addEventListener('change', function (e) {
    if (e.target && e.target.classList.contains('fb-item-check')) updateFbSelected();
});
document.getElementById('myFeedbackList').addEventListener('click', function (e) {
    var del = e.target.closest ? e.target.closest('.fb-del') : null;
    if (del) deleteFbRecords([del.getAttribute('data-id')], true);
});

function refreshCheckinUI() {
    if (!currentUser) return;
    var today = toDateStr(shanghaiNow());

    Promise.all([
        supabaseClient.from('profiles')
            .select('points, checkin_streak')
            .eq('id', currentUser.id).maybeSingle(),
        supabaseClient.from('checkins')
            .select('checkin_date, points')
            .eq('user_id', currentUser.id)
            .eq('checkin_date', today)
            .maybeSingle()
    ]).then(function (results) {
        var p = results[0].data || {};
        var todayRow = results[1].data;
        var hasCheckedToday = !!todayRow;

        document.getElementById('myPoints').textContent = p.points || 0;
        document.getElementById('myStreak').textContent = p.checkin_streak || 0;

        var btn = document.getElementById('checkinBtn');
        if (hasCheckedToday) {
            btn.textContent = t('userDash.checkinDone', '✓ 今日已签到');
            btn.disabled = true;
            document.getElementById('todayReward').textContent = '+' + (todayRow.points || 0);
        } else {
            btn.textContent = t('userDash.checkinBtn', '签 到');
            btn.disabled = false;
            document.getElementById('todayReward').textContent = '—';
        }

        loadMyRank(currentUser.id);
    });
}

function loadMyRank(userId) {
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
                var el = document.getElementById('myRank');
                if (el) el.textContent = rank + ' / ' + total;
            });
        });
}

document.getElementById('checkinBtn').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = t('common.loading', '加载中...');

    supabaseClient.rpc('do_checkin').then(function (res) {
        if (res.error) {
            alert(t('userDash.checkinFail', '签到失败：') + res.error.message);
            btn.disabled = false;
            btn.textContent = t('userDash.checkinBtn', '签 到');
            return;
        }
        var data = res.data || {};
        if (data.error) {
            alert(data.error);
            refreshCheckinUI();
            loadCheckinCalendar();
            return;
        }
        btn.textContent = t('userDash.checkinDone', '✓ 今日已签到');
        document.getElementById('myPoints').textContent =
            (parseInt(document.getElementById('myPoints').textContent) || 0) + (data.points || 0);
        document.getElementById('myStreak').textContent = data.streak || 0;
        document.getElementById('todayReward').textContent = '+' + (data.points || 0);
        loadCheckinCalendar();

        var _newBal = parseInt(document.getElementById('myPoints').textContent) || 0;
        addPointLog(currentUser.id, data.points, '每日签到', null, _newBal);
        loadMyPointLogs();

        // ★ 触发成就检查
        checkAndUnlockAchievements('checkin');

        alert(t('userDash.checkinSuccess', '签到成功！') + '\n' +
              t('userDash.checkinGotPoints', '获得 ') + data.points + t('userDash.checkinPointsUnit', ' 积分') + '\n' +
              t('userDash.checkinStreakDay', '连续签到 ') + data.streak + t('userDash.checkinStreakDayUnit', ' 天'));
    }).catch(function (err) {
        alert(t('userDash.checkinFail', '签到失败：') + (err.message || err));
        btn.disabled = false;
        btn.textContent = t('userDash.checkinBtn', '签 到');
    });
});

/* ============================================================
 *  积分明细
 * ============================================================ */
function addPointLog(userId, changeAmount, reason, relatedId, balanceAfter) {
    if (!userId || !changeAmount) return Promise.resolve();
    return supabaseClient.from('point_logs').insert([{
        user_id: userId,
        change_amount: changeAmount,
        reason: reason || '积分变化',
        balance_after: balanceAfter != null ? balanceAfter : 0,
        related_id: relatedId || null
    }]).then(function (r) {
        if (r.error) console.warn('[积分日志] 写入失败：', r.error.message);
    });
}

function loadMyPointLogs() {
    var listEl = document.getElementById('myPointLogs');
    if (!listEl || !currentUser) return;
    listEl.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('point_logs')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(30)
        .then(function (res) {
            if (res.error) {
                listEl.innerHTML = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                return;
            }
            var data = res.data || [];
            if (data.length === 0) {
                listEl.innerHTML = '<div class="empty-state">' + t('userDash.checkinLogsEmpty', '📭 暂无积分记录') + '</div>';
                return;
            }
            var html = '';
            data.forEach(function (log) {
                var isPlus = log.change_amount > 0;
                var icon = isPlus ? '📈' : '📉';
                var sign = isPlus ? '+' : '';
                var time = new Date(log.created_at).toLocaleString('zh-CN', { hour12: false });
                html += '<div class="point-log-item">' +
                    '<div class="pl-icon ' + (isPlus ? 'plus' : 'minus') + '">' + icon + '</div>' +
                    '<div class="pl-info">' +
                        '<div class="pl-reason">' + escapeHtml(log.reason) + '</div>' +
                        '<div class="pl-time">' + time + '</div>' +
                    '</div>' +
                    '<div class="pl-change ' + (isPlus ? 'plus' : 'minus') + '">' +
                        sign + log.change_amount +
                    '</div>' +
                '</div>';
            });
            listEl.innerHTML = html;
        });
}

/* 刷新按钮 */
(function () {
    var btn = document.getElementById('refreshMyPointLogsBtn');
    if (!btn) return;
    btn.addEventListener('click', function () {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.classList.add('spinning');
        loadMyPointLogs();
        setTimeout(function () {
            btn.disabled = false;
            btn.classList.remove('spinning');
        }, 800);
    });
})();

/* ============================================================
 *  语言切换 hook（LangHelper 触发后调用）
 * ============================================================ */
function refreshDynamicText() {
    // 刷新签到日历里的星期名
    try { loadCheckinCalendar(); } catch (e) {}
    // 若当前是商城/好友页面，重新加载列表
    try {
        var shopCard = document.getElementById('cardShop');
        if (shopCard && shopCard.classList.contains('active')) loadShop();
        var friendsCard = document.getElementById('cardFriends');
        if (friendsCard && friendsCard.classList.contains('active')) loadFriends();
        var annCard = document.getElementById('cardAnnounce');
        if (annCard && annCard.classList.contains('active')) loadAnnouncements();
        var fbCard = document.getElementById('cardFeedback');
        if (fbCard && fbCard.classList.contains('active')) loadMyFeedbacks();
        var logEl = document.getElementById('myPointLogs');
        if (logEl) loadMyPointLogs();
    } catch (e) {}
}
window.refreshDynamicText = refreshDynamicText;

/* escapeHtml 提前定义，后面用到 */
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
/* ============================================================
 *  积分商城
 * ============================================================ */
function loadShop() {
    if (!currentUser) return;

    supabaseClient.from('profiles').select('points').eq('id', currentUser.id).maybeSingle()
        .then(function (r) {
            var p = (r.data && r.data.points) || 0;
            document.getElementById('shopMyPoints').textContent = t('userDash.shopMyPoints', '积分：') + p;
        });

    var grid = document.getElementById('shopGrid');
    grid.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('shop_items').select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false })
        .then(function (res) {
            if (res.error) {
                grid.innerHTML = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + escapeHtml(res.error.message) + '</div>';
                return;
            }
            var items = res.data || [];
            if (items.length === 0) {
                grid.innerHTML = '<div class="empty-state">' + t('userDash.shopEmpty', '暂时没有商品') + '</div>';
                return;
            }

            var html = '';
            items.forEach(function (it) {
                var soldOut = (it.stock === 0);
                var stockTag = '';
                if (it.stock > 0) stockTag = '<span class="shop-item-stock">' + t('userDash.shopStockLeft', '仅剩 ') + it.stock + '</span>';
                else if (it.stock === 0) stockTag = '<span class="shop-item-stock">' + t('userDash.shopSoldOut', '已售罄') + '</span>';

                var limitTag = '';
                if (it.per_user_limit != null && it.per_user_limit > 0) {
                    limitTag = '<div class="shop-item-limit">' + t('userDash.shopLimitPerUser', '每人限购 ') + it.per_user_limit + t('userDash.shopLimitUnit', ' 份') + '</div>';
                }

                html +=
                    '<div class="shop-item' + (soldOut ? ' out-of-stock' : '') + '" data-id="' + it.id + '">' +
                        stockTag +
                        '<div class="shop-item-icon">' + escapeHtml(it.icon || '🎁') + '</div>' +
                        '<div class="shop-item-name">' + escapeHtml(it.name) + '</div>' +
                        '<div class="shop-item-desc">' + escapeHtml(it.description || '') + '</div>' +
                        limitTag +
                        '<div class="shop-item-price">' + it.price + t('userDash.shopPointsUnit', ' 积分') + '</div>' +
                        '<button class="shop-buy-btn" data-id="' + it.id + '" data-name="' + escapeHtml(it.name) + '" data-price="' + it.price + '"' + (soldOut ? ' disabled' : '') + '>' +
                            (soldOut ? t('userDash.shopSoldOut', '已售罄') : t('userDash.shopBuyNow', '立即兑换')) +
                        '</button>' +
                    '</div>';
            });
            grid.innerHTML = html;

            grid.querySelectorAll('.shop-buy-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var id = this.getAttribute('data-id');
                    var name = this.getAttribute('data-name');
                    var price = parseInt(this.getAttribute('data-price'), 10);
                    doPurchase(id, name, price);
                });
            });
        });

    var hist = document.getElementById('shopHistory');
    hist.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('user_purchases').select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(20)
        .then(function (res) {
            if (res.error) {
                hist.innerHTML = '<div class="empty-state">' + t('common.loadFailed', '加载失败：') + '</div>';
                return;
            }
            var list = res.data || [];
            if (list.length === 0) {
                hist.innerHTML = '<div class="empty-state">' + t('userDash.shopHistoryEmpty', '暂无记录') + '</div>';
                return;
            }
            var h = '';
            list.forEach(function (p) {
                var time = new Date(p.created_at).toLocaleString('zh-CN', { hour12: false });
                h +=
                    '<div class="shop-history-item" style="cursor:pointer;" ' +
                        'data-id="'     + p.id + '" ' +
                        'data-name="'   + escapeHtml(p.item_name  || t('userDash.detailUnknown', '未知商品')) + '" ' +
                        'data-icon="'   + escapeHtml(p.item_icon  || '🎁')      + '" ' +
                        'data-image="'  + escapeHtml(p.item_image || '')        + '" ' +
                        'data-detail="' + escapeHtml(p.item_detail || t('userDash.detailNoDetail', '暂无详情')) + '" ' +
                        'data-price="'  + (p.price_paid || 0) + '" ' +
                        'data-time="'   + time + '">' +
                        '<span class="h-icon">' + escapeHtml(p.item_icon || '🎁') + '</span>' +
                        '<div class="h-info">' +
                            '<div class="h-name">' + escapeHtml(p.item_name || t('userDash.detailUnknown', '未知商品')) + '</div>' +
                            '<div class="h-time">' + time + '</div>' +
                        '</div>' +
                        '<span class="h-price">-' + (p.price_paid || 0) + '</span>' +
                    '</div>';
            });
            hist.innerHTML = h;

            hist.querySelectorAll('.shop-history-item').forEach(function (el) {
                el.addEventListener('click', function () {
                    var id     = this.getAttribute('data-id');
                    var name   = this.getAttribute('data-name');
                    var icon   = this.getAttribute('data-icon');
                    var image  = this.getAttribute('data-image');
                    var detail = this.getAttribute('data-detail');
                    var price  = this.getAttribute('data-price');
                    var time   = this.getAttribute('data-time');

                    document.getElementById('detailName').textContent  = name;
                    document.getElementById('detailPrice').textContent = '-' + price;
                    document.getElementById('detailTime').textContent  = time;
                    document.getElementById('detailDesc').textContent  = detail;
                    document.getElementById('detailDeleteBtn').dataset.purchaseId = id;

                    var imgEl      = document.getElementById('detailImage');
                    var fallbackEl = document.getElementById('detailIconFallback');
                    if (image) {
                        imgEl.src = image;
                        imgEl.style.display = 'block';
                        fallbackEl.style.display = 'none';
                    } else {
                        imgEl.style.display = 'none';
                        fallbackEl.style.display = 'flex';
                        fallbackEl.textContent = icon;
                    }

                    document.getElementById('itemDetailModal').style.display = 'flex';
                });
            });
        });
}

function doPurchase(itemId, itemName, price) {
    if (!currentUser) return;

    var topPointsEl = document.getElementById('shopMyPoints');
    var currentPoints = parseInt((topPointsEl.textContent || '').replace(/\D/g, ''), 10) || 0;
    if (currentPoints < price) {
        alert(t('userDash.shopInsufficientPoints', '积分不足，还差 ') + (price - currentPoints) + t('userDash.shopPointUnit', ' 分'));
        return;
    }

    var confirmMsg = t('userDash.shopConfirmBuy', '确定用 ') + price + t('userDash.shopConfirmBuy2', ' 积分兑换「') + itemName + t('userDash.shopConfirmBuy3', '」吗？');
    if (!confirm(confirmMsg)) return;

    supabaseClient.rpc('purchase_item', { p_item_id: itemId })
        .then(function (res) {
            if (res.error) {
                alert(t('userDash.shopBuyFail', '兑换失败：') + res.error.message);
                return;
            }
            var data = res.data || {};
            if (data.error) {
                alert(data.error);
                return;
            }
            if (typeof data.newPoints === 'number') {
                topPointsEl.textContent = t('userDash.shopMyPoints', '积分：') + data.newPoints;
                var myPts = document.getElementById('myPoints');
                if (myPts) myPts.textContent = data.newPoints;
            }

            addPointLog(currentUser.id, -data.points, t('adminDash.purchasesTitle', '兑换：') + itemName, null, data.newPoints);

            // ★ 触发成就检查
            checkAndUnlockAchievements('purchase');

            alert(t('userDash.shopBuySuccess', '兑换成功！') + '\n' +
                  t('userDash.shopCost', '消耗 ') + data.points + t('userDash.shopPointsUnit', ' 积分') + '\n' +
                  t('userDash.shopRemain', '剩余 ') + data.newPoints + t('userDash.shopPointsUnit', ' 积分'));
            loadShop();
        })
        .catch(function (err) {
            alert(t('userDash.shopBuyFail', '兑换失败：') + (err.message || err));
        });
}

/* 刷新商城 */
(function () {
    var b = document.getElementById('refreshUserShopBtn');
    if (!b) return;
    b.addEventListener('click', function () {
        b.classList.add('spinning');
        loadShop();
        setTimeout(function () { b.classList.remove('spinning'); }, 500);
    });
})();

/* ============================================================
 *  好友系统
 * ============================================================ */
var friendsCache = [];
var currentChatFriend = null;
var chatPollTimer = null;

function loadFriends() {
    if (!currentUser) return;

    var pendingList = document.getElementById('pendingList');
    var friendList  = document.getElementById('friendList');
    var badge       = document.getElementById('badgeFriends');

    pendingList.innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';
    friendList.innerHTML  = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';

    supabaseClient.from('friendships').select('*')
        .or('user_id.eq.' + currentUser.id + ',friend_id.eq.' + currentUser.id)
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
                if (f.status === 'pending' && f.friend_id === currentUser.id) {
                    pendingFromOthers.push(f);
                } else if (f.status === 'accepted') {
                    friendIds.push(f.user_id === currentUser.id ? f.friend_id : f.user_id);
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
                            ph += renderFriendItem(u, f.id, true);
                        });
                        pendingList.innerHTML = ph;
                        bindPendingActions();
                    }

                    friendsCache = friendIds.map(function (id) { return map[id]; }).filter(Boolean);
                    if (friendsCache.length === 0) {
                        friendList.innerHTML = '<div class="empty-state">' + t('userDash.friendsEmpty', '还没有好友，输入邮箱添加吧~') + '</div>';
                    } else {
                        var fh = '';
                        friendsCache.forEach(function (u) {
                            fh += renderFriendItem(u, null, false);
                        });
                        friendList.innerHTML = fh;
                        bindFriendClicks();
                    }
                });
        });
}

function renderFriendItem(user, fsId, isPending) {
    var avatar = user.avatar_url || DEFAULT_AVATAR;
    var name = user.full_name || user.email || '未知';
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

function bindPendingActions() {
    document.querySelectorAll('#pendingList .friend-item.pending').forEach(function (item) {
        var fsId = item.getAttribute('data-fsid');
        item.querySelector('.accept-btn').addEventListener('click', function () {
            supabaseClient.from('friendships').update({ status: 'accepted' }).eq('id', fsId)
                .then(function (r) {
                    if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
                    loadFriends();
                });
        });
        item.querySelector('.reject-btn').addEventListener('click', function () {
            if (!confirm(t('userDash.friendsRejectConfirm', '确定拒绝该好友请求吗？'))) return;
            supabaseClient.from('friendships').delete().eq('id', fsId)
                .then(function (r) {
                    if (r.error) { alert(t('common.fail', '操作失败') + '：' + r.error.message); return; }
                    loadFriends();
                });
        });
    });
}

function bindFriendClicks() {
    document.querySelectorAll('#friendList .friend-item[data-uid]').forEach(function (item) {
        if (item.classList.contains('pending')) return;
        item.addEventListener('click', function () {
            var uid = this.getAttribute('data-uid');
            var friend = friendsCache.find(function (u) { return u.id === uid; });
            if (friend) openChat(friend);
        });
    });
}

document.getElementById('addFriendBtn').addEventListener('click', function () {
    var input = document.getElementById('friendEmailInput');
    var email = input.value.trim().toLowerCase();
    if (!email) { alert('请输入对方邮箱'); return; }
    if (email === (currentUser.email || '').toLowerCase()) {
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
                btn.textContent = t('userDash.friendsAddBtn', '➕ 添加好友');
                alert(t('userDash.friendsAddNoUser', '找不到这个邮箱的用户'));
                return;
            }

            var targetId = res.data.id;

            supabaseClient.from('friendships').select('*')
                .or('and(user_id.eq.' + currentUser.id + ',friend_id.eq.' + targetId + '),and(user_id.eq.' + targetId + ',friend_id.eq.' + currentUser.id + ')')
                .maybeSingle()
                .then(function (fRes) {
                    if (fRes.data) {
                        btn.disabled = false;
                        btn.textContent = t('userDash.friendsAddBtn', '➕ 添加好友');
                        if (fRes.data.status === 'accepted') alert(t('userDash.friendsAddAlready', '你们已经是好友了'));
                        else if (fRes.data.user_id === currentUser.id) alert(t('userDash.friendsAddSent', '已发送过请求，等待对方同意'));
                        else alert(t('userDash.friendsAddCameIn', '对方已经向你发起了请求，去"待处理"里同意吧'));
                        return;
                    }

                    supabaseClient.from('friendships').insert([{
                        user_id: currentUser.id,
                        friend_id: targetId,
                        status: 'pending'
                    }]).then(function (iRes) {
                        btn.disabled = false;
                        btn.textContent = t('userDash.friendsAddBtn', '➕ 添加好友');
                        if (iRes.error) { alert(t('userDash.friendsAddFail', '添加失败：') + iRes.error.message); return; }
                        input.value = '';
                        alert(t('userDash.friendsAddSuccess', '好友请求已发送！'));
                        loadFriends();
                    });
                });
        });
});

function openChat(friend) {
    currentChatFriend = friend;
    lastMsgTs = null;
    document.getElementById('chatFriendName').textContent = friend.full_name || friend.email;
    document.getElementById('chatFriendAvatar').src = friend.avatar_url || DEFAULT_AVATAR;
    document.getElementById('chatModal').style.display = 'flex';
    document.getElementById('chatBody').innerHTML = '<div class="empty-state">' + t('common.loading', '加载中...') + '</div>';
    loadMessages();

    if (chatPollTimer) clearInterval(chatPollTimer);
    chatPollTimer = setInterval(loadMessages, 3000);
    setTimeout(function () { document.getElementById('chatInput').focus(); }, 100);
}

function closeChat() {
    document.getElementById('chatModal').style.display = 'none';
    if (chatPollTimer) { clearInterval(chatPollTimer); chatPollTimer = null; }
    currentChatFriend = null;
    lastMsgTs = null;
}

document.getElementById('chatCloseBtn').addEventListener('click', closeChat);
document.getElementById('chatModal').addEventListener('click', function (e) {
    if (e.target === this) closeChat();
});

var lastMsgTs = null;

function loadMessages() {
    if (!currentUser || !currentChatFriend) return;

    supabaseClient.from('messages').select('*')
        .or('and(from_user.eq.' + currentUser.id + ',to_user.eq.' + currentChatFriend.id + '),and(from_user.eq.' + currentChatFriend.id + ',to_user.eq.' + currentUser.id + ')')
        .order('created_at', { ascending: true })
        .then(function (res) {
            if (res.error) return;
            var data = res.data || [];
            var body = document.getElementById('chatBody');

            if (data.length === 0) {
                body.innerHTML = '<div class="empty-state">' + t('userDash.chatEmpty', '还没有聊天记录，说点什么吧~') + '</div>';
                return;
            }

            var latestFromFriend = null;
            data.forEach(function (m) {
                if (m.from_user !== currentUser.id) {
                    if (!latestFromFriend || new Date(m.created_at) > new Date(latestFromFriend)) {
                        latestFromFriend = m.created_at;
                    }
                }
            });
            if (latestFromFriend) {
                var isFirst = (lastMsgTs === null);
                if (!isFirst && new Date(latestFromFriend) > new Date(lastMsgTs)) {
                    if (window.LoginSound && window.LoginSound.playMessageIfEnabled) {
                        window.LoginSound.playMessageIfEnabled();
                    }
                }
                lastMsgTs = latestFromFriend;
            }

            var html = '';
            data.forEach(function (m) {
                var mine = m.from_user === currentUser.id;
                var time = new Date(m.created_at).toLocaleString('zh-CN', { hour12: false });
                html += '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + '">' +
                    escapeHtml(m.content) +
                    '<span class="chat-time">' + time + '</span>' +
                '</div>';
            });
            body.innerHTML = html;
            body.scrollTop = body.scrollHeight;

            var unreadIds = data.filter(function (m) { return m.to_user === currentUser.id && !m.is_read; })
                                .map(function (m) { return m.id; });
            if (unreadIds.length > 0) {
                supabaseClient.from('messages').update({ is_read: true }).in('id', unreadIds).then(function () {});
            }
        });
}

function sendMessage() {
    if (!currentUser || !currentChatFriend) return;
    var input = document.getElementById('chatInput');
    var content = input.value.trim();
    if (!content) return;

    var btn = document.getElementById('chatSendBtn');
    btn.disabled = true;

    supabaseClient.from('messages').insert([{
        from_user: currentUser.id,
        to_user: currentChatFriend.id,
        content: content
    }]).then(function (res) {
        btn.disabled = false;
        if (res.error) { alert(t('userDash.chatSendFail', '发送失败：') + res.error.message); return; }
        input.value = '';
        loadMessages();
    });
}

document.getElementById('chatSendBtn').addEventListener('click', sendMessage);
document.getElementById('chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') sendMessage();
});

/* ============================================================
 *  头像上传
 * ============================================================ */
document.getElementById('avatarChangeBtn').addEventListener('click', function () {
    document.getElementById('avatarInput').click();
});

avatarInput.addEventListener('change', function (e) {
    var file = e.target.files[0];
    if (!file) return;
    var inputEl = this;

    if (file.size > 5 * 1024 * 1024) { alert('头像文件大小不能超过 5 MB！'); inputEl.value = ''; return; }
    if (!file.type.startsWith('image/')) { alert('请上传图片文件！'); inputEl.value = ''; return; }

    supabaseClient.auth.getUser().then(function (userRes) {
        if (userRes.error || !userRes.data.user) { alert('获取用户信息失败'); return; }
        var userId = userRes.data.user.id;

        var storageKey = 'last_avatar_upload_' + userId;
        var lastUpload = localStorage.getItem(storageKey);
        if (lastUpload) {
            var elapsed = Date.now() - parseInt(lastUpload, 10);
            var oneHour = 60 * 60 * 1000;
            if (elapsed < oneHour) {
                var remainingMin = Math.ceil((oneHour - elapsed) / 60000);
                alert('头像修改过于频繁\n请 ' + remainingMin + ' 分钟后再试');
                inputEl.value = '';
                return;
            }
        }

        var fileExt = file.name.split('.').pop();
        var filePath = userId + '/' + Date.now() + '.' + fileExt;

        supabaseClient.storage.from('avatars')
            .upload(filePath, file, { upsert: true })
            .then(function (uploadRes) {
                if (uploadRes.error) { alert('头像上传失败：' + uploadRes.error.message); return; }
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
                        avatarImg.src = signedUrl;
                        welcomeAvatar.src = signedUrl;
                        alert('头像更新成功！');
                    });
            });
    });
});

/* ============================================================
 *  退出登录
 * ============================================================ */
logoutBtn.addEventListener('click', function () {
    if (chatPollTimer) clearInterval(chatPollTimer);
    supabaseClient.auth.signOut().then(function () { location.href = 'index.html'; });
});

/* ============================================================
 *  兑换记录详情弹窗 + 删除
 * ============================================================ */
(function () {
    var modal     = document.getElementById('itemDetailModal');
    var btnClose  = document.getElementById('detailCloseBtn');
    var btnDelete = document.getElementById('detailDeleteBtn');

    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === modal) modal.style.display = 'none';
        });
    }
    if (btnClose) {
        btnClose.addEventListener('click', function () {
            modal.style.display = 'none';
        });
    }
    if (btnDelete) {
        btnDelete.addEventListener('click', function () {
            var id = this.dataset.purchaseId;
            if (!id) return;
            if (!confirm(t('userDash.detailDeleteConfirm', '确定删除这条兑换记录吗？删除后不可恢复。'))) return;

            supabaseClient.from('user_purchases').delete().eq('id', id)
                .then(function (r) {
                    if (r.error) { alert('删除失败：' + r.error.message); return; }
                    modal.style.display = 'none';
                    loadShop();
                });
        });
    }
})();

/* ============================================================
 *  初次加载 + 应用语言
 * ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(applyLang, 100);
});