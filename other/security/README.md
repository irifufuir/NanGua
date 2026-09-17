# Nangua Security 防护模块

## 目录
- `security-roles.js`   —— 同步读取 JWT 中的角色（不依赖 async）
- `security-guard.js`   —— 前端防护主模块
- `security-guard.css`  —— 遮罩样式
- `supabase-security.sql` —— 后端 RLS / JWT / RPC 完整 SQL

## 引入顺序（放在 </body> 前）

    <link rel="stylesheet" href="other/security/security-guard.css">
    <script src="other/security/security-roles.js"></script>
    <script src="other/security/security-guard.js"></script>

## 哪些页面引入？
- ✅ index.html（登录页）
- ✅ user-dashboard.html（普通用户）
- ❌ admin-dashboard.html（管理员，完全不引入）

## 管理员豁免机制
- 管理员登录后跳转到 admin-dashboard.html，此页面**不引入任何 security 文件**
- 若在 user-dashboard.html 中检测到 role=admin，会自动调用 disable()
- 角色来源：JWT app_metadata.user_role（服务端签发，前端不可篡改）

## 部署清单
1. 复制整个 other/security/ 到项目
2. 在 index.html / user-dashboard.html 的 </body> 前引入三个文件
3. 在 supabase-security.sql 中执行 RLS 策略（见文件注释）
4. 用 Supabase Admin API 给管理员账号写入 app_metadata.user_role='admin'
5. 部署 + Cloudflare Purge Everything

## ⚠️ 重要认知
前端防护永远无法 100% 阻断源码查看。真正的安全边界：
- Supabase RLS
- RPC 里的 auth.jwt() 校验
- service_role key 只在服务端