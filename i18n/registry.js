/* ============================================================
 *  i18n/registry.js
 *  语言注册表 —— 登记所有支持的语言、locale 代码、文件路径
 * ============================================================ */
(function () {
    'use strict';
    window.i18nRegistry = {
        default:  'zh',   // 内部默认语言代码（沿用原约定）
        fallback: 'en',   // 回退语言
        languages: [
            { code: 'zh', locale: 'zh-CN', file: 'i18n/locales/zh-CN.js', name: '简体中文' },
            { code: 'en', locale: 'en-US', file: 'i18n/locales/en-US.js', name: 'English' },
            { code: 'ja', locale: 'ja-JP', file: 'i18n/locales/ja-JP.js', name: '日本語' },
            { code: 'ko', locale: 'ko-KR', file: 'i18n/locales/ko-KR.js', name: '한국어' },
            { code: 'fr', locale: 'fr-FR', file: 'i18n/locales/fr-FR.js', name: 'Français' },
            { code: 'es', locale: 'es-ES', file: 'i18n/locales/es-ES.js', name: 'Español' }
        ]
    };
})();