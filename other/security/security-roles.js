/* ============================================================
 *  角色读取工具 · other/security/security-roles.js
 *  ----------------------------------------------------------
 *  同步从 Supabase Auth 的 localStorage token 里读 role。
 *  用于 security-guard.js 在页面加载瞬间就能决定是否启用防护。
 *
 *  ⚠️ 重要：这里读到的 role 只用于"决定要不要加载前端防护 UI"，
 *          不是安全边界。真正的权限判断在 Supabase RLS。
 * ============================================================ */
(function () {
    'use strict';

    var ROLE_CLAIM = 'user_role';  // JWT app_metadata 里的自定义角色字段

    function findAuthToken() {
        try {
            var keys = Object.keys(localStorage);
            for (var i = 0; i < keys.length; i++) {
                if (/-auth-token$/.test(keys[i])) {
                    return localStorage.getItem(keys[i]);
                }
            }
        } catch (e) {}
        return null;
    }

    /**
     * 同步读取角色
     * @returns {'admin'|'user'|'unknown'}
     */
    function getRole() {
        var raw = findAuthToken();
        if (!raw) return 'unknown';

        try {
            var data = JSON.parse(raw);
            var user = data && data.user;
            if (!user) return 'unknown';

            // 优先读 app_metadata.user_role（自定义 claim）
            var role = user.app_metadata && user.app_metadata[ROLE_CLAIM];
            if (role === 'admin') return 'admin';
            if (role === 'user')  return 'user';

            // 兜底：Supabase 内置 role 字段
            var fallback = user.app_metadata && user.app_metadata.role;
            if (fallback === 'admin') return 'admin';

            return 'user';
        } catch (e) {
            return 'unknown';
        }
    }

    function isAdmin() {
        return getRole() === 'admin';
    }

    window.SecurityRoles = {
        getRole:  getRole,
        isAdmin:  isAdmin,
        ROLE_CLAIM: ROLE_CLAIM
    };
})();