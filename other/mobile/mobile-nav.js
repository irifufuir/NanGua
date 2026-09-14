/* ============================================================
 *  mobile-nav.js
 *  齿轮盛宴 · 移动端导航重构（user + admin 共用）
 *  ------------------------------------------------------------
 *  把侧边栏的 .nav-menu 拆成两行：
 *    ┌──────────────────────────────────────────┐
 *    │ [主菜单1] [主菜单2] [主菜单3] ...       │  ← 主菜单行
 *    ├──────────────────────────────────────────┤
 *    │ [子项1] [子项2] [子项3] ...             │  ← 子菜单行
 *    └──────────────────────────────────────────┘
 *
 *  引入方式（在 </body> 之前）：
 *      <script src="other/mobile/mobile-nav.js"></script>
 *
 *  桌面端（>768px）不生效，原有 nav 结构保持原样。
 * ============================================================ */
(function () {
    'use strict';

    var mq = window.matchMedia('(max-width: 768px)');

    function build() {
        if (!mq.matches) return;

        var navMenu = document.querySelector('.nav-menu');
        if (!navMenu) return;
        if (navMenu.dataset.mobileBuilt === '1') {
            if (window.refreshMobileSubRow) window.refreshMobileSubRow();
            return;
        }

        /* 1. 建两行容器 */
        var rowMain = document.createElement('div');
        rowMain.className = 'mobile-nav-row mobile-nav-row-main';

        var rowSub = document.createElement('div');
        rowSub.className = 'mobile-nav-row mobile-nav-row-sub';

        /* 2. 分类塞进两行 */
        Array.prototype.slice.call(navMenu.children).forEach(function (el) {
            if (el.classList && el.classList.contains('nav-sub')) {
                rowSub.appendChild(el);
            } else {
                rowMain.appendChild(el);
            }
        });

        /* 3. 重建结构 */
        navMenu.innerHTML = '';
        navMenu.appendChild(rowMain);
        navMenu.appendChild(rowSub);
        navMenu.dataset.mobileBuilt = '1';

        /* 4. 只显示当前激活/打开的那组子菜单 */
        function refreshSubRow() {
            var allSubs = rowSub.querySelectorAll('.nav-sub');
            if (allSubs.length === 0) return;

            var activeSub = null;
            allSubs.forEach(function (sub) {
                if (sub.classList.contains('open')) activeSub = sub;
            });
            if (!activeSub) {
                allSubs.forEach(function (sub) {
                    if (sub.querySelector('.nav-sub-item.active')) activeSub = sub;
                });
            }
            if (!activeSub) activeSub = allSubs[0];

            allSubs.forEach(function (sub) {
                sub.style.display = (sub === activeSub) ? 'flex' : 'none';
            });
        }
        window.refreshMobileSubRow = refreshSubRow;

        /* 5. 事件绑定 */

        rowMain.querySelectorAll('.nav-group').forEach(function (group) {
            group.addEventListener('click', function () {
                setTimeout(refreshSubRow, 0);
            });
        });

        rowSub.querySelectorAll('.nav-sub-item').forEach(function (item) {
            item.addEventListener('click', function () {
                setTimeout(refreshSubRow, 0);
            });
        });

        function bindPlainItems(root) {
            root.querySelectorAll('.nav-item').forEach(function (item) {
                if (item.classList.contains('nav-group')) return;
                if (item.dataset.mobileBound === '1') return;
                item.dataset.mobileBound = '1';
                item.addEventListener('click', function () {
                    setTimeout(function () {
                        rowSub.querySelectorAll('.nav-sub').forEach(function (sub) {
                            sub.style.display = 'none';
                        });
                    }, 0);
                });
            });
        }
        bindPlainItems(rowMain);

        /* 6. 对外暴露：动态新增节点后调用它重建 */
        window.rebuildMobileNav = function () {
            Array.prototype.slice.call(navMenu.children).forEach(function (el) {
                if (el.classList && el.classList.contains('mobile-nav-row')) return;
                rowMain.appendChild(el);
            });
            bindPlainItems(rowMain);
            refreshSubRow();
        };

        refreshSubRow();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', build);
    } else {
        build();
    }

    /* 桌面缩到手机时也生效 */
    if (mq.addEventListener) {
        mq.addEventListener('change', function (e) {
            if (e.matches) build();
        });
    } else if (mq.addListener) {
        mq.addListener(function (e) {
            if (e.matches) build();
        });
    }
})();