-- ============================================================
--  Nangua Security · Supabase 后端防护 SQL
--  ----------------------------------------------------------
--  在 Supabase SQL Editor 里逐段执行
--  执行前请先备份或在自己的测试项目里验证
-- ============================================================

-- ============================================================
--  一、辅助函数：从 JWT 里读自定义角色
-- ============================================================
-- Supabase 的 JWT payload 里 app_metadata 会被透传
-- 我们约定：管理员 = app_metadata.user_role = 'admin'

CREATE OR REPLACE FUNCTION public.jwt_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(
        (auth.jwt() -> 'app_metadata' ->> 'user_role'),
        'user'
    );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT public.jwt_user_role() = 'admin';
$$;

-- 让所有已登录用户都能调用（只读，安全）
GRANT EXECUTE ON FUNCTION public.jwt_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()      TO authenticated;

-- ============================================================
--  二、profiles 表：RLS 收紧
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 清理旧策略（按需保留）
DROP POLICY IF EXISTS "profiles_read_authenticated"    ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_own_or_admin"   ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self"           ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"   ON public.profiles;
DROP POLICY IF EXISTS "Admin can update profiles"      ON public.profiles;
DROP POLICY IF EXISTS "Admin can delete profiles"      ON public.profiles;
DROP POLICY IF EXISTS "Admin can view profiles"        ON public.profiles;
DROP POLICY IF EXISTS "Admins can read all profiles"   ON public.profiles;

-- 1) SELECT：本人 or 管理员
CREATE POLICY "profiles_select_self_or_admin"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
        auth.uid() = id
        OR public.is_admin()
    );

-- 2) INSERT：仅本人（注册时）
CREATE POLICY "profiles_insert_self"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = id);

-- 3) UPDATE：本人（字段受限）or 管理员（全字段）
CREATE POLICY "profiles_update_self"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING  (auth.uid() = id)
    WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_admin"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING  (public.is_admin())
    WITH CHECK (public.is_admin());

-- 4) DELETE：仅管理员
CREATE POLICY "profiles_delete_admin"
    ON public.profiles
    FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- ⚠️ 注意：active_device_id / is_blocked / points / uid 这些字段
--    普通用户能不能写，取决于你的业务。
--    如果希望普通用户只能改 full_name / phone / bio / avatar_url，
--    需要改用 RPC + 字段白名单（见下方"六、字段级写保护"）。

-- ============================================================
--  三、业务表 RLS 通用模板
-- ============================================================
-- 下面以常见表为例，按你自己的表结构修改
-- ============================================================

-- ---------- announcements（公告） ----------
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "announcements_all" ON public.announcements;

CREATE POLICY "announcements_read_all"
    ON public.announcements FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "announcements_write_admin"
    ON public.announcements FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------- feedbacks（反馈） ----------
ALTER TABLE public.feedbacks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "feedbacks_all" ON public.feedbacks;

CREATE POLICY "feedbacks_select_self_or_admin"
    ON public.feedbacks FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "feedbacks_insert_self"
    ON public.feedbacks FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "feedbacks_update_admin"
    ON public.feedbacks FOR UPDATE
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

CREATE POLICY "feedbacks_delete_self_or_admin"
    ON public.feedbacks FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

-- ---------- messages（私信） ----------
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "messages_all" ON public.messages;

CREATE POLICY "messages_select_participant"
    ON public.messages FOR SELECT
    TO authenticated
    USING (
        auth.uid() = from_user
        OR auth.uid() = to_user
        OR public.is_admin()
    );

CREATE POLICY "messages_insert_sender"
    ON public.messages FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = from_user);

CREATE POLICY "messages_update_participant"
    ON public.messages FOR UPDATE
    TO authenticated
    USING (auth.uid() = to_user OR public.is_admin())
    WITH CHECK (auth.uid() = to_user OR public.is_admin());

CREATE POLICY "messages_delete_admin"
    ON public.messages FOR DELETE
    TO authenticated
    USING (public.is_admin());

-- ---------- friendships（好友） ----------
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "friendships_all" ON public.friendships;

CREATE POLICY "friendships_select_participant"
    ON public.friendships FOR SELECT
    TO authenticated
    USING (
        auth.uid() = user_id
        OR auth.uid() = friend_id
        OR public.is_admin()
    );

CREATE POLICY "friendships_insert_self"
    ON public.friendships FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "friendships_update_participant"
    ON public.friendships FOR UPDATE
    TO authenticated
    USING (auth.uid() = friend_id OR public.is_admin())
    WITH CHECK (auth.uid() = friend_id OR public.is_admin());

CREATE POLICY "friendships_delete_participant"
    ON public.friendships FOR DELETE
    TO authenticated
    USING (
        auth.uid() = user_id
        OR auth.uid() = friend_id
        OR public.is_admin()
    );

-- ---------- point_logs（积分流水） ----------
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "point_logs_all" ON public.point_logs;

CREATE POLICY "point_logs_select_self_or_admin"
    ON public.point_logs FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "point_logs_insert_admin"
    ON public.point_logs FOR INSERT
    TO authenticated
    WITH CHECK (public.is_admin());

-- ---------- user_purchases（兑换记录） ----------
ALTER TABLE public.user_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_purchases_all" ON public.user_purchases;

CREATE POLICY "user_purchases_select_self_or_admin"
    ON public.user_purchases FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_purchases_delete_self_or_admin"
    ON public.user_purchases FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

-- ---------- shop_items（商城） ----------
ALTER TABLE public.shop_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "shop_items_all" ON public.shop_items;

CREATE POLICY "shop_items_read_all"
    ON public.shop_items FOR SELECT
    TO authenticated
    USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "shop_items_write_admin"
    ON public.shop_items FOR ALL
    TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ---------- checkins / checkin_config / forgot_requests / achievements / user_achievements ----------
