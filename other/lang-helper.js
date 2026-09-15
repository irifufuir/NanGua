/* ============================================================
 * 语言工具 · other/lang-helper.js
 * ------------------------------------------------------------
 *  - 读取 / 保存当前语言（localStorage: nangua_lang）
 *  - 补丁字典：补 i18n.js 里漏掉的主题按钮 / manageHint 文案
 *  - 提供 t() / applyDashboardLanguage()
 *  - 监听 langchange 事件（由 other/lang-switcher.js 广播）
 * ============================================================ */
(function () {
    'use strict';

    var LANG_KEY  = 'nangua_lang';
    var SUPPORTED = ['zh', 'en', 'ja', 'ko', 'fr', 'es'];

    /* ============================================================
     * ★ 补丁字典：把 i18n.js 里没写的键补进去
     * ============================================================ */
    var EXTRA_I18N = {
        zh: {
            common: {
                themeFontSmall:  '小',
                themeFontMedium: '标准',
                themeFontLarge:  '大',
                themeFontXl:     '特大',
                themeRadiusSmall:  '直角',
                themeRadiusMedium: '标准',
                themeRadiusLarge:  '圆润',
                themeAnimOn:  '开启',
                themeAnimOff: '关闭'
            },
            adminDash: {
                manageHint1: '修改后点击右侧「保存修改」',
                manageHint2: '昵称、手机号、邮箱、密码、UID 将实时同步'
            }
        },
        en: {
            common: {
                themeFontSmall:  'Small',
                themeFontMedium: 'Medium',
                themeFontLarge:  'Large',
                themeFontXl:     'XL',
                themeRadiusSmall:  'Sharp',
                themeRadiusMedium: 'Medium',
                themeRadiusLarge:  'Rounded',
                themeAnimOn:  'On',
                themeAnimOff: 'Off'
            },
            adminDash: {
                manageHint1: 'Click "Save" on the right after editing',
                manageHint2: 'Nickname, phone, email, password, UID sync in real time'
            }
        },
        ja: {
            common: {
                themeFontSmall:  '小',
                themeFontMedium: '標準',
                themeFontLarge:  '大',
                themeFontXl:     '特大',
                themeRadiusSmall:  '直角',
                themeRadiusMedium: '標準',
                themeRadiusLarge:  '丸み',
                themeAnimOn:  'オン',
                themeAnimOff: 'オフ'
            },
            adminDash: {
                manageHint1: '編集後、右側の「保存」をクリック',
                manageHint2: 'ニックネーム・電話・メール・パスワード・UIDが即時同期されます'
            }
        },
        ko: {
            common: {
                themeFontSmall:  '작게',
                themeFontMedium: '보통',
                themeFontLarge:  '크게',
                themeFontXl:     '특대',
                themeRadiusSmall:  '직각',
                themeRadiusMedium: '보통',
                themeRadiusLarge:  '둥글게',
                themeAnimOn:  '켜기',
                themeAnimOff: '끄기'
            },
            adminDash: {
                manageHint1: '편집 후 오른쪽 "저장"을 클릭하세요',
                manageHint2: '닉네임·전화·이메일·비밀번호·UID가 실시간 동기화됩니다'
            }
        },
        fr: {
            common: {
                themeFontSmall:  'Petit',
                themeFontMedium: 'Standard',
                themeFontLarge:  'Grand',
                themeFontXl:     'Très grand',
                themeRadiusSmall:  'Droit',
                themeRadiusMedium: 'Standard',
                themeRadiusLarge:  'Arrondi',
                themeAnimOn:  'Activé',
                themeAnimOff: 'Désactivé'
            },
            adminDash: {
                manageHint1: 'Cliquez sur « Enregistrer » à droite après modification',
                manageHint2: 'Pseudo, téléphone, e-mail, mot de passe et UID synchronisés en temps réel'
            }
        },
        es: {
            common: {
                themeFontSmall:  'Pequeño',
                themeFontMedium: 'Estándar',
                themeFontLarge:  'Grande',
                themeFontXl:     'Extra grande',
                themeRadiusSmall:  'Recto',
                themeRadiusMedium: 'Estándar',
                themeRadiusLarge:  'Redondeado',
                themeAnimOn:  'Activado',
                themeAnimOff: 'Desactivado'
            },
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