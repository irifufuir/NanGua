/* ============================================================
 *  ju-bounce.js · 虎 v2
 *  内嵌登录 · 排行榜 · 防刷分
 * ============================================================ */
(function () {
    'use strict';

    /* ---------- 配置 ---------- */
    var scriptEl = document.currentScript || (function () {
        var all = document.getElementsByTagName('script');
        return all[all.length - 1];
    })();
    var CFG = {
        mode: (scriptEl && scriptEl.getAttribute('data-mode')) || 'fullscreen',
        size: parseInt((scriptEl && scriptEl.getAttribute('data-size')) || '150', 10)
    };

    /* ---------- 常量 ---------- */
    var BASE_SPEED_CHILL = 3.5;
    var BASE_SPEED_CHAOS = 5;
    var CORNER_TOLERANCE = 20;
    var STORAGE_HIGHSCORE  = 'jufufuHighscore';
    var STORAGE_SIZE_SCALE = 'jufufuSizeScale';
    var SCRIPT_BASE = (function () {
        if (!scriptEl || !scriptEl.src) return 'other/ju-bounce/';
        return scriptEl.src.replace(/ju-bounce\.js.*$/, '');
    })();

    /* ---------- 状态 ---------- */
    var posX = 100, posY = 100;
    var velX = BASE_SPEED_CHILL, velY = BASE_SPEED_CHILL;
    var isChaos = false;
    var bounceCount = 0;
    var cornerHits = 0;
    var chaosClickCount = 0;
    var lastCornerHitTime = 0;
    var highScore = Number(localStorage.getItem(STORAGE_HIGHSCORE)) || 0;
    var remoteHighScore = 0;
    var currentUser = null;
    var gameSessionId = null;
    var audioUnlocked = false;
    var overlaysDisabled = false;
    var rafId = null;
    var lastFrame = 0;
    var syncTimer = null;

    /* ---------- DOM ---------- */
    var root, jufufu, statsBox, toggleBtn, volumeControl, volumeIcon;
    var bgm, cornerSFX, chaosSFX, chaosflare, bounceSFX;
    var volumeSliderBGM, volumeSliderSFX;
    var sizeSlider, sizeValue, sizeControl;
    var leaderboardBtn, logoutBtn, devBtn;
    var lbMask, lbList, lbBox, lbLoginBox;
    var lbEmail, lbPwd, lbTip, lbLoginBtn;

    /* ---------- 工具 ---------- */
    function el(tag, attrs, styles) {
        var n = document.createElement(tag);
        if (attrs) Object.keys(attrs).forEach(function (k) {
            if (k === 'text') n.textContent = attrs[k];
            else if (k === 'html') n.innerHTML = attrs[k];
            else n.setAttribute(k, attrs[k]);
        });
        if (styles) Object.keys(styles).forEach(function (k) { n.style[k] = styles[k]; });
        return n;
    }

    function esc(s) {
        if (s == null) return '';
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getSb() { return window.supabaseClient || null; }

    /* ============================================================
     *  登录 / 退出 / 会话
     * ============================================================ */
    function updateAuthUI() {
        // 右上角退出按钮：登录才显示
        if (logoutBtn) logoutBtn.style.display = currentUser ? '' : 'none';
        // 弹窗底部登录区：未登录才显示
        if (lbLoginBox) lbLoginBox.style.display = currentUser ? 'none' : '';
    }

    function loadUserAndScore() {
        var sb = getSb();
        if (!sb) return Promise.resolve();

        return sb.auth.getSession().then(function (res) {
            var s = res.data && res.data.session;
            if (!s || !s.user) {
                currentUser = null;
                updateAuthUI();
                updateStats();
                return;
            }
            currentUser = s.user;
            updateAuthUI();

            return sb.from('jufufu_scores')
                .select('high_score')
                .eq('user_id', currentUser.id)
                .maybeSingle()
                .then(function (r) {
                    if (!r.error && r.data) {
                        remoteHighScore = r.data.high_score || 0;
                        if (remoteHighScore > highScore) {
                            highScore = remoteHighScore;
                            try { localStorage.setItem(STORAGE_HIGHSCORE, String(highScore)); } catch (e) {}
                        }
                    }
                    updateStats();
                    return startGameSession();
                });
        }).catch(function (e) {
            console.warn('[ju-bounce] 读取用户失败:', e);
        });
    }

    function startGameSession() {
        var sb = getSb();
        if (!sb || !currentUser) return Promise.resolve();

        return sb.rpc('jufufu_start_game').then(function (r) {
            if (r.error || !r.data) {
                console.warn('[ju-bounce] 创建会话失败:', r.error && r.error.message);
                return;
            }
            gameSessionId = r.data;
        });
    }

    function submitScore(score) {
        if (!currentUser || !gameSessionId) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(function () {
            var sb = getSb();
            if (!sb) return;

            sb.rpc('jufufu_submit_score', {
                p_session_id: gameSessionId,
                p_score: score
            }).then(function (r) {
                if (r.error) {
                    console.warn('[ju-bounce] 提交失败:', r.error.message);
                    return;
                }
                var data = r.data || {};
                if (!data.ok) {
                    console.warn('[ju-bounce] 分数被拒:', data.reason);
                    showJuToast('⚠️ 分数异常，未计入排行榜', 'error');
                    return;
                }
                remoteHighScore = data.new_high || score;
                updateStats();
            });
        }, 800);
    }

    /* ============================================================
     *  内嵌登录（弹窗底部）
     * ============================================================ */
    function doInlineLogin() {
        var email = (lbEmail.value || '').trim();
        var pwd   = lbPwd.value || '';

        if (!email || !pwd) {
            lbTip.textContent = '请输入邮箱和密码';
            lbTip.className = 'ju-lb-login-tip show error';
            return;
        }

        var sb = getSb();
        if (!sb) return;

        lbLoginBtn.disabled = true;
        lbLoginBtn.textContent = '登录中…';
        lbTip.className = 'ju-lb-login-tip';

        sb.auth.signInWithPassword({ email: email, password: pwd })
            .then(function (res) {
                lbLoginBtn.disabled = false;
                lbLoginBtn.textContent = '登 录';

                if (res.error) {
                    var msg = res.error.message || '登录失败';
                    if (/invalid login credentials/i.test(msg)) msg = '邮箱或密码错误';
                    else if (/banned/i.test(msg))               msg = '账号已被封禁';
                    else if (/not confirmed/i.test(msg))        msg = '邮箱未验证';
                    else if (/rate limit/i.test(msg))           msg = '请求过于频繁';
                    lbTip.textContent = msg;
                    lbTip.className = 'ju-lb-login-tip show error';
                    return;
                }

                lbTip.textContent = '✓ 登录成功';
                lbTip.className = 'ju-lb-login-tip show success';

                lbEmail.value = '';
                lbPwd.value = '';

                loadUserAndScore().then(function () {
                    refreshLeaderboard();
                });
            })
            .catch(function (err) {
                lbLoginBtn.disabled = false;
                lbLoginBtn.textContent = '登 录';
                lbTip.textContent = (err && err.message) || '网络错误';
                lbTip.className = 'ju-lb-login-tip show error';
            });
    }

    function doLogout() {
        if (!confirm('确定退出登录吗？')) return;
        var sb = getSb();
        if (!sb) return;

        sb.auth.signOut().then(function () {
            currentUser = null;
            gameSessionId = null;
            remoteHighScore = 0;
            updateAuthUI();
            updateStats();
            closeLeaderboard();
            showJuToast('已退出登录', 'success');
        });
    }

    /* ============================================================
     *  排行榜
     * ============================================================ */
    function openLeaderboard() {
        if (!lbMask) return;
        lbMask.classList.add('show');
        lbList.innerHTML = '<div id="ju-lb-empty">加载中…</div>';
        if (lbTip) { lbTip.textContent = ''; lbTip.className = 'ju-lb-login-tip'; }
        updateAuthUI();
        refreshLeaderboard();
    }

    function closeLeaderboard() {
        if (lbMask) lbMask.classList.remove('show');
    }

    function refreshLeaderboard() {
        var sb = getSb();
        if (!sb) {
            lbList.innerHTML = '<div id="ju-lb-empty">未连接服务器</div>';
            return;
        }
        sb.rpc('get_jufufu_leaderboard', { p_limit: 20 }).then(function (r) {
            if (r.error) {
                lbList.innerHTML = '<div id="ju-lb-empty">加载失败：' + esc(r.error.message) + '</div>';
                return;
            }
            renderLeaderboard(r.data || []);
        }).catch(function () {
            lbList.innerHTML = '<div id="ju-lb-empty">网络错误</div>';
        });
    }

    function renderLeaderboard(rows) {
        if (!rows.length) {
            lbList.innerHTML = '<div id="ju-lb-empty">还没有人上榜，去玩一局吧~</div>';
            return;
        }
        var myId = currentUser ? currentUser.id : null;
        var fallbackAvatar = SCRIPT_BASE + 'img/Jufu1.gif';
        var html = '';

        rows.forEach(function (row, i) {
            var rank = i + 1;
            var rankCls = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
            var medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
            var isMe = myId && row.user_id === myId;
            var name = row.full_name || ('UID ' + (row.uid || '?'));
            var avatar = row.avatar_url || fallbackAvatar;

            html += '<div class="ju-lb-row' + (isMe ? ' is-me' : '') + '">' +
                '<div class="ju-lb-rank ' + rankCls + '">' + medal + '</div>' +
                '<img class="ju-lb-avatar" src="' + esc(avatar) +
                    '" onerror="this.src=\'' + fallbackAvatar + '\'">' +
                '<div class="ju-lb-name">' + esc(name) + '</div>' +
                '<div class="ju-lb-score">' + (row.high_score || 0) + '</div>' +
            '</div>';
        });
        lbList.innerHTML = html;
    }

    /* ============================================================
     *  Toast
     * ============================================================ */
    function showJuToast(msg, type) {
        var t = document.getElementById('juToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'juToast';
            document.body.appendChild(t);
        }
        t.className = 'ju-toast show ' + (type || '');
        t.textContent = msg;
        clearTimeout(t._t);
        t._t = setTimeout(function () { t.classList.remove('show'); }, 2400);
    }

    /* ============================================================
     *  构建 DOM
     * ============================================================ */
    function build() {
        root = el('div', { id: 'ju-bounce-root' });
        root.setAttribute('data-mode', CFG.mode);

        // 小老虎
        jufufu = el('img', {
            id: 'jufufu',
            src: SCRIPT_BASE + 'img/Jufu1.gif',
            alt: 'Jufufu',
            draggable: 'false'
        });
        jufufu.style.width = CFG.size + 'px';
        root.appendChild(jufufu);

        // 分数条
        statsBox = el('div', { class: 'ju-stats', html: 'Bounces: 0<br>Corners Hit: 0' });
        root.appendChild(statsBox);

        // 左下：音量 + 大小
        var bottomLeft = el('div', { id: 'ju-bottom-left' });

        volumeControl = el('div', { id: 'ju-volume-control' });
        volumeIcon = el('img', { id: 'volume-icon', src: SCRIPT_BASE + 'img/volumeMuted.png' });
        var sliders = el('div', { id: 'ju-volume-sliders' });
        var lblBGM = el('label', { for: 'volume-slider-bgm', text: 'BGM' });
        volumeSliderBGM = el('input', {
            type: 'range', id: 'volume-slider-bgm',
            min: '0', max: '1', step: '0.01', value: '0'
        });
        var lblSFX = el('label', { for: 'volume-slider-sfx', text: 'BONK' });
        volumeSliderSFX = el('input', {
            type: 'range', id: 'volume-slider-sfx',
            min: '0', max: '1', step: '0.01', value: '0'
        });
        sliders.appendChild(lblBGM);
        sliders.appendChild(volumeSliderBGM);
        sliders.appendChild(lblSFX);
        sliders.appendChild(volumeSliderSFX);
        volumeControl.appendChild(volumeIcon);
        volumeControl.appendChild(sliders);
        bottomLeft.appendChild(volumeControl);

        sizeControl = el('div', { id: 'ju-size-control' });
        var sizeLabel = el('label', { for: 'size-slider', text: '大小' });
        sizeSlider = el('input', {
            type: 'range', id: 'size-slider',
            min: '0.2', max: '5', step: '0.1', value: '1'
        });
        sizeValue = el('span', { id: 'size-value', text: '1.0×' });
        sizeControl.appendChild(sizeLabel);
        sizeControl.appendChild(sizeSlider);
        sizeControl.appendChild(sizeValue);
        bottomLeft.appendChild(sizeControl);

        root.appendChild(bottomLeft);

        // 右下：Chaos
        var bottomRight = el('div', { id: 'ju-bottom-right' });
        toggleBtn = el('button', { id: 'chaos-toggle', text: 'Toggle Chaos Mode' });
        bottomRight.appendChild(toggleBtn);
        root.appendChild(bottomRight);

        // 右上：排行榜 + 退出 + 开发者
        var topRight = el('div', { id: 'ju-top-right' });

        leaderboardBtn = el('button', { id: 'ju-leaderboard-btn', text: '🏆 排行榜' });
        logoutBtn = el('button', { id: 'ju-logout-btn', text: '👤 退出' });
        logoutBtn.style.display = 'none';
        devBtn = el('button', { id: 'ju-dev-disable', text: '×' });

        topRight.appendChild(leaderboardBtn);
        topRight.appendChild(logoutBtn);
        topRight.appendChild(devBtn);
        root.appendChild(topRight);

        // 排行榜弹窗
        lbMask = el('div', { id: 'ju-lb-mask' });
        lbBox = el('div', { id: 'ju-lb-box' });

        var lbHead = el('div', { id: 'ju-lb-head' });
        var lbTitle = el('h3', { text: '🏆 排行榜 · TOP 20' });
        var lbClose = el('button', { id: 'ju-lb-close', text: '✕' });
        lbHead.appendChild(lbTitle);
        lbHead.appendChild(lbClose);

        lbList = el('div', { id: 'ju-lb-list' });

        // 内嵌登录区
        lbLoginBox = el('div', { id: 'ju-lb-login-box' });
        var lbLoginTitle = el('div', { class: 'ju-lb-login-title', text: '登录后分数即可上榜' });

        lbEmail = el('input', {
            type: 'email', id: 'ju-lb-email',
            placeholder: '邮箱', autocomplete: 'username'
        });
        lbPwd = el('input', {
            type: 'password', id: 'ju-lb-pwd',
            placeholder: '密码', autocomplete: 'current-password'
        });
        lbTip = el('div', { class: 'ju-lb-login-tip' });
        lbLoginBtn = el('button', { id: 'ju-lb-login-btn', text: '登 录' });

        lbLoginBox.appendChild(lbLoginTitle);
        lbLoginBox.appendChild(lbEmail);
        lbLoginBox.appendChild(lbPwd);
        lbLoginBox.appendChild(lbTip);
        lbLoginBox.appendChild(lbLoginBtn);

        lbBox.appendChild(lbHead);
        lbBox.appendChild(lbList);
        lbBox.appendChild(lbLoginBox);
        lbMask.appendChild(lbBox);

        // 音频
        bgm        = el('audio', { src: SCRIPT_BASE + 'audio/bgm1.mp3',         preload: 'auto', loop: '' });
        cornerSFX  = el('audio', { src: SCRIPT_BASE + 'audio/JuFufuRoar.mp3' });
        chaosSFX   = el('audio', { src: SCRIPT_BASE + 'audio/chaos.mp3' });
        chaosflare = el('audio', { src: SCRIPT_BASE + 'audio/chaosflare3.mp3',  preload: 'auto', loop: '' });
        bounceSFX  = el('audio', { src: SCRIPT_BASE + 'audio/JuFuBonk.mp3' });
        [bgm, cornerSFX, chaosSFX, chaosflare, bounceSFX].forEach(function (a) {
            root.appendChild(a);
        });

        document.body.appendChild(root);
        document.body.appendChild(lbMask);
    }

    /* ============================================================
     *  音量 / 大小
     * ============================================================ */
    function updateVolumeIcon(vol) {
        volumeIcon.src = vol === 0
            ? SCRIPT_BASE + 'img/volumeMuted.png'
            : SCRIPT_BASE + 'img/volume.png';
    }

    function setBGMVolume(vol) {
        bgm.volume = vol;
        chaosflare.volume = vol;
        updateVolumeIcon(vol);
    }

    function setSFXVolume(vol) {
        bounceSFX.volume = vol;
    }

    function unlockAudio() {
        if (audioUnlocked) return;
        audioUnlocked = true;
        bgm.muted = false;
        chaosflare.muted = false;

        if (!isChaos) {
            bgm.currentTime = 0;
            bgm.loop = true;
            bgm.play().catch(function () {});
            chaosflare.pause();
        } else {
            chaosflare.currentTime = 0;
            chaosflare.loop = true;
            chaosflare.play().catch(function () {});
            bgm.pause();
        }
        setBGMVolume(parseFloat(volumeSliderBGM.value));
        setSFXVolume(parseFloat(volumeSliderSFX.value));
    }

    function applySize(scale) {
        scale = Math.max(0.2, Math.min(5, scale));
        jufufu.style.width = (CFG.size * scale) + 'px';
        sizeValue.textContent = scale.toFixed(1) + '×';
        sizeSlider.value = scale;
        try { localStorage.setItem(STORAGE_SIZE_SCALE, String(scale)); } catch (e) {}
        clampToViewport();
    }

    function clampToViewport() {
        var w = jufufu.offsetWidth;
        var h = jufufu.offsetHeight;
        var sw = root.clientWidth;
        var sh = root.clientHeight;
        if (posX + w > sw) posX = Math.max(0, sw - w);
        if (posY + h > sh) posY = Math.max(0, sh - h);
        if (posX < 0) posX = 0;
        if (posY < 0) posY = 0;
        jufufu.style.left = posX + 'px';
        jufufu.style.top  = posY + 'px';
    }

    /* ============================================================
     *  分数显示 / 物理循环
     * ============================================================ */
    function updateStats() {
        var best = Math.max(highScore, remoteHighScore);
        var html = 'Bounces: ' + bounceCount + '<br>Corners Hit: ' + cornerHits;
        if (cornerHits > 0 || best > 0) {
            html += '<br>🏆 High Score: ' + best;
        }
        statsBox.innerHTML = html;
    }

    function tick(now) {
        var delta = lastFrame ? (now - lastFrame) / 16.67 : 1;
        lastFrame = now;
        if (delta > 4) delta = 4;

        var w = jufufu.offsetWidth;
        var h = jufufu.offsetHeight;
        var sw = root.clientWidth;
        var sh = root.clientHeight;

        posX += velX * delta;
        posY += velY * delta;

        var bouncedX = false, bouncedY = false;

        if (posX + w >= sw) { posX = sw - w; velX *= -1; bouncedX = true; }
        else if (posX <= 0) { posX = 0; velX *= -1; bouncedX = true; }

        if (posY + h >= sh) { posY = sh - h; velY *= -1; bouncedY = true; }
        else if (posY <= 0) { posY = 0; velY *= -1; bouncedY = true; }

        if (bouncedX || bouncedY) onBounce();

        jufufu.style.left = posX + 'px';
        jufufu.style.top  = posY + 'px';

        rafId = requestAnimationFrame(tick);
    }

    function onBounce() {
        bounceCount++;
        updateStats();

        var randomFactor = function () { return (Math.random() - 0.5) * 1.5; };
        velX += randomFactor();
        velY += randomFactor();

        var speed = Math.sqrt(velX * velX + velY * velY);
        var baseSpeed = isChaos ? BASE_SPEED_CHAOS : BASE_SPEED_CHILL;
        velX = (velX / speed) * baseSpeed;
        velY = (velY / speed) * baseSpeed;

        var tol = CORNER_TOLERANCE;
        var isLeft   = posX <= tol;
        var isRight  = posX + jufufu.offsetWidth >= root.clientWidth - tol;
        var isTop    = posY <= tol;
        var isBottom = posY + jufufu.offsetHeight >= root.clientHeight - tol;
        var nearCorner = (isLeft || isRight) && (isTop || isBottom);

        var now = Date.now();
        var timeSinceLastHit = now - lastCornerHitTime;

        if (!nearCorner) {
            bounceSFX.currentTime = 0;
            bounceSFX.play().catch(function () {});
        }

        if (nearCorner) {
            var addedPoints = 1;
            if (timeSinceLastHit < 500) {
                addedPoints = Math.random() < 0.3 ? 2 : 1;
            }
            cornerHits += addedPoints;
            lastCornerHitTime = now;
            updateStats();
            cornerSFX.currentTime = 0;
            cornerSFX.play().catch(function () {});

            jufufu.style.filter = 'brightness(2)';
            setTimeout(function () { jufufu.style.filter = 'none'; }, 150);

            var best = Math.max(highScore, remoteHighScore);
            if (cornerHits > best) {
                highScore = cornerHits;
                try { localStorage.setItem(STORAGE_HIGHSCORE, String(highScore)); } catch (e) {}

                statsBox.style.boxShadow = '0 0 10px gold';
                setTimeout(function () { statsBox.style.boxShadow = 'none'; }, 500);

                submitScore(cornerHits);
            }
        }
    }

    /* ============================================================
     *  事件绑定
     * ============================================================ */
    function bindEvents() {
        // 大小
        sizeSlider.addEventListener('input', function () {
            applySize(parseFloat(this.value));
        });

        // 音量
        volumeSliderBGM.addEventListener('input', function () {
            setBGMVolume(parseFloat(this.value));
            unlockAudio();
        });
        volumeSliderSFX.addEventListener('input', function () {
            setSFXVolume(parseFloat(this.value));
            unlockAudio();
        });

        // 静音切换
        volumeIcon.addEventListener('click', function () {
            var isMuted = volumeSliderBGM.value === '0' && volumeSliderSFX.value === '0';
            volumeSliderBGM.value = isMuted ? '0.5' : '0';
            volumeSliderSFX.value = isMuted ? '0.5' : '0';
            volumeSliderBGM.dispatchEvent(new Event('input'));
            volumeSliderSFX.dispatchEvent(new Event('input'));
        });

        // 点小老虎
        jufufu.addEventListener('click', function () {
            unlockAudio();
            bounceSFX.currentTime = 0;
            bounceSFX.play().catch(function () {});
        });

        // Chaos
        toggleBtn.addEventListener('click', function () {
            isChaos = !isChaos;
            jufufu.src = isChaos
                ? SCRIPT_BASE + 'img/Jufu2.gif'
                : SCRIPT_BASE + 'img/Jufu1.gif';
            toggleBtn.textContent = isChaos ? 'Return to Chill Mode' : 'Toggle Chaos Mode';

            var newSpeed = isChaos ? BASE_SPEED_CHAOS : 2;
            var sp = Math.sqrt(velX * velX + velY * velY);
            velX = (velX / sp) * newSpeed;
            velY = (velY / sp) * newSpeed;

            chaosSFX.currentTime = 0;
            chaosSFX.play().catch(function () {});

            if (isChaos) {
                bgm.pause();
                chaosflare.muted = false;
                chaosflare.currentTime = 0;
                chaosflare.loop = true;
                chaosflare.play().catch(function () {});
            } else {
                chaosflare.pause();
                chaosflare.loop = false;
                bgm.muted = false;
                bgm.currentTime = 0;
                bgm.loop = true;
                bgm.play().catch(function () {});
            }
            unlockAudio();
        });

        // 排行榜
        leaderboardBtn.addEventListener('click', openLeaderboard);
        document.getElementById('ju-lb-close').addEventListener('click', closeLeaderboard);
        lbMask.addEventListener('click', function (e) {
            if (e.target === lbMask) closeLeaderboard();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeLeaderboard();
        });

        // 内嵌登录
        lbLoginBtn.addEventListener('click', doInlineLogin);
        lbPwd.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') doInlineLogin();
        });
        lbEmail.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') lbPwd.focus();
        });

        // 退出
        logoutBtn.addEventListener('click', doLogout);

        // 开发者按钮
        devBtn.addEventListener('click', function () {
            overlaysDisabled = !overlaysDisabled;
            var d = overlaysDisabled ? 'none' : '';
            statsBox.style.display       = d;
            volumeControl.style.display  = d;
            sizeControl.style.display    = d;
            toggleBtn.style.display      = d;
            leaderboardBtn.style.display = d;
            if (logoutBtn) {
                logoutBtn.style.display = overlaysDisabled ? 'none' : (currentUser ? '' : 'none');
            }
        });

        // wiggle 动画
        setTimeout(function () {
            toggleBtn.style.animation = 'juWiggle 0.3s ease-in-out infinite alternate';
        }, 5000);
        var style = document.createElement('style');
        style.textContent = '@keyframes juWiggle { from { transform: rotate(-2deg); } to { transform: rotate(2deg); } }';
        document.head.appendChild(style);
    }

    /* ============================================================
     *  启动
     * ============================================================ */
    function init() {
        if (document.getElementById('ju-bounce-root')) return;
        build();

        bgm.volume = 0.3;
        chaosflare.volume = 0.2;
        cornerSFX.volume = 0.9;
        chaosSFX.volume = 1.0;
        bounceSFX.volume = 0.1;
        bgm.muted = true;
        chaosflare.muted = true;
        bgm.play().catch(function () {});
        chaosflare.pause();

        volumeSliderBGM.value = '0';
        volumeSliderSFX.value = '0';
        updateVolumeIcon(0);

        var savedScale = parseFloat(localStorage.getItem(STORAGE_SIZE_SCALE));
        applySize(isNaN(savedScale) ? 1 : savedScale);

        bindEvents();
        updateStats();

        // 异步拉取用户信息（自动判断登录态）
        loadUserAndScore();

        lastFrame = 0;
        rafId = requestAnimationFrame(tick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();