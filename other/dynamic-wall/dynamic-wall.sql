-- ============================================================
--  动态墙 · 数据库层
--  依赖：已有 public.profiles / public.is_admin()
-- ============================================================

-- ------------------------------------------------------------
--  0. 辅助函数：从 JWT 读管理员身份（触发器里安全使用）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jwt_is_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
    SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role'), 'user') = 'admin';
$$;
GRANT EXECUTE ON FUNCTION public.jwt_is_admin() TO authenticated;


-- ------------------------------------------------------------
--  1. AI 分级配置表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_config (
    id          SERIAL PRIMARY KEY,
    module      TEXT NOT NULL,             -- post / comment / user / report
    action      TEXT NOT NULL,             -- audit / delete / mute / ban
    level       SMALLINT NOT NULL DEFAULT 2,  -- 0=L0 1=L1 2=L2 3=L3
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    updated_by  UUID,
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (module, action)
);

INSERT INTO public.ai_config (module, action, level, description) VALUES
    ('post',    'audit',  0, '动态审核：AI 判定 ok/warn/block 并直接落库'),
    ('post',    'delete', 1, '动态删除：AI 可隐藏，同时进复审队列'),
    ('comment', 'audit',  0, '评论审核'),
    ('comment', 'delete', 1, '评论删除'),
    ('user',    'mute',   2, '禁言：仅给建议，管理员手动'),
    ('user',    'ban',    3, '封禁：全手动')
ON CONFLICT (module, action) DO NOTHING;


