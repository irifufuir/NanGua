/* ============================================================
 *  lang-helper.js
 *  ------------------------------------------------------------
 *  兼容层：对外仍暴露 window.LangHelper 与 window.__
 *  实际工作委托给 window.i18n 引擎（i18n/index.js）
 * ============================================================ */
(function () {
    'use strict';

    function t(key, fallback) {
        if (window.i18n && window.i18n.t) return window.i18n.t(key, fallback);
        return fallback != null ? fallback : key;
    }

    function getLang() {
        if (window.i18n && window.i18n.getLang) return window.i18n.getLang();
        return 'zh';
    }

    function setLang(code) {
        if (window.i18n && window.i18n.setLanguage) return window.i18n.setLanguage(code);
        return Promise.reject(new Error('[lang-helper] i18n not ready'));
    }

    function apply() {
        if (window.i18n && window.i18n.apply) window.i18n.apply();
    }

    /* ---------- 对外 API ---------- */
    window.LangHelper = {
        getLang: getLang,
        setLang: setLang,
        t:       t,
        apply:   apply
    };

    /* 兼容旧的全局函数 */
    window.__ = t;

    /* 兼容 dashboard 脚本暴露的语言变更 hook（可选） */
    window.__adLangChanged = function () {
        apply();
        if (typeof window.refreshDynamicText === 'function') {
            try { window.refreshDynamicText(); } catch (e) {}
        }
    };
    window.__udLangChanged = window.__adLangChanged;

    /* 监听引擎的语言切换事件 */
    window.addEventListener('langchange', function () {
        if (typeof window.refreshDynamicText === 'function') {
            try { window.refreshDynamicText(); } catch (e) {}
        }
    });
})();