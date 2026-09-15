/* ============================================================
 * 主题系统 · 独立模块（Supabase 同步版）
 * 支持：主题配色 / 字号 / 圆角 / 动效 的保存与同步
 * 主题切换带"从左到右扫描"效果
 * ⭐ 修复：连点防抖 + 清理旧 overlay
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
        { code: 'default',   label: '金' },
        { code: 'blue',      label: '蓝' },
        { code: 'purple',    label: '紫' },
        { code: 'green',     label: '绿' },
        { code: 'orange',    label: '橙' },
        { code: 'pink',      label: '粉' },
        { code: 'ruby',      label: '红宝石' },
        { code: 'cyan',      label: '青' },
        { code: 'mint',      label: '薄荷' },
        { code: 'coffee',    label: '咖啡' },
        { code: 'ice',       label: '冰川' },
        { code: 'rose',      label: '玫瑰金' },
        { code: 'sakura',    label: '樱花' },
        { code: 'space',     label: '深空' },
        { code: 'forest',    label: '森林' },
        { code: 'ocean',     label: '深海' },
        { code: 'amber',     label: '琥珀' },
        { code: 'coral',     label: '珊瑚' },
        { code: 'peach',     label: '桃色' },
        { code: 'olive',     label: '橄榄' },
        { code: 'indigo',    label: '靛蓝' },
        { code: 'turquoise', label: '松石' },
        { code: 'violet',    label: '紫罗兰' },
        { code: 'navy',      label: '藏青' },
        { code: 'lotus',     label: '藕荷' },
        { code: 'bamboo',    label: '竹青' },
        { code: 'light',     label: '浅色' }
    ];

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

    /* ============================================================
     * 主题切换 —— 带"从左到右扫描"效果（含防抖）
     * ============================================================ */
    var lastSwitchTs = 0;
    var SWITCH_COOLDOWN = 900;   // 与动画时长一致

    function switchThemeWithScan(themeCode) {
        var now = Date.now();
        if (now - lastSwitchTs < SWITCH_COOLDOWN) return;
        lastSwitchTs = now;

        // 清掉所有旧的扫描层
        document.querySelectorAll('.theme-scan-overlay').forEach(function (o) {
            if (o.parentNode) o.parentNode.removeChild(o);
        });

        var html = document.documentElement;
        var prevTheme = html.getAttribute('data-theme') || 'default';

        // 1. 临时切到目标，读取背景色
        if (themeCode === 'default') {
            html.removeAttribute('data-theme');
        } else {
            html.setAttribute('data-theme', themeCode);
        }
        var cs = getComputedStyle(html);
        var bgStart = cs.getPropertyValue('--theme-bg-start').trim() || '#131519';
        var bgEnd   = cs.getPropertyValue('--theme-bg-end').trim()   || '#101216';

        // 2. 恢复原主题
        if (prevTheme === 'default') {
            html.removeAttribute('data-theme');
        } else {
            html.setAttribute('data-theme', prevTheme);
        }

        // 3. 建 overlay
        var overlay = document.createElement('div');
        overlay.className = 'theme-scan-overlay';
        overlay.style.background = 'linear-gradient(160deg, ' + bgStart + ' 0%, ' + bgEnd + ' 100%)';
        document.body.appendChild(overlay);

        // 4. 动画中点正式切
        setTimeout(function () {
            setLocal('theme', themeCode);
            applyAll(readPrefs());
            saveToSupabase('theme', themeCode);
        }, 400);

        // 5. 结束移除
        setTimeout(function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 900);
    }

    /* ---------- 保存到 Supabase ---------- */
    function saveToSupabase(key, value) {
        var sb = window.supabaseClient;
        if (!sb || !sb.auth) return;
        sb.auth.getUser().then(function (res) {
            if (res.error || !res.data.user) return;
            var uid = res.data.user.id;

            if (key === 'theme') {
                sb.from('profiles').update({ theme: value }).eq('id', uid).then(function () {});
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
                switchThemeWithScan(t.code);
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