-- ------------------------------------------------------------
--  2. 敏感词库
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_wordlist (
    id          SERIAL PRIMARY KEY,
    word        TEXT NOT NULL UNIQUE,
    category    TEXT DEFAULT 'general',
    level       SMALLINT DEFAULT 2,   -- 命中后的建议级别
    enabled     BOOLEAN DEFAULT TRUE,
    created_by  UUID,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_wordlist_enabled ON public.ai_wordlist(enabled) WHERE enabled = TRUE;


-- ------------------------------------------------------------
--  3. AI 决策表（所有 AI 行为落库，可回滚）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_decisions (
    id              BIGSERIAL PRIMARY KEY,
    module          TEXT NOT NULL,
    action          TEXT NOT NULL,
    target_type     TEXT NOT NULL,          -- post / comment / user
    target_id       BIGINT,                 -- 目标主键（user 用 NULL）
    target_user_id  UUID,                   -- 关联用户（便于统计）
    level           SMALLINT NOT NULL,      -- 决策时生效的级别

    ai_verdict      TEXT,                   -- ok / warn / block
    ai_confidence   NUMERIC(4,3),
    ai_reason       TEXT,
    ai_tags         TEXT[],

    before_state    JSONB,                  -- 应用前的状态快照
    after_state     JSONB,                  -- 应用后的目标状态
    applied         BOOLEAN DEFAULT FALSE,
    reverted        BOOLEAN DEFAULT FALSE,

    reviewed_by     UUID,
    reviewed_at     TIMESTAMPTZ,
    review_note     TEXT,

    reverted_by     UUID,
    reverted_at     TIMESTAMPTZ,
    revert_reason   TEXT,

    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_target   ON public.ai_decisions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_pending  ON public.ai_decisions(applied, reverted, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_decisions_user     ON public.ai_decisions(target_user_id, created_at DESC);


-- ------------------------------------------------------------
--  4. AI 调用日志（成本 / 耗时）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_logs (
    id                 BIGSERIAL PRIMARY KEY,
    model              TEXT,
    module             TEXT,
    prompt_tokens      INT DEFAULT 0,
    completion_tokens  INT DEFAULT 0,
    total_tokens       INT DEFAULT 0,
    cost_usd           NUMERIC(12,6) DEFAULT 0,
    latency_ms         INT DEFAULT 0,
    decision_id        BIGINT REFERENCES public.ai_decisions(id) ON DELETE SET NULL,
    ok                 BOOLEAN DEFAULT TRUE,
    error              TEXT,
    created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ai_logs_day ON public.ai_logs(created_at DESC);


-- ------------------------------------------------------------
--  5. 用户信任度
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_user_trust (
    user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    trust_score       INT NOT NULL DEFAULT 100,
    total_posts       INT NOT NULL DEFAULT 0,
    total_ok          INT NOT NULL DEFAULT 0,
    total_violations  INT NOT NULL DEFAULT 0,
    last_violation_at TIMESTAMPTZ,
    forced_manual     BOOLEAN DEFAULT FALSE,
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);


-- ------------------------------------------------------------
--  6. 动态主表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.posts (
    id              BIGSERIAL PRIMARY KEY,
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content         TEXT NOT NULL,
    images          TEXT[] DEFAULT '{}',
    is_anonymous    BOOLEAN NOT NULL DEFAULT FALSE,

    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','published','hidden','deleted','rejected')),

    ai_verdict      TEXT,
    ai_confidence   NUMERIC(4,3),
    ai_reason       TEXT,
    ai_tags         TEXT[],
    ai_decision_id  BIGINT REFERENCES public.ai_decisions(id) ON DELETE SET NULL,

    reviewed_by     UUID,
    reviewed_at     TIMESTAMPTZ,
    review_note     TEXT,

    is_pinned       BOOLEAN NOT NULL DEFAULT FALSE,
    is_featured     BOOLEAN NOT NULL DEFAULT FALSE,

    like_count      INT NOT NULL DEFAULT 0,
    comment_count   INT NOT NULL DEFAULT 0,
    report_count    INT NOT NULL DEFAULT 0,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_posts_wall     ON public.posts(status, is_pinned DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_user     ON public.posts(user_id, created_at DESC);


-- ------------------------------------------------------------
--  7. 点赞 / 评论 / 举报
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.post_likes (
    id         BIGSERIAL PRIMARY KEY,
    post_id    BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_comments (
    id             BIGSERIAL PRIMARY KEY,
    post_id        BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    content        TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'published'
                   CHECK (status IN ('pending','published','hidden','deleted')),
    ai_verdict     TEXT,
    ai_confidence  NUMERIC(4,3),
    ai_decision_id BIGINT REFERENCES public.ai_decisions(id) ON DELETE SET NULL,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_post_comments_post ON public.post_comments(post_id, created_at);

CREATE TABLE IF NOT EXISTS public.post_reports (
    id           BIGSERIAL PRIMARY KEY,
    post_id      BIGINT NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
    reporter_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reason       TEXT,
    status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','resolved','rejected')),
    handled_by   UUID,
    handled_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, reporter_id)
);


-- ============================================================
--  8. 字段保护触发器：普通用户改不了 status / ai_verdict / is_pinned 等
-- ============================================================
CREATE OR REPLACE FUNCTION public.protect_post_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 管理员放行；service_role / RPC(SECURITY DEFINER) 也放行（auth.uid() 为空时）
    IF public.jwt_is_admin() OR auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;

    IF  NEW.status          IS DISTINCT FROM OLD.status
     OR NEW.ai_verdict      IS DISTINCT FROM OLD.ai_verdict
     OR NEW.ai_confidence   IS DISTINCT FROM OLD.ai_confidence
     OR NEW.ai_reason       IS DISTINCT FROM OLD.ai_reason
     OR NEW.ai_tags         IS DISTINCT FROM OLD.ai_tags
     OR NEW.ai_decision_id  IS DISTINCT FROM OLD.ai_decision_id
     OR NEW.is_pinned       IS DISTINCT FROM OLD.is_pinned
     OR NEW.is_featured     IS DISTINCT FROM OLD.is_featured
     OR NEW.like_count      IS DISTINCT FROM OLD.like_count
     OR NEW.comment_count   IS DISTINCT FROM OLD.comment_count
     OR NEW.report_count    IS DISTINCT FROM OLD.report_count
     OR NEW.reviewed_by     IS DISTINCT FROM OLD.reviewed_by
     OR NEW.reviewed_at     IS DISTINCT FROM OLD.reviewed_at
     OR NEW.review_note     IS DISTINCT FROM OLD.review_note
    THEN
        RAISE EXCEPTION 'permission denied: protected fields (admin only)';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_post_fields ON public.posts;
CREATE TRIGGER trg_protect_post_fields
    BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION public.protect_post_fields();


-- 评论同理，保护 status / ai_*
CREATE OR REPLACE FUNCTION public.protect_comment_fields()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF public.jwt_is_admin() OR auth.uid() IS NULL THEN
        RETURN NEW;
    END IF;
    IF  NEW.status         IS DISTINCT FROM OLD.status
     OR NEW.ai_verdict     IS DISTINCT FROM OLD.ai_verdict
     OR NEW.ai_confidence  IS DISTINCT FROM OLD.ai_confidence
     OR NEW.ai_decision_id IS DISTINCT FROM OLD.ai_decision_id
    THEN
        RAISE EXCEPTION 'permission denied: protected comment fields';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_protect_comment_fields ON public.post_comments;
CREATE TRIGGER trg_protect_comment_fields
    BEFORE UPDATE ON public.post_comments
    FOR EACH ROW EXECUTE FUNCTION public.protect_comment_fields();


-- ============================================================
--  9. 计数触发器
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_post_like_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts SET like_count = like_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_post_like_count ON public.post_likes;
CREATE TRIGGER trg_sync_post_like_count
    AFTER INSERT OR DELETE ON public.post_likes
    FOR EACH ROW EXECUTE FUNCTION public.sync_post_like_count();

CREATE OR REPLACE FUNCTION public.sync_post_comment_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'published' THEN
        UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
        UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.post_id;
    ELSIF TG_OP = 'UPDATE' AND OLD.status <> NEW.status THEN
        IF NEW.status = 'published' THEN
            UPDATE public.posts SET comment_count = comment_count + 1 WHERE id = NEW.post_id;
        ELSIF OLD.status = 'published' THEN
            UPDATE public.posts SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.post_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_post_comment_count ON public.post_comments;
CREATE TRIGGER trg_sync_post_comment_count
    AFTER INSERT OR UPDATE OR DELETE ON public.post_comments
    FOR EACH ROW EXECUTE FUNCTION public.sync_post_comment_count();

CREATE OR REPLACE FUNCTION public.sync_post_report_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE public.posts SET report_count = report_count + 1 WHERE id = NEW.post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.posts SET report_count = GREATEST(report_count - 1, 0) WHERE id = OLD.post_id;
    END IF;
    RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_sync_post_report_count ON public.post_reports;
CREATE TRIGGER trg_sync_post_report_count
    AFTER INSERT OR DELETE ON public.post_reports
    FOR EACH ROW EXECUTE FUNCTION public.sync_post_report_count();


-- ============================================================
-- 10. RLS
-- ============================================================
ALTER TABLE public.ai_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_wordlist      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_decisions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_user_trust    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reports     ENABLE ROW LEVEL SECURITY;

-- ---------- ai_config ----------
DROP POLICY IF EXISTS ai_config_read  ON public.ai_config;
DROP POLICY IF EXISTS ai_config_write ON public.ai_config;
CREATE POLICY ai_config_read  ON public.ai_config FOR SELECT TO authenticated
    USING (TRUE);                                   -- 用户端也要读，用于决定是否走 AI
CREATE POLICY ai_config_write ON public.ai_config FOR ALL    TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- ai_wordlist ----------
DROP POLICY IF EXISTS ai_wordlist_admin ON public.ai_wordlist;
CREATE POLICY ai_wordlist_admin ON public.ai_wordlist FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- ai_decisions ----------
DROP POLICY IF EXISTS ai_decisions_admin ON public.ai_decisions;
CREATE POLICY ai_decisions_admin ON public.ai_decisions FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- ai_logs ----------
DROP POLICY IF EXISTS ai_logs_admin ON public.ai_logs;
CREATE POLICY ai_logs_admin ON public.ai_logs FOR SELECT TO authenticated
    USING (public.is_admin());

-- ---------- ai_user_trust ----------
DROP POLICY IF EXISTS ai_user_trust_self  ON public.ai_user_trust;
DROP POLICY IF EXISTS ai_user_trust_admin ON public.ai_user_trust;
CREATE POLICY ai_user_trust_self  ON public.ai_user_trust FOR SELECT TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY ai_user_trust_admin ON public.ai_user_trust FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------- posts ----------
DROP POLICY IF EXISTS posts_select ON public.posts;
DROP POLICY IF EXISTS posts_insert ON public.posts;
DROP POLICY IF EXISTS posts_update_self  ON public.posts;
DROP POLICY IF EXISTS posts_update_admin ON public.posts;
DROP POLICY IF EXISTS posts_delete_self  ON public.posts;
DROP POLICY IF EXISTS posts_delete_admin ON public.posts;

CREATE POLICY posts_select ON public.posts FOR SELECT TO authenticated
    USING (
        status = 'published'
        OR user_id = auth.uid()
        OR public.is_admin()
    );

CREATE POLICY posts_insert ON public.posts FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- 用户自更新：只能改 content / images / is_anonymous（触发器会拦 protected 字段）
CREATE POLICY posts_update_self ON public.posts FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY posts_update_admin ON public.posts FOR UPDATE TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY posts_delete_self ON public.posts FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY posts_delete_admin ON public.posts FOR DELETE TO authenticated
    USING (public.is_admin());

-- ---------- post_likes ----------
DROP POLICY IF EXISTS post_likes_read   ON public.post_likes;
DROP POLICY IF EXISTS post_likes_insert ON public.post_likes;
DROP POLICY IF EXISTS post_likes_delete ON public.post_likes;
CREATE POLICY post_likes_read   ON public.post_likes FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY post_likes_insert ON public.post_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_likes_delete ON public.post_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ---------- post_comments ----------
DROP POLICY IF EXISTS post_comments_read   ON public.post_comments;
DROP POLICY IF EXISTS post_comments_insert ON public.post_comments;
DROP POLICY IF EXISTS post_comments_delete ON public.post_comments;
CREATE POLICY post_comments_read ON public.post_comments FOR SELECT TO authenticated
    USING (status = 'published' OR user_id = auth.uid() OR public.is_admin());
CREATE POLICY post_comments_insert ON public.post_comments FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);
CREATE POLICY post_comments_delete ON public.post_comments FOR DELETE TO authenticated
    USING (auth.uid() = user_id OR public.is_admin());

-- ---------- post_reports ----------
DROP POLICY IF EXISTS post_reports_insert ON public.post_reports;
DROP POLICY IF EXISTS post_reports_read   ON public.post_reports;
DROP POLICY IF EXISTS post_reports_admin  ON public.post_reports;
CREATE POLICY post_reports_insert ON public.post_reports FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY post_reports_read   ON public.post_reports FOR SELECT TO authenticated
    USING (public.is_admin() OR auth.uid() = reporter_id);
CREATE POLICY post_reports_admin  ON public.post_reports FOR ALL TO authenticated
    USING (public.is_admin()) WITH CHECK (public.is_admin());


-- ============================================================
-- 11. RPC：应用 / 回滚 AI 决策
-- ============================================================

-- 11.1 应用决策（由 Edge Function 或管理员手动调用）
--      p_apply_state: 需要写入目标表的状态快照，如 {"status":"published"}
CREATE OR REPLACE FUNCTION public.ai_apply_decision(
    p_decision_id BIGINT,
    p_apply_state JSONB
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_dec  ai_decisions%ROWTYPE;
    v_before JSONB;
BEGIN
    SELECT * INTO v_dec FROM ai_decisions WHERE id = p_decision_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'decision not found: %', p_decision_id;
    END IF;
    IF v_dec.applied THEN
        RETURN jsonb_build_object('ok', TRUE, 'skipped', 'already applied');
    END IF;

    -- 记录应用前状态
    IF v_dec.target_type = 'post' THEN
        SELECT jsonb_build_object('status', status, 'ai_verdict', ai_verdict)
          INTO v_before FROM posts WHERE id = v_dec.target_id;

        UPDATE posts
           SET status        = COALESCE(p_apply_state->>'status', status),
               ai_verdict    = COALESCE(p_apply_state->>'ai_verdict', ai_verdict),
               ai_confidence = COALESCE((p_apply_state->>'ai_confidence')::NUMERIC, ai_confidence),
               ai_reason     = COALESCE(p_apply_state->>'ai_reason', ai_reason),
               ai_decision_id= v_dec.id,
               updated_at    = NOW()
         WHERE id = v_dec.target_id;

    ELSIF v_dec.target_type = 'comment' THEN
        SELECT jsonb_build_object('status', status, 'ai_verdict', ai_verdict)
          INTO v_before FROM post_comments WHERE id = v_dec.target_id;

        UPDATE post_comments
           SET status        = COALESCE(p_apply_state->>'status', status),
               ai_verdict    = COALESCE(p_apply_state->>'ai_verdict', ai_verdict),
               ai_confidence = COALESCE((p_apply_state->>'ai_confidence')::NUMERIC, ai_confidence),
               ai_decision_id= v_dec.id
         WHERE id = v_dec.target_id;
    END IF;

    UPDATE ai_decisions
       SET applied      = TRUE,
           before_state = COALESCE(v_before, '{}'::jsonb),
           after_state  = p_apply_state
     WHERE id = p_decision_id;

    RETURN jsonb_build_object('ok', TRUE, 'before', v_before, 'after', p_apply_state);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ai_apply_decision(BIGINT, JSONB) TO authenticated;


-- 11.2 回滚决策（管理员）
CREATE OR REPLACE FUNCTION public.ai_revert_decision(
    p_decision_id BIGINT,
    p_reason      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_dec ai_decisions%ROWTYPE;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'permission denied: admin only';
    END IF;

    SELECT * INTO v_dec FROM ai_decisions WHERE id = p_decision_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'decision not found'; END IF;
    IF NOT v_dec.applied THEN RAISE EXCEPTION 'decision not applied yet'; END IF;
    IF v_dec.reverted THEN RETURN jsonb_build_object('ok', TRUE, 'skipped', 'already reverted'); END IF;

    IF v_dec.target_type = 'post' AND v_dec.before_state <> '{}'::jsonb THEN
        UPDATE posts
           SET status     = COALESCE(v_dec.before_state->>'status', status),
               ai_verdict = v_dec.before_state->>'ai_verdict',
               updated_at = NOW()
         WHERE id = v_dec.target_id;
    ELSIF v_dec.target_type = 'comment' AND v_dec.before_state <> '{}'::jsonb THEN
        UPDATE post_comments
           SET status     = COALESCE(v_dec.before_state->>'status', status),
               ai_verdict = v_dec.before_state->>'ai_verdict'
         WHERE id = v_dec.target_id;
    END IF;

    UPDATE ai_decisions
       SET reverted      = TRUE,
           reverted_by   = auth.uid(),
           reverted_at   = NOW(),
           revert_reason = p_reason
     WHERE id = p_decision_id;

    RETURN jsonb_build_object('ok', TRUE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.ai_revert_decision(BIGINT, TEXT) TO authenticated;


-- 11.3 信任度：扣分 / 恢复
CREATE OR REPLACE FUNCTION public.ai_trust_delta(
    p_user_id UUID,
    p_delta   INT,
    p_reason  TEXT DEFAULT NULL
)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_new INT;
BEGIN
    IF NOT (public.is_admin() OR auth.uid() IS NULL OR auth.uid() = p_user_id) THEN
        RAISE EXCEPTION 'permission denied';
    END IF;

    INSERT INTO ai_user_trust (user_id, trust_score, updated_at)
    VALUES (p_user_id, 100 + p_delta, NOW())
    ON CONFLICT (user_id) DO UPDATE
        SET trust_score = GREATEST(0, LEAST(200, ai_user_trust.trust_score + p_delta)),
            total_violations = ai_user_trust.total_violations
                               + CASE WHEN p_delta < 0 THEN 1 ELSE 0 END,
            last_violation_at = CASE WHEN p_delta < 0 THEN NOW()
                                     ELSE ai_user_trust.last_violation_at END,
            forced_manual = CASE
                WHEN GREATEST(0, LEAST(200, ai_user_trust.trust_score + p_delta)) < 40 THEN TRUE
                WHEN p_delta > 0 AND GREATEST(0, LEAST(200, ai_user_trust.trust_score + p_delta)) >= 60 THEN FALSE
                ELSE ai_user_trust.forced_manual
            END,
            updated_at = NOW()
    RETURNING trust_score INTO v_new;

    RETURN v_new;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ai_trust_delta(UUID, INT, TEXT) TO authenticated;


-- ============================================================
-- 12. 验证查询
-- ============================================================
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'post%' OR tablename LIKE 'ai_%';
-- SELECT schemaname, tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('posts','post_likes','post_comments','post_reports','ai_config','ai_decisions') ORDER BY tablename;