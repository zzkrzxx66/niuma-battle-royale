# 牛马大逃杀 · Supabase 接入清单

项目已配置到：

```text
https://xgxofpdmyzzrmdoxcjjk.supabase.co
```

GitHub Secrets 也已写入：

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

当前还差 **2 个后台开关/脚本**，做完后就能真正联机。

---

## 第一步：开启匿名登录（必须）

1. 打开 Supabase 项目后台  
2. 进入 `Authentication` → `Providers`  
3. 找到 `Anonymous`  
4. 打开 `Enable Anonymous sign-ins`  
5. Save

不开启时，游戏会报：

```text
匿名登录未开启
```

---

## 第二步：执行建表 SQL（必须）

1. 打开 `SQL Editor`  
2. 新建 query  
3. 粘贴仓库里的：

```text
supabase-light-online.sql
```

4. 点击 Run

执行成功后应出现这些表：

```text
profiles
cloud_saves
leaderboard_scores
daily_challenges
daily_claims
```

---

## 第三步：确认今日挑战数据

SQL 脚本会插入当天挑战。  
也可在 Table Editor 里查看 `daily_challenges`。

如果没有当天数据，游戏会自动用本地默认挑战模板。

---

## 第四步：重新安装带密钥的 APK

旧 APK 可能是在 Secrets 写入前构建的。  
需要重新构建并安装新版，主菜单才会显示：

```text
🌐 联机：已连接 · 你的昵称
```

而不是本地模式。

---

## 验证清单

安装新 APK 后：

1. 打开游戏  
2. 点 `☁️ 云存档`  
3. 状态应显示 `已连接`  
4. 改一个昵称并保存  
5. 点 `立即同步`  
6. 打一局后看结算是否显示“联机成绩：已上传”  
7. 打开 `🏅 排行榜` 看是否有自己的分数

---

## 常见错误

### 1) Anonymous sign-ins are disabled
去开启 Anonymous Provider。

### 2) Could not find the table public.xxx
去 SQL Editor 执行 `supabase-light-online.sql`。

### 3) 仍显示本地模式
说明 APK 没打进密钥，重新用 GitHub Actions 构建安装。

### 4) 网络连接失败
检查手机网络，或 Supabase 项目是否暂停。
