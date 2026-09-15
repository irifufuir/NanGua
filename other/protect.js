/**
 * ============================================================
 *  other/protect.js
 *  前端调试检测保护 —— 检测浏览器开发者工具 / 调试插件
 * ------------------------------------------------------------
 *  引入方式：在 index.html 的 </body> 之前加入：
 *      <script src="other/protect.js"></script>
 *  注意：script 放到最后，保证 DOM 已加载完成
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
         *   'warn'     → 显示全屏遮罩提示（推荐）
         *   'redirect' → 跳转到 redirectUrl
         *   'clear'    → 直接清空页面
         *   'none'     → 只在控制台警告，不做视觉处理
         */
        action: 'warn',

        // action = 'redirect' 时跳转的地址
        redirectUrl: 'about:blank',

        // 循环检测间隔（毫秒）—— 3 秒一次，降低性能开销
        interval: 3000,

        // 是否拦截键盘快捷键（F12 / Ctrl+Shift+I / J / C / U / S）
        blockShortcuts: true,

        // 是否禁用右键菜单
        blockContextMenu: true,

        // 窗口内外尺寸差阈值
        sizeThreshold: 220,

        // 遮罩提示文字
        warnText: '检测到调试工具或插件，请关闭后刷新页面'
    };

    /* ========================================================
     *  二、基础工具
     * ======================================================== */

    function showWarnOverlay() {
        if (document.getElementById('__protect_overlay__')) return;

        var overlay = document.createElement('div');
        overlay.id = '__protect_overlay__';
        overlay.style.cssText = [
            'position: fixed',
            'top: 0', 'left: 0',
            'width: 100vw', 'height: 100vh',
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

    function removeWarnOverlay() {
        var el = document.getElementById('__protect_overlay__');
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function clearPage() {
        document.body.innerHTML = '';
    }

    function handleDetected() {
        switch (CONFIG.action) {
            case 'warn':     showWarnOverlay(); break;
            case 'redirect': location.replace(CONFIG.redirectUrl); break;
            case 'clear':    clearPage(); break;
            case 'none':
            default:
                try { console.clear(); } catch (e) {}
                break;
        }
    }

    function handleSafe() {
        if (CONFIG.action === 'warn') removeWarnOverlay();
    }

    /* ========================================================
     *  三、两种检测手段（去掉 debugger 陷阱）
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
     * 检测 2：console 陷阱
     * 在 console.log 一个自定义 toString 的对象时，
     * 只有开发者工具打开，浏览器才会调用 toString
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
     *  四、快捷键 / 右键拦截
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
        var detected = sizeCheck() || consoleCheck();
        if (detected) {
            handleDetected();
        } else {
            handleSafe();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loopCheck);
    } else {
        loopCheck();
    }

    setInterval(loopCheck, CONFIG.interval);

    /* ========================================================
     *  六、对外暴露接口（方便调试）
     * ======================================================== */
    window.__PROTECT__ = {
        config: CONFIG,
        check:  loopCheck
    };
})();