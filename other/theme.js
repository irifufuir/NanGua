/* ============================================================
 * 主题系统 · 独立模块（Supabase 同步版）
 * 支持：主题配色 / 字号 / 圆角 / 动效 的保存与同步
 * ============================================================ */

(function () {
    var PREFIX = 'nangua_';
    var DEFAULTS = {
        theme:      'default',
        fontSize:   'medium',
        radius:     'medium',
        animations: 'on'
    };

    var THEMES = [
        { code: 'default', label: '金' },
        { code: 'blue',    label: '蓝' },
        { code: 'purple',  label: '紫' },
        { code: 'green',   label: '绿' },
        { code: 'orange',  label: '橙' },
        { code: 'pink',    label: '粉' },
        { code: 'ruby',    label: '红宝石' },
        { code: 'cyan',    label: '青' },
        { code: 'mint',    label: '薄荷' },
        { code: 'coffee',  label: '咖啡' },
        { code: 'ice',     label: '冰川' },
        { code: 'rose',    label: '玫瑰金' },
        { code: 'sakura',  label: '樱花' },
        { code: 'space',   label: '深空' },
        { code: 'forest',  label: '森林' },
        { code: 'ocean',   label: '深海' },
        { code: 'light',   label: '浅色' }
    ];

    /* ---------- 本地存储 ---------- */
    function getLocal(key) {
        return localStorage.getItem(PREFIX + key) || DEFAULTS[key];
    }
    function setLocal(key, val) {
        localStorage.setItem(PREFIX + key, val);
    }

    function readPrefs() {
        return {
            theme:      getLocal('theme'),
            fontSize:   getLocal('fontSize'),
            radius:     getLocal('radius'),
            animations: getLocal('animations')
        };
    }

    function applyAll(prefs) {
        if (prefs.theme === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', prefs.theme);
        }
        document.documentElement.setAttribute('data-font', prefs.fontSize);
        document.documentElement.setAttribute('data-radius', prefs.radius);
        document.documentElement.setAttribute('data-animations', prefs.animations);
        updateButtonStates(prefs);
    }

    function updateButtonStates(prefs) {
        document.querySelectorAll('.theme-dot').forEach(function (d) {
            d.classList.toggle('active',
                d.getAttribute('data-theme') === prefs.theme);
        });
        document.querySelectorAll('.setting-options').forEach(function (group) {
            var key = group.getAttribute('data-setting');
            var cur = prefs[key];
            group.querySelectorAll('.setting-btn').forEach(function (btn) {
                btn.classList.toggle('active',
                    btn.getAttribute('data-value') === cur);
            });
        });
    }

    /* ---------- 写回 Supabase ---------- */
    function saveToSupabase(key, value) {
        var sb = window.supabaseClient;
        if (!sb || !sb.auth) return;

        sb.auth.getUser().then(function (res) {
            if (res.error || !res.data.user) return;
            var uid = res.data.user.id;

            if (key === 'theme') {
                sb.from('profiles')
                  .update({ theme: value })
                  .eq('id', uid)
                  .then(function () {});
            } else {
                sb.from('profiles')
                  .select('ui_prefs')
                  .eq('id', uid)
                  .maybeSingle()
                  .then(function (r) {
                      var prefs = (r.data && r.data.ui_prefs) || {};
                      prefs[key] = value;
                      sb.from('profiles')
                        .update({ ui_prefs: prefs })
                        .eq('id', uid)
                        .then(function () {});
                  });
            }
        });
    }

    /* ---------- 从 Supabase 读一次 ---------- */
    function loadFromSupabase() {
        var sb = window.supabaseClient;
        if (!sb || !sb.auth) return;

        sb.auth.getUser().then(function (res) {
            if (res.error || !res.data.user) return;
            var uid = res.data.user.id;

            sb.from('profiles')
              .select('theme, ui_prefs')
              .eq('id', uid)
              .maybeSingle()
              .then(function (r) {
                  if (r.error || !r.data) return;

                  var remote = {
                      theme:      r.data.theme || DEFAULTS.theme,
                      fontSize:   DEFAULTS.fontSize,
                      radius:     DEFAULTS.radius,
                      animations: DEFAULTS.animations
                  };
                  var up = r.data.ui_prefs || {};
                  if (up.fontSize)   remote.fontSize   = up.fontSize;
                  if (up.radius)     remote.radius     = up.radius;
                  if (up.animations) remote.animations = up.animations;

                  Object.keys(remote).forEach(function (k) {
                      setLocal(k, remote[k]);
                  });
                  applyAll(remote);
              });
        });
    }

    /* ---------- 注入主题圆点 ---------- */
    function injectThemeSwitcher() {
        var container = document.getElementById('themeSwitcherContainer');
        if (!container) return;

        var wrap = document.createElement('div');
        wrap.className = 'theme-switcher';

        var label = document.createElement('span');
        label.className = 'theme-switcher-label';
        label.textContent = '主题配色（共 ' + THEMES.length + ' 种）';
        wrap.appendChild(label);

        THEMES.forEach(function (t) {
            var dot = document.createElement('button');
            dot.type = 'button';
            dot.className = 'theme-dot';
            dot.setAttribute('data-theme', t.code);
            dot.setAttribute('title', t.label);
            dot.addEventListener('click', function () {
                setLocal('theme', t.code);
                applyAll(readPrefs());
                saveToSupabase('theme', t.code);
            });
            wrap.appendChild(dot);
        });

        container.appendChild(wrap);
    }

    function bindSettingGroups() {
        document.querySelectorAll('.setting-options').forEach(function (group) {
            var key = group.getAttribute('data-setting');
            group.querySelectorAll('.setting-btn').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    var val = btn.getAttribute('data-value');
                    setLocal(key, val);
                    applyAll(readPrefs());
                    saveToSupabase(key, val);
                });
            });
        });
    }

    function bindResetButton() {
        var resetBtn = document.getElementById('resetAppearanceBtn');
        if (!resetBtn) return;

        resetBtn.addEventListener('click', function () {
            if (!confirm('确定要恢复所有外观设置为默认吗？')) return;

            Object.keys(DEFAULTS).forEach(function (k) {
                setLocal(k, DEFAULTS[k]);
            });
            applyAll(DEFAULTS);

            var sb = window.supabaseClient;
            if (sb && sb.auth) {
                sb.auth.getUser().then(function (res) {
                    if (res.error || !res.data.user) return;
                    var uid = res.data.user.id;
                    sb.from('profiles')
                      .update({
                          theme: DEFAULTS.theme,
                          ui_prefs: {
                              fontSize:   DEFAULTS.fontSize,
                              radius:     DEFAULTS.radius,
                              animations: DEFAULTS.animations
                          }
                      })
                      .eq('id', uid)
                      .then(function () {});
                });
            }
            alert('已恢复默认外观');
        });
    }

    function init() {
        applyAll(readPrefs());
        injectThemeSwitcher();
        bindSettingGroups();
        bindResetButton();
        loadFromSupabase();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();