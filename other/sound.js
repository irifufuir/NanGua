/* ============================================================
 *  音效模块（全站共享）
 *  window.LoginSound.play()                 播放登录音效
 *  window.LoginSound.playIfEnabled()        按开关播放登录音效
 *  window.LoginSound.playMessage()          播放消息提示音
 *  window.LoginSound.playMessageIfEnabled() 按开关播放消息提示音
 *  window.LoginSound.unlock()               主动解锁 AudioContext
 * ============================================================ */
(function () {
    'use strict';

    var LOGIN_KEY   = 'nangua_loginSound';
    var MESSAGE_KEY = 'nangua_messageSound';
    var sharedCtx   = null;

    function getCtx() {
        if (sharedCtx) return sharedCtx;
        var Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        try { sharedCtx = new Ctx(); } catch (e) { return null; }
        return sharedCtx;
    }

    /* ⭐ 强化版 unlock：同步播放极短音效，激活音频通道 */
    function unlock() {
        var ctx = getCtx();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            ctx.resume().catch(function () {});
        }

        /* 播放一段几乎无声的音频（5ms），让浏览器"记住"这是用户手势 */
        try {
            var t = ctx.currentTime;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.setValueAtTime(0.00001, t);
            osc.start(t);
            osc.stop(t + 0.005);
        } catch (e) {}
    }

    ['click', 'touchstart', 'keydown', 'pointerdown'].forEach(function (ev) {
        document.addEventListener(ev, unlock, { passive: true });
    });

    /* 登录音效：三声升调 */
    function playLoginInternal(ctx) {
        try {
            var t = ctx.currentTime;
            var osc = ctx.createOscillator();
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

    /* 消息提示音：两声短促叮咚 */
    function playMessageInternal(ctx) {
        try {
            var t = ctx.currentTime;
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1320, t);
            osc.frequency.setValueAtTime(990,  t + 0.10);
            osc.frequency.setValueAtTime(1320, t + 0.20);
            osc.frequency.setValueAtTime(990,  t + 0.30);
            gain.gain.setValueAtTime(0.14, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
            osc.start(t);
            osc.stop(t + 0.45);
        } catch (e) {}
    }

    function _play(fn) {
        var ctx = getCtx();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            ctx.resume().then(function () { fn(ctx); }).catch(function () {});
        } else {
            fn(ctx);
        }
    }

    function playLoginSound()   { _play(playLoginInternal); }
    function playMessageSound() { _play(playMessageInternal); }

    function isLoginSoundEnabled()   { return (localStorage.getItem(LOGIN_KEY)   || 'off') === 'on'; }
    function isMessageSoundEnabled() { return (localStorage.getItem(MESSAGE_KEY) || 'off') === 'on'; }

    function playLoginSoundIfEnabled()   { if (isLoginSoundEnabled())   playLoginSound();   }
    function playMessageSoundIfEnabled() { if (isMessageSoundEnabled()) playMessageSound(); }

    window.LoginSound = {
        play:          playLoginSound,
        isEnabled:     isLoginSoundEnabled,
        playIfEnabled: playLoginSoundIfEnabled,

        playMessage:          playMessageSound,
        isMessageEnabled:     isMessageSoundEnabled,
        playMessageIfEnabled: playMessageSoundIfEnabled,

        unlock:        unlock
    };
})();