/* ============================================================
 *  i18n/index.js
 *  多语言引擎核心：
 *    - 加载 / 缓存语言包
 *    - 按需异步加载（<script> 注入）
 *    - t() 翻译查找 + 回退机制
 *    - data-i18n / data-i18n-placeholder / data-i18n-title 自动替换
 *    - 语言切换事件（langchange）
 * ============================================================ */
(function () {
    'use strict';

    var LANG_KEY = 'nangua_lang';
    var reg = window.i18nRegistry || { languages: [] };
    var languages = reg.languages || [];
    var SUPPORTED = languages.map(function (l) { return l.code; });

    var loaded  = {};   // code -> 该语言的扁平字典
    var loading = {};   // code -> Promise
    var currentLang = reg.default || 'zh';

    /* ---------- 查找注册表条目 ---------- */
    function getEntry(code) {
        if (!code) return null;
        var i;
        for (i = 0; i < languages.length; i++) {
            if (languages[i].code === code) return languages[i];
        }
        for (i = 0; i < languages.length; i++) {
            if (languages[i].locale === code) return languages[i];
        }
        for (i = 0; i < languages.length; i++) {
            var al = languages[i].aliases || [];
            if (al.indexOf(code) !== -1) return languages[i];
        }
        return null;
    }

    /* ---------- 同步读取已注册的全局语言包 ---------- */
    function readGlobal(entry) {
        if (!entry) return null;
        var bag = window.i18nLocales || {};
        return bag[entry.locale] || null;
    }

    /* ---------- 加载语言包（同步优先 + 异步兜底） ---------- */
    function loadLocale(code) {
        if (loaded[code])  return Promise.resolve(loaded[code]);
        if (loading[code]) return loading[code];

        var entry = getEntry(code);
        if (!entry) return Promise.reject(new Error('[i18n] Unknown locale: ' + code));

        // ① 已通过 <script> 预加载，直接取
        var pre = readGlobal(entry);
        if (pre) {
            loaded[code] = pre;
            return Promise.resolve(pre);
        }

        // ② 按需注入 <script>
        loading[code] = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = entry.file;
            s.async = true;
            s.onload = function () {
                delete loading[code];
                var dict = readGlobal(entry);
                if (dict) {
                    loaded[code] = dict;
                    resolve(dict);
                } else {
                    reject(new Error('[i18n] Locale file did not register: ' + entry.locale));
                }
            };
            s.onerror = function () {
                delete loading[code];
                reject(new Error('[i18n] Failed to load: ' + entry.file));
            };
            document.head.appendChild(s);
        });
        return loading[code];
    }

    /* ---------- 翻译 ---------- */
    function t(key, fallback) {
        var dict = loaded[currentLang];
        if (dict && dict[key] !== undefined) return dict[key];

        // 回退语言
        var fb = reg.fallback;
        if (fb && fb !== currentLang && loaded[fb] && loaded[fb][key] !== undefined) {
            return loaded[fb][key];
        }

        return fallback != null ? fallback : key;
    }

    /* ---------- 应用到 DOM ---------- */
    function apply() {
        var dict = loaded[currentLang] || {};

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var v = dict[el.getAttribute('data-i18n')];
            if (v != null) el.textContent = v;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var v = dict[el.getAttribute('data-i18n-placeholder')];
            if (v != null) el.setAttribute('placeholder', v);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var v = dict[el.getAttribute('data-i18n-title')];
            if (v != null) el.setAttribute('title', v);
        });

        document.documentElement.setAttribute('lang', currentLang);
    }

    /* ---------- 切换语言 ---------- */
    function setLanguage(code) {
        var entry = getEntry(code);
        if (!entry) return Promise.reject(new Error('[i18n] Unknown language: ' + code));

        var target = entry.code;
        return loadLocale(target).then(function () {
            var changed = (currentLang !== target);
            currentLang = target;

            try { localStorage.setItem(LANG_KEY, target); } catch (e) {}
            window.__NANGUA_LANG__ = target;

            apply();

            if (changed) {
                window.dispatchEvent(new CustomEvent('langchange', {
                    detail: { lang: target }
                }));
            }
            return target;
        });
    }

    function getLang() { return currentLang; }

    /* ---------- 浏览器语言猜测 ---------- */
    function guessBrowserLang() {
        var nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
        if (!nav) return null;
        var i;
        for (i = 0; i < languages.length; i++) {
            if (languages[i].code.toLowerCase() === nav)   return languages[i].code;
            if (languages[i].locale.toLowerCase() === nav) return languages[i].code;
        }
        var prefix = nav.split('-')[0];
        for (i = 0; i < languages.length; i++) {
            if (languages[i].code.toLowerCase() === prefix) return languages[i].code;
            if (languages[i].locale.toLowerCase().indexOf(prefix) === 0) return languages[i].code;
        }
        return null;
    }

    /* ---------- 解析优先级：URL > 已设置的全局变量 > localStorage > 浏览器 > 默认 ---------- */
    function resolveWanted() {
        // ① URL 参数
        try {
            var m = location.search.match(/[?&]lang=([a-zA-Z-]+)/);
            if (m) {
                var e1 = getEntry(m[1]);
                if (e1) return e1.code;
            }
        } catch (e) {}

        // ② 页面内联脚本提前设置的全局变量
        if (window.__NANGUA_LANG__) {
            var e2 = getEntry(window.__NANGUA_LANG__);
            if (e2) return e2.code;
        }

        // ③ localStorage
        try {
            var saved = localStorage.getItem(LANG_KEY);
            if (saved) {
                var e3 = getEntry(saved);
                if (e3) return e3.code;
            }
        } catch (e) {}

        // ④ 浏览器
        var guess = guessBrowserLang();
        if (guess) return guess;

        return reg.default || (languages[0] && languages[0].code) || 'zh';
    }

    /* ---------- 初始化 ---------- */
    function init() {
        currentLang = resolveWanted();
        window.__NANGUA_LANG__ = currentLang;
        try { localStorage.setItem(LANG_KEY, currentLang); } catch (e) {}

        // 同时加载回退语言（用于未翻译键的兜底）
        var tasks = [];
        var fb = reg.fallback;
        if (fb && fb !== currentLang) {
            tasks.push(loadLocale(fb).catch(function () {}));
        }
        tasks.push(loadLocale(currentLang).catch(function () {}));

        return Promise.all(tasks).then(function () {
            apply();
            return currentLang;
        });
    }

    /* ---------- 对外 API ---------- */
    window.i18n = {
        t:           t,
        getLang:     getLang,
        setLanguage: setLanguage,
        apply:       apply,
        loadLocale:  loadLocale,
        getLanguages: function () { return languages.slice(); },
        getDefault:  function () { return reg.default; },
        getFallback: function () { return reg.fallback; },
        ready:       null
    };

    // 启动
    window.i18n.ready = init();
})();