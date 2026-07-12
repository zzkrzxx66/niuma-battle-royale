# 《牛马大逃杀》技术设计文档 / TDD

## 1. 技术目标

在浏览器和 Android WebView 中提供低依赖、快速启动、可离线游玩的 2D 动作游戏；保持游戏模拟与 React UI 解耦；允许主要内容通过数据表扩展；在线服务不可成为单机游玩的硬依赖。

## 2. 技术栈与目录

| 层 | 技术/目录 | 职责 |
|---|---|---|
| 构建 | Vite 6 | ESM、开发服务器、生产打包 |
| UI | React 19，`src/components/` | 菜单、HUD、弹窗、触屏控件 |
| 游戏模拟 | 原生 JS，`src/game/core.js` | 状态、实体、战斗、AI、模式、掉落、结算 |
| 渲染 | Canvas 2D，`render.js`/`sprites.js` | 世界、单位、弹幕、特效、小地图 |
| 输入 | `input.js` | 键鼠、触屏摇杆、全局按键路由 |
| 音频 | WebAudio，`audio.js`/`bgm.js` | 合成音效、程序 BGM、状态切轨 |
| 数据 | `src/game/data/` | 武器、技能、怪物、道具、商店等 |
| UI 桥 | `bridge.js` | 事件总线与版本订阅 |
| 在线 | Supabase，`src/online/` | 匿名身份、云存档、每日、榜单、离线队列 |
| 移动封装 | Capacitor 8，`android/` | Android WebView 应用 |

## 3. 运行架构

```text
浏览器事件 ──> input.js ───────────────┐
                                       v
requestAnimationFrame ──> core.update(dt) ──> GameState G
        │                         │             │
        │                         ├─ bridge.emit(feed/warn)
        │                         ├─ localStorage
        │                         └─ online service (async)
        v                                       │
render(ctx) <───────────────────────────────────┘
        │
        └─ Canvas 640×360

React App <─ useSyncExternalStore(bridge version)
   ├─ HUD 约 10 Hz 读取 G
   └─ Overlay 按 state 装配
```

关键原则：

- `core.js` 不直接操作 DOM。
- Canvas 每帧渲染；React HUD 通过 0.1 秒节流通知更新。
- 网络请求异步执行，不阻塞模拟。
- 在线未配置或断网时退化为本地模式。

## 4. 状态模型

### 4.1 应用状态

`menu | playing | levelup | paused | dead | win`

`GameCanvas` 只在 `playing` 调用 `update(dt)`，任何 Overlay 状态都会冻结模拟。`dt` 最大限制为 0.033 秒，降低后台切回后的大步长穿透和爆发更新。

### 4.2 GameState

核心字段分组：

- 模式：`mode`, `trial`, `endlessWave`, `dailyChallenge`。
- 时间：`t`, `trialOffset`, `eventT`, `endT`, `winT`。
- 实体：`units`, `projs`, `pickups`, `turrets`, `burns`。
- 表现：`floats`, `parts`, `fx`, `freezeT`。
- 关卡：`obstacles`, `decor`, `zone`, `zonePhases`。
- 进度：`kills`, `goldEarned`, `pendingLevels`, `boss*`。
- 刷新器：`chipT`, `itemT`, `techT`, `eliteT`, `minibossT`。

### 4.3 Unit

当前所有单位共享宽对象，并用布尔标签区分：`isPlayer`, `isBoss`, `isHR`, `isElite`, `isMob`, `isSummon`。通用字段包含位置、生命、速度、武器、mods、buffs、状态、AI 与各类专属计时器。

风险：字段契约隐式、对象持续膨胀。近期方案是补 JSDoc 类型和构造器；中期将运行时专属状态放入 `components` 子对象，而不是立即重写 ECS。

建议类型：

```js
/** @typedef {'battle'|'daily'|'endless'} GameMode */
/** @typedef {'menu'|'playing'|'levelup'|'paused'|'dead'|'win'} AppState */
/** @typedef {{x:number,y:number,r:number,alive:boolean,hp:number,hpBase:number,...}} Unit */
```

