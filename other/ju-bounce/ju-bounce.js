/* ============================================================
 *  ju-bounce.js · 弹跳小老虎（移植自 Wallpaper Engine 版）
 *  用法：在 </body> 前引入本文件即可，自动注入 DOM
 *  可选：<script src="..." data-mode="widget" data-size="180"></script>
 * ============================================================ */
(function () {
    'use strict';

    /* ---------- 从 <script> 读配置 ---------- */
    var scriptEl = document.currentScript || (function () {
        var all = document.getElementsByTagName('script');
        return all[all.length - 1];
    })();
    var CFG = {
        mode:    (scriptEl && scriptEl.getAttribute('data-mode')) || 'fullscreen',
        size:    parseInt((scriptEl && scriptEl.getAttribute('data-size')) || '150', 10),
        muteByDefault: true
    };

    /* ---------- 常量 ---------- */
    var BASE_SPEED_CHILL = 3.5;
    var BASE_SPEED_CHAOS = 5;
    var CORNER_TOLERANCE = 20;
    var STORAGE_HIGHSCORE   = 'jufufuHighscore';
    var STORAGE_SIZE_SCALE  = 'jufufuSizeScale';
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
    var audioUnlocked = false;
    var overlaysDisabled = false;
    var rafId = null;
    var lastFrame = 0;

    /* ---------- DOM ---------- */
    var root, jufufu, statsBox, toggleBtn, volumeControl, volumeIcon;
    var bgm, cornerSFX, chaosSFX, chaosflare, bounceSFX;
    var volumeSliderBGM, volumeSliderSFX;
    var sizeSlider, sizeValue, sizeControl;   /* ★ 新增声明 */

    /* ---------- 工具 ---------- */
    function $(sel, p) { return (p || document).querySelector(sel); }

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

    /* ---------- 构建 DOM ---------- */
    function build() {
        root = el('div', { id: 'ju-bounce-root' });
        root.setAttribute('data-mode', CFG.mode);

        // 小老虎
        jufufu = el('img', {
            id: 'jufufu',
            src: SCRIPT_BASE + 'img/Jufu1.gif',
            alt: 'Jufufu bouncing',
            draggable: 'false'
        });
        jufufu.style.width = CFG.size + 'px';
        root.appendChild(jufufu);

        // 分数条
        statsBox = el('div', { class: 'ju-stats', html: 'Bounces: 0<br>Corners Hit: 0' });
        root.appendChild(statsBox);

        // 左下容器：先音量，后大小 → 音量在上，大小在下
        var bottomLeft = el('div', { id: 'ju-bottom-left' });

        // —— 音量面板 ——
        volumeControl = el('div', { id: 'ju-volume-control' });
        volumeIcon = el('img', { id: 'volume-icon', src: SCRIPT_BASE + 'img/volumeMuted.png' });
        var sliders = el('div', { id: 'ju-volume-sliders' });
        var lblBGM = el('label', { for: 'volume-slider-bgm', text: 'BGM' });
        volumeSliderBGM = el('input', {
            type: 'range', id: 'volume-slider-bgm', min: '0', max: '1', step: '0.01', value: '0'
        });
        var lblSFX = el('label', { for: 'volume-slider-sfx', text: 'BONK' });
        volumeSliderSFX = el('input', {
            type: 'range', id: 'volume-slider-sfx', min: '0', max: '1', step: '0.01', value: '0'
        });
        sliders.appendChild(lblBGM);
        sliders.appendChild(volumeSliderBGM);
        sliders.appendChild(lblSFX);
        sliders.appendChild(volumeSliderSFX);
        volumeControl.appendChild(volumeIcon);
        volumeControl.appendChild(sliders);
        bottomLeft.appendChild(volumeControl);

        // —— 大小面板 ——
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

        // 右下：Chaos 按钮
        var bottomRight = el('div', { id: 'ju-bottom-right' });
        toggleBtn = el('button', { id: 'chaos-toggle', text: 'Toggle Chaos Mode' });
        bottomRight.appendChild(toggleBtn);
        root.appendChild(bottomRight);

        // 右上：开发者按钮
        var topRight = el('div', { id: 'ju-top-right' });
        var devBtn = el('button', { id: 'ju-dev-disable', text: '×' });
        topRight.appendChild(devBtn);
        root.appendChild(topRight);

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
    }

    /* ---------- 音量控制 ---------- */
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
            bgm.play().catch(function (e) { console.log('BGM blocked:', e); });
            chaosflare.pause();
        } else {
            chaosflare.currentTime = 0;
            chaosflare.loop = true;
            chaosflare.play().catch(function (e) { console.log('Chaos BGM blocked:', e); });
            bgm.pause();
        }
        setBGMVolume(parseFloat(volumeSliderBGM.value));
        setSFXVolume(parseFloat(volumeSliderSFX.value));
    }

    /* ---------- 大小控制 ---------- */
    function applySize(scale) {
        scale = Math.max(0.2, Math.min(5, scale));
        jufufu.style.width = (CFG.size * scale) + 'px';
        sizeValue.textContent = scale.toFixed(1) + '×';
        sizeSlider.value = scale;
        try { localStorage.setItem(STORAGE_SIZE_SCALE, String(scale)); } catch (e) {}
        // 缩放后立刻夹回视口内，避免老虎跑出边界
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

    /* ---------- 分数 ---------- */
    function updateStats() {
        var html = 'Bounces: ' + bounceCount + '<br>Corners Hit: ' + cornerHits;
        if (cornerHits > 0 || highScore > 0) {
            html += '<br>🏆 High Score: ' + highScore;
        }
        statsBox.innerHTML = html;
    }

    /* ---------- 物理循环 ---------- */
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

        if (posX + w >= sw) {
            posX = sw - w; velX *= -1; bouncedX = true;
        } else if (posX <= 0) {
            posX = 0; velX *= -1; bouncedX = true;
        }

        if (posY + h >= sh) {
            posY = sh - h; velY *= -1; bouncedY = true;
        } else if (posY <= 0) {
            posY = 0; velY *= -1; bouncedY = true;
        }

        if (bouncedX || bouncedY) onBounce(bouncedX, bouncedY);

        jufufu.style.left = posX + 'px';
        jufufu.style.top = posY + 'px';

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

        var nearCorner = function () {
            var tol = CORNER_TOLERANCE;
            var isLeft = posX <= tol;
            var isRight = posX + jufufu.offsetWidth >= root.clientWidth - tol;
            var isTop = posY <= tol;
            var isBottom = posY + jufufu.offsetHeight >= root.clientHeight - tol;
            return (isLeft || isRight) && (isTop || isBottom);
        };

        var now = Date.now();
        var timeSinceLastHit = now - lastCornerHitTime;

        if (!nearCorner()) {
            bounceSFX.currentTime = 0;
            bounceSFX.play().catch(function () {});
        }

        if (nearCorner()) {
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

            if (cornerHits > highScore) {
                highScore = cornerHits;
                localStorage.setItem(STORAGE_HIGHSCORE, highScore);
                statsBox.style.boxShadow = '0 0 10px gold';
                setTimeout(function () { statsBox.style.boxShadow = 'none'; }, 500);
            }
        }
    }

    /* ---------- 事件绑定 ---------- */
    function bindEvents() {
        // ★ 大小滑块：实时改宽度
        sizeSlider.addEventListener('input', function () {
            applySize(parseFloat(this.value));
        });

        // 音量滑块
        volumeSliderBGM.addEventListener('input', function () {
            setBGMVolume(parseFloat(this.value));
            unlockAudio();
        });
        volumeSliderSFX.addEventListener('input', function () {
            setSFXVolume(parseFloat(this.value));
            unlockAudio();
        });

        // 音量图标点击：一键静音/恢复
        volumeIcon.addEventListener('click', function () {
            var isMuted = volumeSliderBGM.value === '0' && volumeSliderSFX.value === '0';
            volumeSliderBGM.value = isMuted ? '0.5' : '0';
            volumeSliderSFX.value = isMuted ? '0.5' : '0';
            volumeSliderBGM.dispatchEvent(new Event('input'));
            volumeSliderSFX.dispatchEvent(new Event('input'));
        });

        // 点小老虎：解锁音频 + 播 BONK
        jufufu.addEventListener('click', function () {
            unlockAudio();
            bounceSFX.currentTime = 0;
            bounceSFX.play().catch(function () {});
        });

        // Chaos 按钮
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
                chaosflare.play().catch(function (e) { console.log('Chaos BGM blocked:', e); });
            } else {
                chaosflare.pause();
                chaosflare.loop = false;
                bgm.muted = false;
                bgm.currentTime = 0;
                bgm.loop = true;
                bgm.play().catch(function (e) { console.log('BGM blocked:', e); });
            }

            chaosClickCount++;
            if (chaosClickCount >= 2) {
                toggleBtn.style.transition = 'transform 0.2s ease';
                toggleBtn.style.animation = 'none';
                toggleBtn.style.transform = 'rotate(0deg)';
            }
            unlockAudio();
        });

        // 开发者按钮：隐藏所有 UI（保留小老虎）
        var devBtn = document.getElementById('ju-dev-disable');
        devBtn.addEventListener('click', function () {
            overlaysDisabled = !overlaysDisabled;
            var d = overlaysDisabled ? 'none' : '';
            statsBox.style.display     = d;
            volumeControl.style.display = d;
            sizeControl.style.display  = d;   /* ★ 新增 */
            toggleBtn.style.display    = d;
        });

        // 5 秒后给 chaos 按钮加摇摆
        setTimeout(function () {
            toggleBtn.style.animation = 'juWiggle 0.3s ease-in-out infinite alternate';
        }, 5000);

        // 注入 wiggle 动画
        var style = document.createElement('style');
        style.textContent = '@keyframes juWiggle { from { transform: rotate(-2deg); } to { transform: rotate(2deg); } }';
        document.head.appendChild(style);
    }

    /* ---------- 启动 ---------- */
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

        // ★ 恢复上次保存的大小（默认 1.0×）
        var savedScale = parseFloat(localStorage.getItem(STORAGE_SIZE_SCALE));
        applySize(isNaN(savedScale) ? 1 : savedScale);

        bindEvents();
        updateStats();

        lastFrame = 0;
        rafId = requestAnimationFrame(tick);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();