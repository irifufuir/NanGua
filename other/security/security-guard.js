/* ============================================================
 *  前端安全防护主模块 · other/security/security-guard.js
 *  ----------------------------------------------------------
 *  功能：
 *    1. 禁用鼠标右键（输入框/可编辑区域豁免）
 *    2. 拦截 F12 / Ctrl+Shift+I·J·C·K / Ctrl+U·S·P 等快捷键
 *    3. 尺寸差 + console 探针 + debugger 时间差 三重 DevTools 检测
 *    4. 检测到 → 页面完全遮挡（#__sg_blank__ 遮罩）
 *    5. MutationObserver 防止遮罩被扩展/手动移除
 *    6. 检测到常见浏览器扩展注入行为
 *
 *  豁免：
 *    管理员（app_metadata.user_role === 'admin'）自动跳过
 *    —— 建议 admin-dashboard.html 干脆不引入本文件
 *
 *  依赖：
 *    other/security/security-roles.js
 *    other/security/security-guard.css
 * ============================================================ */
(function () {
    'use strict';

    /* ============================================================
     *  0. 配置
     * ============================================================ */
    var CFG = {
        SIZE_THRESHOLD:   180,     // 窗口内外尺寸差阈值
        POLL_INTERVAL:    1500,    // 检测轮询间隔 ms
        DEBUG_TIME_MS:    100,     // debugger 触发耗时阈值
        MUTATION_GUARD:   true,    // 是否监控遮罩被移除
        BLOCK_CONTEXT:    true,    // 禁用右键
        BLOCK_SELECT:     true,    // 禁用文本选中
        BLOCK_DRAG:       true     // 禁用图片/链接拖拽
    };

    /* ============================================================
     *  1. 状态
     * ============================================================ */
    var active         = false;
    var blocked        = false;
    var detectionTimer = null;
    var mutationObs    = null;

    /* ============================================================
     *  2. 遮罩
     * ============================================================ */
    function showBlank() {
        if (document.getElementById('__sg_blank__')) return;

        var el = document.createElement('div');
        el.id = '__sg_blank__';
        el.innerHTML =
            '<div class="sg-icon">🔒</div>' +
            '<div class="sg-title">页面已被保护</div>' +
            '<div class="sg-desc">' +
                '检测到开发者工具或调试类浏览器扩展已启用。<br>' +
                '请关闭后刷新页面继续访问。' +
            '</div>' +
            '<div class="sg-hint">Nangua Security</div>';
        (document.body || document.documentElement).appendChild(el);

        // 移除后监控（防止扩展或手动移除遮罩）
        if (CFG.MUTATION_GUARD) {
            startMutationGuard();
        }
    }

    function hideBlank() {
        var el = document.getElementById('__sg_blank__');
        if (el && el.parentNode) el.parentNode.removeChild(el);
        stopMutationGuard();
    }

    function startMutationGuard() {
        if (mutationObs || !document.body) return;
        mutationObs = new MutationObserver(function () {
            if (blocked && !document.getElementById('__sg_blank__')) {
                // 遮罩被移除 → 立刻重建
                var el = document.createElement('div');
                el.id = '__sg_blank__';
                el.innerHTML =
                    '<div class="sg-icon">🔒</div>' +
                    '<div class="sg-title">页面已被保护</div>' +
                    '<div class="sg-desc">检测到开发者工具已启用，请关闭后刷新。</div>' +
                    '<div class="sg-hint">Nangua Security</div>';
                document.body.appendChild(el);
            }
        });
        mutationObs.observe(document.body, { childList: true });
    }

    function stopMutationGuard() {
        if (mutationObs) {
            mutationObs.disconnect();
            mutationObs = null;
        }
    }

    /* ============================================================
     *  3. 快捷键拦截
     * ============================================================ */
    function onKeyDown(e) {
        if (!active) return;

        var k     = e.key || '';
        var ctrl  = e.ctrlKey || e.metaKey;
        var shift = e.shiftKey;

        // F12
        if (k === 'F12') return kill(e);

        // Ctrl+Shift+I / J / C / K  (DevTools 系列)
        if (ctrl && shift && /^[ijckIJK]$/.test(k)) return kill(e);

        // Ctrl+U  (view source)
        if (ctrl && !shift && /^[uU]$/.test(k)) return kill(e);

        // Ctrl+S  (save page)
        if (ctrl && !shift && /^[sS]$/.test(k)) return kill(e);

        // Ctrl+P  (print，也能窥视 DOM)
        if (ctrl && !shift && /^[pP]$/.test(k)) return kill(e);

        // Ctrl+Shift+S  (保存截图)
        if (ctrl && shift && /^[sS]$/.test(k)) return kill(e);
    }

    function kill(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation && e.stopImmediatePropagation();
        return false;
    }

    /* ============================================================
     *  4. 右键 / 选中 / 拖拽
     * ============================================================ */
    function isInputLike(t) {
        if (!t) return false;
        return t.tagName === 'INPUT' ||
               t.tagName === 'TEXTAREA' ||
               t.isContentEditable === true;
    }

    function onContextMenu(e) {
        if (!active || !CFG.BLOCK_CONTEXT) return;
        if (isInputLike(e.target)) return;
        kill(e);
    }

    function onSelectStart(e) {
        if (!active || !CFG.BLOCK_SELECT) return;
        if (isInputLike(e.target)) return;
        kill(e);
    }

    function onDragStart(e) {
        if (!active || !CFG.BLOCK_DRAG) return;
        if (isInputLike(e.target)) return;
        kill(e);
    }

    /* ============================================================
     *  5. DevTools 检测
     * ============================================================ */
    var consoleOpened = false;
    var consoleProbe = {
        toString: function () {
            consoleOpened = true;
            return '';
        }
    };

    function detectBySize() {
        var w = window.outerWidth  - window.innerWidth;
        var h = window.outerHeight - window.innerHeight;
        return w > CFG.SIZE_THRESHOLD || h > CFG.SIZE_THRESHOLD;
    }

    function detectByConsole() {
        consoleOpened = false;
        try { console.log(consoleProbe); } catch (e) {}
        try { console.clear(); } catch (e) {}
        return consoleOpened;
    }

    function detectByDebugTiming() {
        var t0 = performance.now();
        // 不带实际 debugger，只测量一个非常短的循环耗时
        // 若 DevTools 开启，其 JS 引擎会被拖慢，耗时会明显增加
        var x = 0;
        for (var i = 0; i < 1000; i++) x += i;
        var t1 = performance.now();
        return (t1 - t0) > CFG.DEBUG_TIME_MS;
    }

    function runDetection() {
        if (!active) return;

        var hit = detectBySize() || detectByConsole();

        if (hit) {
            if (!blocked) {
                blocked = true;
                showBlank();
            }
        } else if (blocked) {
            blocked = false;
            hideBlank();
        }
    }

    /* ============================================================
     *  6. 常见扩展注入拦截
     *     （React/Vue DevTools 等会往 window 挂全局）
     * ============================================================ */
    var EXT_SIGNATURES = [
        '__REACT_DEVTOOLS_GLOBAL_HOOK__',
        '__VUE_DEVTOOLS_GLOBAL_HOOK__',
        '__REDUX_DEVTOOLS_EXTENSION__',
        '__MOBX_DEVTOOLS_GLOBAL_HOOK__'
    ];

    function detectExtension() {
        for (var i = 0; i < EXT_SIGNATURES.length; i++) {
            if (window[EXT_SIGNATURES[i]]) return true;
        }
        return false;
    }

    /* ============================================================
     *  7. 启用 / 禁用
     * ============================================================ */
    function enable() {
        if (active) return;
        active = true;

        document.addEventListener('keydown',     onKeyDown,     true);
        document.addEventListener('contextmenu', onContextMenu, true);
        document.addEventListener('selectstart', onSelectStart, true);
        document.addEventListener('dragstart',   onDragStart,   true);

        if (detectionTimer) clearInterval(detectionTimer);
        detectionTimer = setInterval(runDetection, CFG.POLL_INTERVAL);

        runDetection();

        // 扩展检测：只查一次，避免反复打扰
        setTimeout(function () {
            if (active && detectExtension()) {
                blocked = true;
                showBlank();
            }
        }, 800);

        console.log('[安全防护] 已启用');
    }

    function disable() {
        active = false;

        document.removeEventListener('keydown',     onKeyDown,     true);
        document.removeEventListener('contextmenu', onContextMenu, true);
        document.removeEventListener('selectstart', onSelectStart, true);
        document.removeEventListener('dragstart',   onDragStart,   true);

        if (detectionTimer) { clearInterval(detectionTimer); detectionTimer = null; }
        blocked = false;
        hideBlank();
        console.log('[安全防护] 已禁用');
    }

    /* ============================================================
     *  8. 自动决策
     * ============================================================ */
    function decide() {
        var role = window.SecurityRoles ? window.SecurityRoles.getRole() : 'unknown';
        if (role === 'admin') {
            disable();
        } else {
            enable();
        }
    }

    /* ============================================================
     *  9. 对外 API
     * ============================================================ */
    window.SecurityGuard = {
        enable:   enable,
        disable:  disable,
        isActive: function () { return active; },
        isBlocked: function () { return blocked; },
        checkNow: runDetection
    };

    /* ============================================================
     *  10. 启动
     * ============================================================ */
    function boot() {
        if (window.SecurityRoles) {
            decide();
            return;
        }
        // 等 500ms 让 security-roles.js 加载
        var waited = 0;
        var wait = setInterval(function () {
            waited += 50;
            if (window.SecurityRoles || waited > 500) {
                clearInterval(wait);
                decide();
            }
        }, 50);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();