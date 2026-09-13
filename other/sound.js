/* ============================================================
 *  登录音效模块（全站共享）
 *  window.LoginSound.play()           直接播放
 *  window.LoginSound.isEnabled()      读取开关状态
 *  window.LoginSound.playIfEnabled()  按开关播放
 *  localStorage 键：nangua_loginSound = 'on' | 'off'
 * ============================================================ */
(function () {
    'use strict';

    var STORAGE_KEY = 'nangua_loginSound';
    var sharedCtx   = null;

    function getCtx() {
        if (sharedCtx) return sharedCtx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { sharedCtx = new Ctx(); } catch (e) { return null; }
        return sharedCtx;
    }

    function unlock() {
        var ctx = getCtx();
        if (ctx && ctx.state === 'suspended') {
            ctx.resume().catch(function () {});
        }
    }
    ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
        document.addEventListener(ev, unlock, { passive: true });
    });

    function playInternal(ctx) {
        try {
            var t    = ctx.currentTime;
            var osc  = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = 'sine';
            osc.frequency.setValueAtTime(660,  t);
            osc.frequency.setValueAtTime(880,  t + 0.08);
            osc.frequency.setValueAtTime(1100, t + 0.16);

            gain.gain.setValueAtTime(0.15, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

            osc.start(t);
            osc.stop(t + 0.4);
        } catch (e) {}
    }

    function playLoginSound() {
        var ctx = getCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().then(function () { playInternal(ctx); }).catch(function () {});
        } else {
            playInternal(ctx);
        }
    }

    function isLoginSoundEnabled() {
        return (localStorage.getItem(STORAGE_KEY) || 'off') === 'on';
    }

    function playLoginSoundIfEnabled() {
        if (isLoginSoundEnabled()) playLoginSound();
    }

    window.LoginSound = {
        play:          playLoginSound,
        isEnabled:     isLoginSoundEnabled,
        playIfEnabled: playLoginSoundIfEnabled
    };
})();