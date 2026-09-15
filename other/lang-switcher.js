/* ============================================================
   语言切换器 · 全站共享逻辑
   - 绑定 #langBtn / #langDropdown
   - 切换语言 → 写 localStorage + 广播 langchange 事件
   - 三页（index / admin / user）都引用这一个文件
   ============================================================ */
(function () {
    'use strict';

    var LANG_KEY  = 'nangua_lang';
    var SUPPORTED = ['zh','en','ja','ko','fr','es'];
    var LABEL_MAP = {
        zh:'简体中文', en:'English', ja:'日本語',
        ko:'한국어',  fr:'Français', es:'Español'
    };

    function getLang() {
        if (window.__NANGUA_LANG__ && SUPPORTED.indexOf(window.__NANGUA_LANG__) !== -1)
            return window.__NANGUA_LANG__;
        var saved = null;
        try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
        if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
        return 'zh';
    }

    function setLang(code) {
        if (SUPPORTED.indexOf(code) === -1) code = 'zh';
        try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
        window.__NANGUA_LANG__ = code;
        return code;
    }

    function syncUI() {
        var btn = document.getElementById('langBtn');
        if (btn) btn.textContent = '🌐 ' + (LABEL_MAP[getLang()] || '简体中文');
        document.querySelectorAll('#langDropdown a[data-lang]').forEach(function (a) {
            a.classList.toggle('active', a.getAttribute('data-lang') === getLang());
        });
    }

    function bind() {
        var btn = document.getElementById('langBtn');
        var dd  = document.getElementById('langDropdown');
        if (!btn || !dd || btn.dataset.bound === '1') return;
        btn.dataset.bound = '1';

        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            dd.classList.toggle('show');
        });
        dd.addEventListener('click', function (e) { e.stopPropagation(); });

        dd.querySelectorAll('a[data-lang]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault();
                var code = this.getAttribute('data-lang');
                if (SUPPORTED.indexOf(code) === -1) return;
                setLang(code);
                dd.classList.remove('show');
                syncUI();
                // 广播给页面，让各页面自行刷新
                window.dispatchEvent(new CustomEvent('langchange', { detail: { lang: code } }));
            });
        });

        document.addEventListener('click', function () {
            dd.classList.remove('show');
        });
    }

    window.LangSwitcher = { getLang: getLang, setLang: setLang, sync: syncUI };

    function init() { bind(); syncUI(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();