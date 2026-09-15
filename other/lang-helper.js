/* ============================================================
 * 语言工具 · other/lang-helper.js
 * ------------------------------------------------------------
 *  作用：
 *    - 读取 / 保存当前语言（localStorage: nangua_lang）
 *    - 给 dashboard 页统一提供 t() / applyDashboardLanguage()
 *  依赖：window.I18N（i18n.js 必须先加载）
 * ============================================================ */
(function () {
    'use strict';

    var LANG_KEY = 'nangua_lang';
    var SUPPORTED = ['zh', 'en', 'ja', 'ko', 'fr', 'es'];

    /* ---------- 读取 / 保存语言 ---------- */
    function getLang() {
        var saved = null;
        try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
        if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;

        // 回退到浏览器语言
        var nav = (navigator.language || 'zh').toLowerCase();
        for (var i = 0; i < SUPPORTED.length; i++) {
            if (nav.indexOf(SUPPORTED[i]) === 0) return SUPPORTED[i];
        }
        return 'zh';
    }

    function setLang(code) {
        if (SUPPORTED.indexOf(code) === -1) code = 'zh';
        try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
        return code;
    }

    /* ---------- 深取值：getDeepValue({a:{b:1}}, 'a.b') → 1 ---------- */
    function getDeepValue(obj, path) {
        if (!obj || !path) return null;
        var parts = String(path).split('.');
        var cur = obj;
        for (var i = 0; i < parts.length; i++) {
            if (cur == null || typeof cur !== 'object') return null;
            cur = cur[parts[i]];
        }
        return cur != null ? cur : null;
    }

    /* ---------- t(key, fallback) ----------
     *  自动从 userDash / adminDash / common 里按 key 查
     */
    function t(key, fallback) {
        var dict = (window.I18N || {})[getLang()] || (window.I18N || {}).zh;
        if (!dict) return fallback || key;

        // 优先 userDash，再 adminDash，再 common，再顶层
        var val =
            getDeepValue(dict.userDash,  key) ||
            getDeepValue(dict.adminDash, key) ||
            getDeepValue(dict.common,    key) ||
            dict[key];

        return (val != null) ? val : (fallback != null ? fallback : key);
    }

    /* ---------- 应用字典到页面 ----------
     *  1) 遍历所有 [data-i18n] 元素，替换 textContent
     *  2) 遍历所有 [data-i18n-placeholder]，替换 placeholder
     *  3) 遍历所有 [data-i18n-title]，替换 title
     */
    function applyDashboardLanguage() {
        var dict = (window.I18N || {})[getLang()] || (window.I18N || {}).zh;
        if (!dict) return;

        var userDict = dict.userDash || {};
        var adminDict = dict.adminDash || {};
        var commonDict = dict.common || {};

        function lookup(path) {
            return (
                getDeepValue(userDict,  path) ||
                getDeepValue(adminDict, path) ||
                getDeepValue(commonDict, path) ||
                dict[path]
            );
        }

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var key = el.getAttribute('data-i18n');
            var val = lookup(key);
            if (val != null) el.textContent = val;
        });

        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-placeholder');
            var val = lookup(key);
            if (val != null) el.setAttribute('placeholder', val);
        });

        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var key = el.getAttribute('data-i18n-title');
            var val = lookup(key);
            if (val != null) el.setAttribute('title', val);
        });

        // 更新 <html lang="">
        document.documentElement.setAttribute('lang', getLang());

        // 更新语言按钮显示
        document.querySelectorAll('[data-lang-label]').forEach(function (el) {
            var labelMap = {
                zh: '简体中文', en: 'English', ja: '日本語',
                ko: '한국어',  fr: 'Français', es: 'Español'
            };
            el.textContent = '🌐 ' + (labelMap[getLang()] || '简体中文');
        });

        // 高亮当前选中的语言项（下拉菜单里）
        document.querySelectorAll('[data-lang-option]').forEach(function (el) {
            el.classList.toggle('active', el.getAttribute('data-lang-option') === getLang());
        });
    }

    /* ---------- 绑定语言切换器事件 ---------- */
    function bindLangSwitcher() {
        document.querySelectorAll('[data-lang-btn]').forEach(function (btn) {
            if (btn.dataset.bound === '1') return;
            btn.dataset.bound = '1';

            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var dd = document.querySelector('[data-lang-dropdown]');
                if (!dd) return;
                dd.classList.toggle('show');
            });
        });

        document.querySelectorAll('[data-lang-option]').forEach(function (item) {
            if (item.dataset.bound === '1') return;
            item.dataset.bound = '1';

            item.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();

                var code = this.getAttribute('data-lang-option');
                setLang(code);
                applyDashboardLanguage();

                var dd = document.querySelector('[data-lang-dropdown]');
                if (dd) dd.classList.remove('show');
            });
        });

        // 点击其他地方关闭下拉
        if (document.body.dataset.langGlobalBound !== '1') {
            document.body.dataset.langGlobalBound = '1';
            document.addEventListener('click', function () {
                var dd = document.querySelector('[data-lang-dropdown]');
                if (dd) dd.classList.remove('show');
            });
        }
    }

    /* ---------- 对外暴露 ---------- */
    window.LangHelper = {
        getLang: getLang,
        setLang: setLang,
        t: t,
        apply: applyDashboardLanguage,
        bind: bindLangSwitcher
    };

    /* ---------- 自动初始化 ---------- */
    function init() {
        applyDashboardLanguage();
        bindLangSwitcher();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();