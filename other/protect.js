/**
 * ============================================================
 *  other/protect.js
 *  前端调试检测保护 —— 宽松版
 * ------------------------------------------------------------
 *  特点：
 *   - 不弹遮罩、不清空页面、不跳转
 *   - 不拦截快捷键（F12 / Ctrl+Shift+I 等都能正常用）
 *   - 不禁用右键菜单
 *   - 不调用 debugger 语句（避免卡顿）
 *   - 只做后台静默检测，检测到就 console.warn 提醒一下
 *   - 5 秒检测一次，几乎不占性能
 *
 *  引入方式：在 index.html 的 </body> 之前加入：
 *      <script src="other/protect.js"></script>
 * ============================================================
 */
(function () {
    'use strict';

    /* ========================================================
     *  一、配置区（想改行为只动这里）
     * ======================================================== */
    var CONFIG = {
        /**
         * 检测到调试工具后执行的动作：
         *   'none'     → 只在控制台警告（推荐，最宽松）
         *   'warn'     → 显示全屏遮罩提示
         *   'redirect' → 跳转到 redirectUrl
         *   'clear'    → 直接清空页面
         */
        action: 'none',

        // action = 'redirect' 时跳转的地址
        redirectUrl: 'about:blank',

        // 循环检测间隔（毫秒），5000 表示 5 秒一次
        interval: 5000,

        // 是否拦截键盘快捷键（关闭，让用户正常使用 F12 等）
        blockShortcuts: false,

        // 是否禁用右键菜单（关闭）
        blockContextMenu: false,

        // 是否启用 debugger 计时检测（关闭，避免卡顿）
        useDebuggerCheck: false,

        // 窗口内外尺寸差值阈值：超过该值判定为开发者工具停靠打开
        sizeThreshold: 160,

        // 遮罩提示文字（action = 'warn' 时才用到）
        warnText: '检测到调试工具或插件，请关闭后刷新页面',

        // 控制台提示文字（action = 'none' 时显示）
        consoleWarnText: '[保护] 检测到开发者工具已打开'
    };

    /* ========================================================
     *  二、基础工具
     * ======================================================== */

    /**
     * 显示全屏遮罩警告
     */
    function showWarnOverlay() {
        if (document.getElementById('__protect_overlay__')) return;

        var overlay = document.createElement('div');
        overlay.id = '__protect_overlay__';
        overlay.style.cssText = [
            'position: fixed',
            'top: 0',
            'left: 0',
            'width: 100vw',
            'height: 100vh',
            'background: rgba(0,0,0,0.92)',
            'color: #ff6b3d',
            'display: flex',
            'justify-content: center',
            'align-items: center',
            'flex-direction: column',
            'font-size: 20px',
            'letter-spacing: 2px',
            'z-index: 2147483647',
            'text-align: center',
            'padding: 20px',
            'box-sizing: border-box',
            'user-select: none'
        ].join(';');

        var text = document.createElement('div');
        text.textContent = CONFIG.warnText;

        var sub = document.createElement('div');
        sub.style.cssText = [
            'margin-top: 16px',
            'font-size: 13px',
            'letter-spacing: 1px',
            'color: rgba(255,255,255,0.55)'
        ].join(';');
        sub.textContent = 'DevTools / Plugin Detected';

        overlay.appendChild(text);
        overlay.appendChild(sub);
        document.body.appendChild(overlay);
    }

    /**
     * 关闭遮罩
     */
    function removeWarnOverlay() {
        var el = document.getElementById('__protect_overlay__');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    /**
     * 清空页面
     */
    function clearPage() {
        document.body.innerHTML = '';
    }

    /**
     * 检测到异常时的统一处理
     */
    function handleDetected() {
        switch (CONFIG.action) {
            case 'warn':
                showWarnOverlay();
                break;
            case 'redirect':
                location.replace(CONFIG.redirectUrl);
                break;
            case 'clear':
                clearPage();
                break;
            case 'none':
            default:
                // 只在控制台提醒，不打扰用户
                try {
                    console.warn(CONFIG.consoleWarnText);
                } catch (e) {}
                break;
        }
    }

    /**
     * 恢复正常时的处理
     */
    function handleSafe() {
        if (CONFIG.action === 'warn') removeWarnOverlay();
    }

    /* ========================================================
     *  三、检测手段
     * ======================================================== */

    /**
     * 检测 1：窗口内外尺寸差
     * 打开停靠式开发者工具时，outerWidth/Height 与 inner 差值会明显变大
     */
    function sizeCheck() {
        var wDiff = window.outerWidth  - window.innerWidth;
        var hDiff = window.outerHeight - window.innerHeight;
        return wDiff > CONFIG.sizeThreshold || hDiff > CONFIG.sizeThreshold;
    }

    /**
     * 检测 2：debugger 计时（默认关闭）
     * 未打开调试器时几乎无耗时，打开调试器时会被暂停
     */
    function debuggerCheck() {
        if (!CONFIG.useDebuggerCheck) return false;
        var t0 = performance.now();
        // eslint-disable-next-line no-debugger
        debugger;
        var t1 = performance.now();
        return (t1 - t0) > 100;
    }

    /**
     * 检测 3：console 陷阱
     * 只有开发者工具打开时，浏览器才会调用自定义 toString
     */
    var consoleCheck = (function () {
        var opened = false;

        var probe = function () {};
        probe.toString = function () {
            opened = true;
            return 'function () { [native code] }';
        };

        try {
            console.log(probe);
            try { console.clear(); } catch (e) {}
        } catch (e) {}

        return function () {
            var result = opened;
            opened = false;
            return result;
        };
    })();

    /* ========================================================
     *  四、快捷键 / 右键拦截（默认关闭）
     * ======================================================== */

    if (CONFIG.blockShortcuts) {
        document.addEventListener('keydown', function (e) {
            var k     = e.key || '';
            var ctrl  = e.ctrlKey || e.metaKey;
            var shift = e.shiftKey;

            if (k === 'F12') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            if (ctrl && shift && /^(I|J|C|i|j|c)$/.test(k)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            if (ctrl && /^(U|u)$/.test(k)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            if (ctrl && /^(S|s)$/.test(k)) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }, true);
    }

    if (CONFIG.blockContextMenu) {
        document.addEventListener('contextmenu', function (e) {
            e.preventDefault();
            return false;
        }, true);
    }

    /* ========================================================
     *  五、循环检测
     * ======================================================== */
    function loopCheck() {
        var detected = sizeCheck() || consoleCheck() || debuggerCheck();
        if (detected) {
            handleDetected();
        } else {
            handleSafe();
        }
    }

    // 首次执行
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loopCheck);
    } else {
        loopCheck();
    }

    // 循环执行（5 秒一次，几乎不占性能）
    setInterval(loopCheck, CONFIG.interval);

    /* ========================================================
     *  六、对外暴露接口（方便调试）
     * ======================================================== */
    window.__PROTECT__ = {
        config: CONFIG,
        check:  loopCheck
    };
})();