## 5. 每帧更新顺序

目标顺序应稳定并有测试保护：

1. 击杀慢动作与游戏时间。
2. BGM 状态刷新。
3. 试用期波次与考核。
4. 缩圈、无尽、随机事件调度。
5. 玩家与所有单位更新。
6. 副武器、主动持续状态、蒸馏、AI。
7. 投射物、爆炸、燃烧区和碰撞。
8. 拾取物、刷新器、掉落清理。
9. 特效、飘字与对象回收。
10. 死亡/胜利条件与结算提交。

变更更新顺序可能改变同帧死亡、拾取、复活和胜负判定，应视为行为变更。

## 6. 战斗计算

### 6.1 武器伤害

```text
baseDamage = weapon.dmg
levelMultiplier = grow^(weaponLevel-1)
grow = 1.15 for drone, otherwise 1.30
weaponDamage = baseDamage × levelMultiplier × mods.dmg × empower
```

传说武器不再使用基础武器等级成长。射速使用软上限：

```text
f = mods.fireRate × temporaryFireBuff × overflowCurse
effectiveFireRate = f,                          f <= 2
                  = 2 + sqrt(f-2) × 0.6,       f > 2
```

副武器再限制到最多 1.6 倍有效射速。

### 6.2 伤害管线约束

- 所有直接伤害必须通过 `applyDamage`，避免绕过护盾、状态和死亡结算。
- 环境圈伤使用 `cause:'zone'`，可绕过普通无敌。
- 范围伤害必须携带 owner，以支持敌我判断、击杀归属和触发效果。
- 递归伤害（链电、反伤、溅射）需要防重复目标或递归标记。

### 6.3 阵营

`isFoe(a,b)` 处理自身、死亡、召唤物主人和同一召唤主人。当前精英之间互不为敌，普通杂鱼仍可能与其他阵营交互。新增阵营时应改为显式 `faction`，避免继续叠布尔条件。

## 7. 内容数据规范

### 7.1 ID

- 全部内容使用稳定小写 snake_case ID。
- ID 一旦进入存档或在线成绩不得复用。
- 名称可修改，ID 不随品牌文案变更。
- 实验内容增加 `status: 'experimental'`；下线内容使用 `legacy`，不直接删除存档 ID。

### 7.2 数据与行为

- 纯参数留在 `data/`。
- 新的 projectile/weapon `kind` 在武器运行时注册表中实现。
- 技能只通过 `mods` 修改的可保持数据函数；复杂技能应注册 hook，避免继续把逻辑散布在 `core.js`。
- 数据加载时执行 schema 校验：必填字段、引用 ID、数组长度、等级上限、数值非负。

建议引入轻量校验脚本 `scripts/validate-content.mjs`，至少检查：

- 所有配方武器和传说 ID 存在。
- 所有精灵 key 存在。
- 技能、模组、商店 ID 唯一。
- `eff` 数组长度覆盖最大等级。
- 人设内容只引用同一人设或通用搭档。

## 8. 推荐模块拆分

不做一次性重写，按可测试边界渐进拆分：

```text
src/game/
├─ state/
│  ├─ createGame.js
│  ├─ createUnit.js
│  └─ types.js
├─ combat/
│  ├─ damage.js
│  ├─ weapons.js
│  ├─ projectiles.js
│  └─ factions.js
├─ systems/
│  ├─ trial.js
│  ├─ zone.js
│  ├─ endless.js
│  ├─ events.js
│  ├─ progression.js
│  └─ drops.js
├─ ai/
│  ├─ worker.js
│  ├─ mob.js
│  ├─ elite.js
│  └─ boss.js
└─ core.js      # 只保留调度与公共 API
```

第一批优先拆 `calcDamage`, `levelNeed`, `waveComp`, `applyRunRules`, `buildDraftPool` 等纯逻辑。

## 9. 随机数与确定性

当前使用 `Math.random()`，每日挑战的 seed 仅作为数据存在。目标实现：