-- 用相同模板：
--   * 读：本人 or 管理员
--   * 写：本人（仅自己的数据）or 管理员
--   * 配置表（checkin_config / achievements）：只读给普通用户，写仅管理员

ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkins_all" ON public.checkins;
CREATE POLICY "checkins_select_self_or_admin"
    ON public.checkins FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "checkins_insert_self"
    ON public.checkins FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.checkin_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkin_config_all" ON public.checkin_config;
CREATE POLICY "checkin_config_read_all"
    ON public.checkin_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "checkin_config_write_admin"
    ON public.checkin_config FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.forgot_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "forgot_requests_all" ON public.forgot_requests;
CREATE POLICY "forgot_requests_insert_any"
    ON public.forgot_requests FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "forgot_requests_admin_only"
    ON public.forgot_requests FOR SELECT TO authenticated
    USING (public.is_admin());
CREATE POLICY "forgot_requests_admin_del"
    ON public.forgot_requests FOR DELETE TO authenticated
    USING (public.is_admin());

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "achievements_all" ON public.achievements;
CREATE POLICY "achievements_read_all"
    ON public.achievements FOR SELECT TO authenticated USING (true);
CREATE POLICY "achievements_write_admin"
    ON public.achievements FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_achievements_all" ON public.user_achievements;
CREATE POLICY "user_achievements_select_self_or_admin"
    ON public.user_achievements FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "user_achievements_insert_admin"
    ON public.user_achievements FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

-- ============================================================
--  四、敏感 RPC：权限校验模板
-- ============================================================

-- 4.1 封禁用户（仅管理员）
CREATE OR REPLACE FUNCTION public.admin_ban_user(
    target_user_id UUID,
    ban_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission denied: admin only';
    END IF;

    UPDATE public.profiles
    SET is_blocked  = TRUE,
        banned_until = CASE
            WHEN ban_seconds <= 0 THEN NULL
            ELSE NOW() + (ban_seconds || ' seconds')::INTERVAL
        END
    WHERE id = target_user_id;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_user(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(UUID, INTEGER) TO authenticated;

-- 4.2 解封（仅管理员）
CREATE OR REPLACE FUNCTION public.admin_unban_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission denied: admin only';
    END IF;

    UPDATE public.profiles
    SET is_blocked   = FALSE,
        banned_until = NULL
    WHERE id = target_user_id;

    RETURN jsonb_build_object('success', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unban_user(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(UUID) TO authenticated;

-- ============================================================
--  五、给管理员账号写入 user_role（一次性）
-- ============================================================
-- ⚠️ 这段不能在 SQL Editor 里跑，必须用 Supabase Admin API（服务端）
--    （因为要写 auth.users 的 app_metadata，需要 service_role key）
-- ------------------------------------------------------------
-- Node.js 示例（部署在你的 Edge Function 或本地脚本里）：
--
--   const { createClient } = require('@supabase/supabase-js');
--   const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
--       auth: { autoRefreshToken: false, persistSession: false }
--   });
--
--   await admin.auth.admin.updateUserById('用户UUID', {
--       app_metadata: { user_role: 'admin' }
--   });
--
-- ⚠️ SERVICE_ROLE_KEY 绝不能出现在前端代码里！
--
-- 执行完之后，该用户重新登录，JWT 里就会带上：
--   {
--     "app_metadata": { "user_role": "admin" },
--     ...
--   }
-- 之后所有 RLS 策略、is_admin() 都会正确识别。

-- ============================================================
--  六、字段级写保护（可选，更严格）
-- ============================================================
-- 如果你希望普通用户**只能改昵称/手机号/bio/头像**，
-- 不允许改 points / uid / is_blocked / active_device_id 等
-- 可以用"列级权限"+ RPC 白名单：
--
-- 6.1 收回 profiles 表上普通用户对敏感列的 UPDATE
-- REVOKE UPDATE (points, uid, is_blocked, banned_until, active_device_id)
--   ON public.profiles FROM authenticated;
--
-- 6.2 提供 RPC 给普通用户改自己的昵称/bio
-- CREATE OR REPLACE FUNCTION public.update_my_profile(
--     new_full_name TEXT,
--     new_phone     TEXT,
--     new_bio       TEXT
-- )
-- RETURNS JSONB
-- LANGUAGE plpgsql
-- SECURITY DEFINER
-- SET search_path = public
-- AS $$
-- BEGIN
--     IF auth.uid() IS NULL THEN
--         RAISE EXCEPTION 'not authenticated';
--     END IF;
--     UPDATE public.profiles
--     SET full_name = COALESCE(new_full_name, full_name),
--         phone     = COALESCE(new_phone, phone),
--         bio       = COALESCE(new_bio, bio)
--     WHERE id = auth.uid();
--     RETURN jsonb_build_object('success', TRUE);
-- END;
-- $$;
-- GRANT EXECUTE ON FUNCTION public.update_my_profile(TEXT, TEXT, TEXT) TO authenticated;

-- ============================================================
--  七、验证脚本
-- ============================================================
-- 查所有策略：
--   SELECT schemaname, tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE schemaname = 'public'
--   ORDER BY tablename, policyname;
--
-- 查某表的 RLS 是否开启：
--   SELECT relname, relrowsecurity
--   FROM pg_class
--   WHERE relname IN ('profiles','messages','feedbacks', ...);
--
-- 模拟普通用户：用普通账号登录前端，Console 里跑：
--   supabaseClient.from('profiles').select('*')
--   → 应该只返回自己这一行
--
-- 模拟普通用户越权：
--   supabaseClient.from('profiles').update({points: 99999}).eq('id', 别人的id)
--   → 应该 0 行受影响 or 报权限错误