/* ============================================================
 * 语言工具 · other/lang-helper.js
 * ------------------------------------------------------------
 *  - 读取 / 保存当前语言（localStorage: nangua_lang）
 *  - 提供 t() / applyDashboardLanguage()
 *  - 监听 langchange 事件（由 other/lang-switcher.js 广播）
 *
 *  ⭐ 已精简：EXTRA_I18N 里的主题按钮键已全部并入 i18n.js，
 *            这里只保留 manageHint1/2 作为兜底。
 * ============================================================ */
(function () {
    'use strict';

    var LANG_KEY  = 'nangua_lang';
    var SUPPORTED = ['zh', 'en', 'ja', 'ko', 'fr', 'es'];

    /* ============================================================
     * ★ 兜底补丁：只补 i18n.js 里可能漏掉的键
     *    （正常情况下这份兜底不会被用到）
     * ============================================================ */
    var EXTRA_I18N = {
        zh: {
            adminDash: {
                manageHint1: '修改后点击右侧「保存修改」',
                manageHint2: '昵称、手机号、邮箱、密码、UID 将实时同步'
            }
        },
        en: {
            adminDash: {
                manageHint1: 'Click "Save" on the right after editing',
                manageHint2: 'Nickname, phone, email, password, UID sync in real time'
            }
        },
        ja: {
            adminDash: {
                manageHint1: '編集後、右側の「保存」をクリック',
                manageHint2: 'ニックネーム・電話・メール・パスワード・UIDが即時同期されます'
            }
        },
        ko: {
            adminDash: {
                manageHint1: '편집 후 오른쪽 "저장"을 클릭하세요',
                manageHint2: '닉네임·전화·이메일·비밀번호·UID가 실시간 동기화됩니다'
            }
        },
        fr: {
            adminDash: {
                manageHint1: 'Cliquez sur « Enregistrer » à droite après modification',
                manageHint2: 'Pseudo, téléphone, e-mail, mot de passe et UID synchronisés en temps réel'
            }
        },
        es: {
            adminDash: {
                manageHint1: 'Haz clic en « Guardar » a la derecha después de editar',
                manageHint2: 'Apodo, teléfono, correo, contraseña y UID se sincronizan en tiempo real'
            }
        }
    };

    /* 合并到 window.I18N（不覆盖已有的键） */
    (function mergeExtra() {
        var I18N = window.I18N;
        if (!I18N) return;
        Object.keys(EXTRA_I18N).forEach(function (lang) {
            if (!I18N[lang]) I18N[lang] = {};
            var src = EXTRA_I18N[lang];
            Object.keys(src).forEach(function (ns) {
                if (!I18N[lang][ns]) I18N[lang][ns] = {};
                Object.keys(src[ns]).forEach(function (key) {
                    if (I18N[lang][ns][key] == null) {
                        I18N[lang][ns][key] = src[ns][key];
                    }
                });
            });
        });
    })();

    /* ---------- 当前语言 ---------- */
    function getLang() {
        if (window.__NANGUA_LANG__ && SUPPORTED.indexOf(window.__NANGUA_LANG__) !== -1) {
            return window.__NANGUA_LANG__;
        }
        var saved = null;
        try { saved = localStorage.getItem(LANG_KEY); } catch (e) {}
        if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;

        var nav = (navigator.language || 'zh').toLowerCase();
        for (var i = 0; i < SUPPORTED.length; i++) {
            if (nav.indexOf(SUPPORTED[i]) === 0) return SUPPORTED[i];
        }
        return 'zh';
    }

    function setLang(code) {
        if (SUPPORTED.indexOf(code) === -1) code = 'zh';
        try { localStorage.setItem(LANG_KEY, code); } catch (e) {}
        window.__NANGUA_LANG__ = code;
        return code;
    }

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

    function t(key, fallback) {
        var dict = (window.I18N || {})[getLang()] || (window.I18N || {}).zh;
        if (!dict) return fallback || key;
        var val = getDeepValue(dict, key);
        return (val != null) ? val : (fallback != null ? fallback : key);
    }

    function applyDashboardLanguage() {
        var dict = (window.I18N || {})[getLang()] || (window.I18N || {}).zh;
        if (!dict) return;

        function lookup(path) { return getDeepValue(dict, path); }

        document.querySelectorAll('[data-i18n]').forEach(function (el) {
            var val = lookup(el.getAttribute('data-i18n'));
            if (val != null) el.textContent = val;
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
            var val = lookup(el.getAttribute('data-i18n-placeholder'));
            if (val != null) el.setAttribute('placeholder', val);
        });
        document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
            var val = lookup(el.getAttribute('data-i18n-title'));
            if (val != null) el.setAttribute('title', val);
        });

        document.documentElement.setAttribute('lang', getLang());
    }

    window.LangHelper = {
        getLang: getLang,
        setLang: setLang,
        t:       t,
        apply:   applyDashboardLanguage
    };

    window.addEventListener('langchange', function () {
        applyDashboardLanguage();
        if (typeof window.refreshDynamicText === 'function') {
            try { window.refreshDynamicText(); } catch (e) {}
        }
    });

    function init() { applyDashboardLanguage(); }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();