- `createRng(seed)` 提供 `float`, `int`, `pick`, `shuffle`。
- `GameState.rng` 负责所有影响玩法的随机行为。
- 纯表现粒子可使用独立非确定 RNG，不能影响碰撞与掉落。
- 结算记录 `seed`, `contentVersion`, `rulesHash`。
- headless 仿真可用同一 seed 重放。

## 10. React 与 bridge

### 已有约定

- `bridge.emit` 用于离散事件：`feed`, `warn`, `feed-clear`, `mute-toggle`。
- `bridge.notify` 增加版本号，React 用 `useSyncExternalStore` 订阅。
- HUD 从 `getG()` 读取当前快照，不复制整个 GameState 到 React state。

### 改进

- `useEffect(() => bridge.on(...), [])` 的订阅必须返回清理函数；当前个别组件可统一审查。
- 结算异步回写 `G.onlineScore` 前应确认本局 token，避免快速重开后旧请求写入新局。
- Overlay 路由可从条件堆叠改为状态映射，减少遗漏。

## 11. 存档

### 11.1 本地 key

| Key | 内容 |
|---|---|
| `niuma_gold` | 金币 |
| `niuma_shop` | 永久升级 |
| `niuma_achievements` | 成就时间戳 |
| `niuma_stats` | 累计统计 |
| `niuma_dex` | 图鉴 |
| `niuma_best` | 经典最佳 |
| `niuma_endless_best` | 无尽最高波 |
| `niuma_trial` | 试用期选择 |
| `niuma_chosen_weapon` | 开局自选武器 |
| `niuma_firemode` | 开火模式 |
| `niuma_pending_scores` | 离线待上传成绩，最多 20 条 |

### 11.2 版本与迁移

云存档 bundle 当前 `version:1`。后续每次 schema 变化必须增加迁移函数：

```text
migrateSave(v1) -> v2
validateSave(v2)
mergeCloudAndLocal(local, cloud)
```

当前云/本地冲突以更新时间覆盖，无法合并两端各自产生的进度。目标应对金币、成就、图鉴采用单调合并，对设置采用最近写入。

## 12. 在线服务

### 12.1 配置

环境变量：

