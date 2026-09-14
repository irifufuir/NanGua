/* ============================================================
 * 拖拽模块 · 独立脚本
 * 用法：
 *   1. 引入：<script src="other/draggable.js"></script>
 *   2. 给想拖动的元素加属性：data-draggable
 *      例如：<div class="box" data-draggable>
 *   3. 可选：data-drag-handle=".card-head"
 *      限制只有某个子元素能拖（用于大卡片）
 *
 *   特性：
 *   - 输入框 / 按钮 / 链接上按下时不触发拖动
 *   - 双击自动复位
 *   - 支持鼠标 + 触屏
 *   - 拖动位置自动记忆到 localStorage，刷新后仍在原位
 *   - ⭐ 通过 CSS 变量 --drag-x / --drag-y 传递位移，
 *     让打开/关闭动画也能感知拖动位置（避免跳变）
 * ============================================================ */

(function () {
    'use strict';

    var EXCLUDE = 'button, a, input, textarea, select, option, label, [data-no-drag]';

    function getPoint(e) {
        if (e.touches && e.touches.length) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function storageKey(el) {
        // 用 id 或 data-drag-id 作为 key，避免多个元素互相覆盖
        return 'drag_pos_' + (el.id || el.getAttribute('data-drag-id') || 'default');
    }

    function makeDraggable(el) {
        var offsetX = 0;
        var offsetY = 0;
        var startX  = 0;
        var startY  = 0;
        var dragging = false;

        var handleSel = el.getAttribute('data-drag-handle');
        var handle = handleSel ? el.querySelector(handleSel) : el;
        var key = storageKey(el);

        // ---- 恢复上次的位置 ----
        try {
            var saved = JSON.parse(localStorage.getItem(key) || 'null');
            if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
                offsetX = saved.x;
                offsetY = saved.y;
                // ⭐ 改动 1：改用 CSS 变量，让动画可以读取该位移
                el.style.setProperty('--drag-x', offsetX + 'px');
                el.style.setProperty('--drag-y', offsetY + 'px');
            }
        } catch (e) {}

        function onDown(e) {
            var target = e.target;

            if (target.closest && target.closest(EXCLUDE)) return;
            if (handleSel && (!handle || !handle.contains(target))) return;

            dragging = true;
            var pt = getPoint(e);
            startX = pt.x - offsetX;
            startY = pt.y - offsetY;

            el.classList.add('is-dragging');
            document.body.classList.add('dragging-active');
            e.preventDefault();
        }

        function onMove(e) {
            if (!dragging) return;
            var pt = getPoint(e);
            offsetX = pt.x - startX;
            offsetY = pt.y - startY;
            // ⭐ 改动 2：改用 CSS 变量，动画期间也能保持位置
            el.style.setProperty('--drag-x', offsetX + 'px');
            el.style.setProperty('--drag-y', offsetY + 'px');
            e.preventDefault();
        }

        function onUp() {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('is-dragging');
            document.body.classList.remove('dragging-active');

            // ---- 保存位置 ----
            try {
                localStorage.setItem(key, JSON.stringify({ x: offsetX, y: offsetY }));
            } catch (e) {}
        }

        el.addEventListener('mousedown', onDown);
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);

        el.addEventListener('touchstart', onDown, { passive: false });
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
        document.addEventListener('touchcancel', onUp);

        // 双击复位
        el.addEventListener('dblclick', function (e) {
            if (e.target.closest && e.target.closest(EXCLUDE)) return;
            offsetX = 0;
            offsetY = 0;
            // ⭐ 改动 3：复位也走 CSS 变量
            el.style.setProperty('--drag-x', '0px');
            el.style.setProperty('--drag-y', '0px');
            try { localStorage.removeItem(key); } catch (err) {}
        });
    }

    function init() {
        document.querySelectorAll('[data-draggable]').forEach(makeDraggable);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();