```bash
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

未配置时 `ONLINE_ENABLED=false`，所有单机功能仍可用。数据库初始化脚本位于根目录 `supabase-light-online.sql`，包含 profiles、cloud_saves、leaderboard_scores、daily_challenges、daily_claims 和 RLS。

### 12.2 初始化流程

1. 获取 session；没有则匿名登录。
2. upsert profile。
3. 并行拉 profile、云存档、每日挑战。
4. 比较更新时间，下载较新的云存档或上传本地存档。
5. 标记 online 并冲刷待上传成绩。

### 12.3 当前限制

- 客户端计算分数和可疑标记，不具备强反作弊能力。
- 每日奖励表已创建，但缺少受保护的领取接口。
- profile 聚合统计字段未在提交成绩时更新。
- 匿名账号在卸载应用后可能无法恢复，除非后续绑定账号。

### 12.4 推荐服务端接口

- `submit_run(payload)`：校验用户、版本、规则哈希、速率和基本统计后写成绩。
- `claim_daily(date)`：验证当日有效成绩并原子写 claim/奖励。
- `merge_cloud_save(payload, revision)`：乐观锁和版本迁移。

## 13. 每日挑战规则应用

必须集中实现，不能在 UI 和各系统分散判断：

```js
function applyRunRules(g, rules) {
  g.rules = normalizeRules(rules);
  g.enemySpeedMul = g.rules.modifiers.enemySpeedMul ?? 1;
  g.goldMul = g.rules.modifiers.goldMul ?? 1;
  g.bossAt = g.rules.modifiers.bossTime ?? TUNE.bossAt;
}
```

`speedOf`、`earnGold`、`endChecks` 均读取标准化后的 GameState 字段。UI 也从同一标准化对象显示规则。

## 14. 渲染与性能

### 14.1 逻辑分辨率

- Canvas 固定 640×360，通过 CSS 按窗口等比缩放。
- `imageSmoothingEnabled=false`，CSS 使用 `pixelated/crisp-edges`。
- 世界坐标按摄像机偏移绘制。

### 14.2 当前热点

- 多处对 `G.units` 全量遍历和 `nearestUnit` 线性搜索。
- 碰撞、光环、燃烧区、投射物可能形成 O(U×P) 或 O(U×B)。
- 大量粒子和飘字使用临时对象。

### 14.3 性能预算

| 指标 | 目标 |
|---|---|
| 桌面 | 60 FPS，P95 帧耗时 < 16.7 ms |
| 中低端 Android | 30 FPS 下不影响输入与碰撞 |
| 活跃单位 | 常态 < 120，压力测试 250 |
| 活跃投射物 | 常态 < 500，压力测试 1200 |
| React HUD | ≤ 10 次更新/秒 |
| 首屏 JS | gzip < 180 KB；在线模块后续动态拆分 |

当对象规模超过预算时，先引入空间哈希用于邻近查询，再考虑对象池。低特效模式应减少粒子、震屏、光晕和飘字，不改变模拟。

## 15. 音频

- 用户第一次交互后初始化 AudioContext。
- 状态改变时取消尚未播放的延时音符。
- BGM 按试用期、正式战斗、Boss 战和狂暴切轨。
- M 静音并通过 bridge 刷新 UI。
- Android WebView 需实机验证锁屏、后台、来电后 AudioContext 恢复。

## 16. 构建与发布

### Web

```bash
npm ci
npm run dev
npm run build
npm run preview
```

生产产物位于 `dist/`。

### Android

```bash
npm run build
npx cap sync android
cd android
./gradlew assembleDebug
```

Capacitor 配置：应用 ID `com.niuma.battleroyale`，`webDir=dist`，HTTPS scheme，禁止 mixed content。发布前关闭 WebView 调试已在配置中完成；仍需签名、版本号、隐私说明、网络权限和目标 SDK 检查。

## 17. 测试策略

### 单元测试

- 配方双向匹配、搭档查找。
- 等级需求与累计经验。
- 商店购买、满级、余额和效果聚合。
- 计分、可疑成绩边界。
- 人设卡池过滤、装备槽位、软保底。
- 伤害顺序：无敌、闪避、护盾、反伤、复活。

### 仿真测试

- 3 月试用期能按顺序结束并生成 19 名同事。
- 0 月经典局能通过缩圈路径解锁第 4 副武器槽。
- Boss 在两个触发条件下均可出现，死亡后可胜利。
- 无尽 20 波不触发胜利，金币和最高波正确。
- 每日规则固定 seed 可复现首 5 分钟生成序列。

### E2E 冒烟

- 首屏、模式选择、开局、暂停、升级、死亡、重开。
- 输入框不被全局按键拦截。
- 离线模式、错误 Supabase key、网络中断、恢复上传。
- 云存档手动上传/下载和版本不兼容提示。

## 18. CI 门禁

每次提交至少运行：

```text
npm ci
npm run lint
npm run test
npm run validate-content
npm run build
```

发布分支额外执行 Android debug build 和 Playwright 冒烟。数据表或核心公式变化必须附平衡变更说明与至少 20 个固定 seed 仿真摘要。

## 19. 可观测性

在玩家明确同意的前提下记录匿名局级数据：版本、模式、seed、试用期、局长、等级、武器、融合、技能 ID、死亡来源、Boss 出场/击杀时间、最低 FPS 档。不要上传逐帧位置或输入。

## 20. 已知技术债清单

| 优先级 | 项目 |
|---|---|
| P0 | persona 内容未过滤 |
| P0 | 每日挑战 modifiers/奖励未闭环 |
| P0 | 无测试、无 seed RNG |
| P1 | `core.js` 3518 行单体模块 |
| P1 | `Unit` schema 隐式且字段过多 |
| P1 | 客户端榜单不可强校验 |
| P1 | 无存档迁移与冲突合并策略 |
| P1 | 无尽模式计算了 `dmgMul` 但未使用 |
| P2 | Supabase 未拆包，首屏 bundle 可优化 |
| P2 | 邻近查询无空间索引 |
