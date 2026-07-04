# 牛马大逃杀 综合技术评审报告

**评审日期**：2026-07-04
**版本**：v16
**Commit**：0f10b0e
**评审方式**：6路并行代码 review（4 路 agent 产出可用数据 + 2 路失败/占位数据由主评审员补写），交叉验证 + 综合合并

---

## 总结判断：五个最紧要的问题

在合并去重之后，六个维度的火力其实高度集中在下面这五个点上——它们互相咬合，构成了玩家吐槽的"憋屈-爽两秒-空虚"的完整曲线：

1. **满 build 玩家 DPS 1500-2000，而老板血量 4360，第二阶段（狂暴）实际持续 1-2 秒**。设计文档承诺的"半血狂暴"在实战中根本无法感知，狂暴音效（≈1.5s）甚至播不完。
2. **试用期 XP 乘数 0.42 砸得太狠**，三个月玩家实际只到 Lv.8-10，"满 build 转正"是伪命题；反过来同事转正只有 Lv.6-7、1 个模组，追赶发育根本追不上，玩家反馈的"转正一波带走同事"从数值上就是必然。
3. **主武器攻击范式极度单一**：12 基础武器里 11 种是"从主角胸口飞出的抛射物"，6 把传说融合 5 把是"更快的子弹"，真质变率只有 1/6。副武器/引擎里现成的光环、炮台、地雷、场地、召唤全没有暴露给主武器层。
4. **技能池 59 条内容里 33 条（56%）是纯乘法数值**，试用期预期 20 次三选一里约 27 张是白绿数值卡；元素反应、诅咒、光环 proc、触发链、图腾、陷阱、on-hit 附魔、套装联动等 ARPG 标准范式几乎全缺。
5. **胜利即硬停**：`setState('win')` 触发后 `update(dt)` 直接被 `GameCanvas.jsx:32` 门控冻结，唯一交互是 Enter 回主菜单。42 个 kill-eligible 目标在 19 秒内打光，"再优化一批员工"的爽感无处安放。

下面按用户提问的六个维度展开。

---

## 一、数值平衡（对应问题①）

**给玩家的短说明**：目前老板"半血狂暴"这一段实测只有 1-2 秒，狂暴音效都没播完就被击杀了。玩家 DPS 已经溢出到 Boss 血量的 35%-45%/秒，Boss 血量至少要抬 40%，或者狂暴阈值从 50% 抬到 75% 才能让第二阶段真的存在。

### 满 build DPS vs Boss 血量的对撞

对 Claude 的满 build DPS，两种独立算法互相验证：
- **DPS 直算**：≈1983
- **乘子链**：`1.728 × 1.2544 × 2.8 × 1.57 = 9.53` 倍基础伤害
- 两者对上：`9.53 × 42 (Claude 蓄力 dmgMax) / 0.576s (蓄力周期 / 射速软上限倍率) ≈ 1983`

**以 ≈2000 DPS 为准**。ChatGPT 满 build 的 DPS ≈ 1556，也落在 2000 量级。

Boss 血量公式在 `src/game/core.js:1776-1779`：

```js
const hp = Math.round(900
  + 600 * Math.min(1, Math.max(bt / TUNE.bossAt, pl.level / 15))
  + 60 * pl.level + 90 * techN + 120 * subN + 150 * dstN
  + (pl.weapon.leg ? 400 : 0));
```

代入满配（Lv.15、techN=12、subN=6、dstN=2、传说）：**hp ≈ 4360**。狂暴触发线 2180，从满血杀到狂暴触发需要 `2180/2000 ≈ 1.1 秒`；狂暴之后再 1 秒毕业。

对照 `src/game/core.js:2318-2325` 的狂暴分支——`bb.rate ×= 1.4` 让饼阵周期变成 `4/1.4 = 2.86s`——狂暴期总时长 1-2s 根本等不到第一次饼阵落地。设计上"第二阶段"事实上不存在。

### 修复方案（推荐组合拳）

- **抬血量系数**：`techN/subN/dstN` 从 60/90/120/150 抬到 180/220/280，并叠一层乘算段 `×(1+0.15×dstN)`。
- **前置狂暴**：阈值从 0.5 抬到 0.75，狂暴期 `dmgTaken ×= 0.7`；同时 `u.shield = maxHp * 0.15; u.shieldT = 8` 让狂暴态先扛 8 秒。
- **狂暴即刻威胁**：进入狂暴时 `A.pieT = 0.3` 立即放一次饼阵，让玩家看见"变形"。
- **DPS 采样自适应**：`spawnBoss:1779` 复用 `bossDistill:2289` 的 `pw` 公式采样玩家实际 DPS，若 `pw > 10` 则 hp 再乘 1.4。

### Fewshot echo：绕过射速软上限的隐藏乘区

`fireRateOf`（core.js:146）的软上限确实存在——4.06 被压回 2.86。但 `spawnBullet:306-320` 里 Fewshot 走的是**并列 echo 弹**：主弹外额外 spawn `multishot` 颗弹，每颗 `dmg × echoMult`。Ultra Fewshot ×2 → multishot=2, echoMult=0.9 → 单次开火输出 = `1 + 2×0.9 = 2.8 倍`，这 2.8 倍**跟卷王 ×1.728、Finetune ×1.2544、暴击 ×1.57 串联相乘**，直接绕过软上限。

修复三选一（按彻底程度从高到低）：

1. `applyTechPickup:924` 把 echoMult 改为软上限式 `m.echoMult = 0.4 + 0.5 × (1 - 1/(1 + m.multishot))`——第一发 0.65、第二发 0.75、第三发 0.8。
2. Ultra Fewshot 的 echoMult 从 0.9 → 0.65（Pro 0.55、标准 0.4），把总量控制在 ×2.3。
3. `spawnBullet:308` 对 echo 额外 `×0.85` 射速惩罚，简单粗暴。

推荐方案 1，它兼容后续继续加 multishot 堆栈。

### 试用期数值 & 转正断崖

`constants.js:17,22` + `core.js:832-836`：
- `levelNeed(lvl) = round(10 × 1.26^lvl)`
- 试用期 `amt *= 0.42`

推算三个月总 XP：约 300 只杂鱼 × 2.3 XP = 690，×0.42 = 290 XP；加考核 boss 约 120 XP、通过奖金约 25 XP，合计 **≈ 435 XP** ——恰好卡在 Lv.10-11 边缘。武器芯片池试用期又只掉本武器同品牌 chip，武器 Lv.4-5 也难堆齐。

修：`0.42 → 0.55`，`levelNeed` 底数 `1.26 → 1.22`。目标：转正当刻 Lv.11-13、武器 Lv.4-5。

`spawnLateBots`（core.js:2049-2072）追赶不到位：

```js
u.weapon.lvl = clamp(1 + Math.ceil(months * .7), 1, 5);  // 3 个月 → Lv.4
gainXp(u, Math.round((G.trialXpEarned || 30 * months) * .6) + randi(0, 20));  // ≈ 184 XP → Lv.6-7
for (let k = 0; k < Math.floor(months / 2); k++)  // 3 个月 → 1 个模组
  applyTechPickup(u, pick(...), rollTier(false));
```

同事 DPS 估算 ≈ 100-200，玩家 ≈ 1500-2000，差 10-15 倍。修：武器 `clamp(2 + months, 2, 5)`；追赶 XP `0.6 → 0.85`；模组数 `months + 1`；`months >= 2` 时 50% 概率给副武器 Lv.2；`months >= 3` 时 `rollTier(true)`。目标是把同事 DPS 拉到玩家 40-60%，PVP 才成立。

### 蒸馏反制 pw 公式的漏洞

`core.js:2289`：

```js
const pw = pl.mods.dmg * Math.min(4, pl.mods.fireRate) * (1 + pl.mods.multishot * pl.mods.echoMult * .6);
```

三个致命遗漏：**不算 crit、不算 range、不算传说 dmg 系数**。Claude + 温度暴击 57% 是玩家最大的乘区，反而没被采样。修：

```js
pw = mods.dmg * min(4, mods.fireRate) * (1 + multishot * echoMult * 0.7)
   * (1 + mods.crit * 1.5) * mods.range * (weapon.leg ? 1.3 : 1);
bb.dmg = min(4, bb.dmg * (1 + min(0.6, 0.06 * pw)));
```

---

## 二、早期试用期怪物机制（对应问题②）

**给玩家的短说明**：月 1 的三种怪物在 AI 逻辑上**几乎完全一样**——全是"直线走过来撞你"，只是外观和血量数字不同。玩家看到的 60 秒里其实是"一堆办公用品朝你冲脸"。真正引入 AI 行为差异的机制怪（改期无敌、光环、组队合围、复活）从月 2 才开始加入。

### 月 1 怪物池的行为归类

`src/game/data/mobs.js:53-61` 中 `waveComp(month=1)` 返回 `types = ['email', 'cc_bomb', 'reinvent_wheel']`。这三种在 `src/game/core.js:2105-2166` 的 `updateMob` 里都走**同一段代码**：

```js
u.mobTarget = nearestUnit(u.x, u.y, 600, t => isWorker(t) && t.alive && !t.isSummon);
const a = Math.atan2(t.y - u.y, t.x - u.x) + (m.jig ? Math.sin(G.t*5+u.x*.1)*.6 : 0);
moveWithCollide(u, Math.cos(a), Math.sin(a), dt);
if (u.mobHitT <= 0 && u.mobTouch > 0 && dist(u.x, u.y, t.x, t.y) < u.r + t.r + 2) {
  u.mobHitT = 1;
  applyDamage(t, u.mobTouch || m.touch, u);
}
```

差异只有两处：
- `m.jig` 布尔（cr 有，email/cc_bomb/reinvent_wheel **都没有**）
- `mobTouch` 每 tick 造成的接触伤害

所以玩家在月 1 遇到的**行为差异 = 0**。三种怪物的机制差异全部是"死亡后触发的事"：

| 怪物 | AI 行为 | 死亡/命中后 |
|------|--------|-----------|
| email 未读邮件 | 直线追击 (spd 105) | 无 |
| cc_bomb 抄送轰炸 | 直线追击 (spd 130) | 35% 分裂出 read_reply |
| reinvent_wheel 重复造轮子任务 | 直线追击 (spd 55) | 破盾后 1.2s 硬直 |

死亡前，三种怪物的 AI 视角**完全同质化**。玩家在月 1 前 60 秒的实际体验是：**60 秒 × ~14 只/波（burst=12 + trickle ~ cap=12）= "一堆办公用品从四面八方朝你走过来"**。所谓"机制多样性前移"（v16 commit 时特意做的事）在玩家侧是**看不出来的**——分裂发生在死亡瞬间，破防硬直发生在你打到它之后。

### 缺少的品类清单

对照 Vampire Survivors / 幸存者·僵尸之夜 / 黎明前 20 分钟 的早期怪物设计，本作月 1-2 完全缺失下面这些**行为品类**（AI 层面差异，不是死亡触发）：

| 品类 | Vampire Survivors 对应 | 本作月 1-2 现状 |
|------|----------------------|---------------|
| 远程射手（保持距离+射弹） | 骷髅弓箭手/女巫 | **完全无**——所有 mob 的 mobBullet 逻辑为空，无 spawnBullet 调用 |
| 高速冲刺（周期性 dash） | 幽灵/闪现刺客 | **完全无**——所有 mob 走匀速 |
| 群体阵型（合围 vs 单点） | 蝙蝠群 | 只有 outsourced_army（月 3 才出现，且 6 只散开合围，仅此一种） |
| 分裂 / 召唤（生成小怪） | 骷髅召唤师 | cc_bomb 死亡分裂，但是**死亡触发**，不是生前召唤 |
| 沉默炮塔（固定站桩发射） | 石像鬼 | 完全无——只有 night_lamp/req_review_board 站桩，但**不主动攻击** |
| 伏击/隐身（消失重现） | 隐身刺客 | meeting_invite 有（月 2 起） |
| 光环减益（周期给场地施加 debuff） | 毒云 | urgent_meeting 有（月 3 起） |
| 二段变形（第一段挡箭牌、第二段狂暴） | Boss 常见 | reinvent_wheel 有护盾硬直，但破盾后没有变形，只是"更好打" |

**结论**：月 1-2 玩家在行为品类上只见到 1 种（直线追击）+ 月 2 加入的 1 种（消失重现）。"设计文档 v16 说做了 6 种新怪进月 1-2"是**真事**，但这 6 种在玩家侧感受到的 AI 差异只有 1-2 种。

### 修复建议

不需要新增大量怪物，把现有的"死亡触发"改造成"生前触发"就能激活很多：

1. **cc_bomb 抄送轰炸**：改为 3-4s 周期在原地"轰炸"一次，向四周投掷 3 颗低伤害追踪弹。生前就有威胁，不用打死才好玩。（新增 `mobFireCd/spawnBullet`）
2. **email 未读邮件**：改为存在时间超过 5s 后自动升级为"未读邮件·加急"，spd + 25%、touch +50%。逼玩家优先清早期的（用 `elapsedT` 字段）。
3. **新增 `phishing_mail` 钓鱼邮件**（月 1）：保持距离 200-250px，每 2.5s 向玩家发射一个"钓鱼链接"（追踪弹，命中减速）——**引入远程射手**。
4. **新增 `deadline_alarm` 死线警报**（月 2）：站桩，周期性在玩家脚下画预警圈 1s 后爆炸（复用 `G.burns` + 延迟结算）——**引入固定炮塔**。
5. **给 email/sticky 加上不同的 jig 模式**（比如 sticky 随机停顿、email 蛇形走位），让即使是白名怪物在视觉上也有差异。

**改动量估算**：mobs.js 加 2 条 + core.js updateMob 加 3 段 case ≈ 60 行，1 天工作量。

---

## 三、主武器攻击范式：一维弹幕的困局（对应问题③）

**给玩家的短说明**：现在 12 把主武器 11 把在"从胸口喷子弹"，6 把传说融合 5 把是"更快的子弹"。副武器和引擎里现成有光环、炮台、地雷、场地、召唤，但主武器一个没用——这不是引擎限制，是设计路径依赖。

### 现状盘点

| 类别 | 弹道系 | 非弹道机制 |
|------|-------|-----------|
| 12 把基础武器 | mg/sniper/shotgun/lob/homing/single/charge/twin/drone/gacha/boomerang（11 把） | 只有 chain（即刻链式判定） |
| 6 把传说融合 | leg_agi / leg_pea / leg_drone / leg_beam / leg_boom（5 把量变或半质变） | 只有 leg_pie 留下 G.burns 燃烧地带 |

对照 12 个副武器：keyboard（近战扇形）、stapler（固定炮台）、monitor（环绕撞击）、shredder（贴身 DPS 光环 dps=17@lv3）、oa_form（on-hit 减速 + 延迟引爆）、fire_sprinkler（部署减速圈）、meeting_room（灼烧圈 + 眩晕）、online_badge（移动标记引爆）、fitness_ring（尾迹定身圈）——**主武器完全没有的范式**：光环、部署炮台、on-hit debuff、场地部署、召唤实体友军。

引擎侧 `G.turrets`/`G.burns`/`t.onHitMark`/`t.badgeMarkT`/`isSummon + allyOwner`/`applyCurse` **全部跑通**，只是没暴露给 `WEAPONS` 表。

### 建议：新增 5 个非弹道 kind

不改现有 12+6，只在 `WEAPONS` 加 5 条 + `core.js:456` switch 里加对应 case。每个都能复用现有基础设施：

1. **`aura` 风起云涌**：贴身持续光环，`tickCd=0.25, dmg=6, range=70, slow=0.15`。满级 DPS ≈ 68，配上 mods.dmg 终盘 ×2 约 137——直接复用 shredder 的 tick 模式。
2. **`totem` 工位钉子户**：主武器版部署炮台，`cd=2.5, deployLife=12, maxDeploy=3, shotDmg=8, shotCd=0.55`。三炮台齐发 DPS ≈ 124，走位钓鱼流。复用 `G.turrets`。
3. **`mine` 待办清单**：移动时每 0.5s 尾迹布雷，`dmg=18, r=38, fuseT=1.5, triggerR=22`。满级单目标 DPS ≈ 50，群体爆发 200-300。复用 `G.burns` + `explodeAt`。
4. **`summon` 实习生军团**：`cd=6, maxSummons=3, summonLife=15`，实习生用 single kind 自动开火。有效 DPS ≈ 100，填补"召唤流"生态位。复用 `isSummon` + `allyOwner` + `updateSummon`。
5. **`field` 年终大饼场**：远程投放持续 9 秒燃烧场地，`dps=22, r=70, life=9, slow=0.4`。多场重叠单目标 DPS 250+。**零新代码**，`G.burns` 现成机制全接管。

改动量总计 ~200 行，五个卡位一次到位。

### 传说质变率提升

现在真质变率 1/6 太低。给现有传说打补丁：

- **十倍程序员**：齐射后强制部署一个 overload 区（复用消防喷淋类似机制）。
- **无限上下文**：不改激光形态，但改为激光扫过后留下 2s 的持续场地（复用 leg_pie 的 G.burns）。
- 新增融合 `['deepseek','claude','model_collapse']`：模型坍缩场，敌人被吸拽 10s，期间无法移动。

---

## 四、技能系统：56% 纯数值，Diablo 范式缺 9 类（对应问题④）

**给玩家的短说明**：一场对局你会遇到 20 次三选一，其中约 27 张是"+X% 移速/伤害/血量"的白绿卡。紫橙"眼前一亮"的卡实测只有 4-5 张，且 DPS 贡献往往还不如三张白卡叠满。

### 内容池归类

综合 skills.js/tech.js/actives.js/evolutions.js 的 59 条：

| 分类 | 条数 | 占比 |
|------|-----|------|
| 纯数值（`m.xxx *= K` 等） | 33 | 56% |
| 触发式（触发后叠数值 buff） | 10 | 17% |
| 质变/独立范式 | 16 | 27% |

其中被动 skills 37 条里 22 条（59%）是纯数值；TECH 14 条里 10 条（71%）是纯数值——`finetune(×1.08 伤×1.08 射×1.05 移)`、`kvcache(×1.08 射速)`、`ctxwin(×1.25 射程)`、`quant(×1.15 射速×1.15 弹速)` 这些"INT4 量化模组的三档就是把两个数字乘上去"。相比之下 actives 8 条里 7 条是独立范式，做得最好——但每场只能装 1 个。

### 紫橙卡的性价比反常识

真质变的紫橙只有 4 张：circuit_breaker（受伤 >15% 触发全屏 1.2s 眩晕）、blame_reflect（40% 概率转嫁伤害）、assembly_nuke（30 积分核爆）、perpetual_slack（移动 300px 触发 4s 摸鱼免疫）。

其余紫橙走"定时炸弹"套路，`burst = wpnDmg(u) * 3` 每 8 秒一次 = **wpnDmg × 0.375 的增量 DPS**。而 juanwang 三级叠满 `1.2^3=1.728 倍全程生效`——一张紫卡的贡献不如三张白卡叠满。玩家理性选择就是无脑堆白卡数值，紫橙抽到反而觉得亏。

### 池子过滤缺失

`core.js:2892 buildDraftPool` 里 `persona` 元数据在池里没有 filter——optimizer 玩家会抽到 slacker 的 mouse_jiggler，反之亦然，进一步稀释触发/质变密度。

修：`buildDraftPool` 加 `if (s.persona && s.persona !== pl.persona) continue;`

### Diablo 范式缺失矩阵

| 范式 | 本作现状 | 修复位置 |
|------|---------|---------|
| 元素反应（冰+火=蒸发） | **完全缺失**——有 stun/slow 但不互激 | applyDamage 加 reaction 判定 |
| 诅咒 debuff | **反向存在**——只有敌人诅咒玩家（`core.js:657 applyCurse` 仅对非 boss 生效） | skills.js 新增 curse_kpi / curse_pua |
| Aura 光环 proc | 仅 toxic_aura 一条，纯 DPS 无 proc | 新增 aura_focus / aura_wrath |
| 触发链 proc | 无通用框架，全是硬编码分支（fake_diligence 用 `noHitT >= 8` 等） | defaultMods 加 `procs = {onHit, onCrit, onKill, onHurt}` |
| 图腾/陷阱 | **完全缺失** | 新增 totemCd / trapCd 机制 |
| Aegis 受伤反击 | **完全缺失** | 新增 aegis_lawyer / aegis_pua_shield |
| on-hit 回血/加攻速/降防 | **完全缺失**——applyDamage 无 hooks | 扩展命中回调，见下 |
| 套装联动 proc | **完全缺失** | weapons/subweapons 加 setBonus 字段 |

`core.js:2647-2653` 命中回调只有 stun / curse / onHitMark 三种，其中 stun 只用在 leg_boom，curse 只用在 mob 攻击玩家路径——主武器打人不会：回血/加护盾/减攻速/降防/引爆易伤。这是最大的 proc 空档。

### 核心改造：通用 proc 框架

一次改动收益极高：

```js
// defaultMods() 里加
m.procs = { onHit: [], onCrit: [], onKill: [], onHurt: [] };
// applyDamage 里统一遍历触发
for (const p of attacker.mods.procs.onHit) { ... }
```

然后 skills.js/tech.js 都变成 `m.procs.onHit.push({...})` 的 append 操作，能一次性把元素附魔、触发链、Aegis 三大范式全补齐。

---

## 五、破局技能：抽到就过关的失衡组合（对应问题⑤）

**给玩家的短说明**：紫橙里有几张卡一旦抽到就把游戏难度直接砸穿，尤其"假勤奋真怠工"和"永动摸鱼引擎"是清屏机器，"甩锅式反伤"配控制流是永续无敌，"末位淘汰制"对精英是白嫖机。修法都是加冷却+加封顶+把百分比降下来。

### 破局 1：假勤奋真怠工（skills.js:80 紫）

`updatePersonaSkills` 里的实现（core.js:967-973）：

```js
if (u.mods.fakeDiligence && u.noHitT >= 8) {
  u.noHitT = 0;
  const burst = wpnDmg(u) * 3;
  for (const t of G.units) if (isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 260 * 260) applyDamage(t, burst, u);
  ...
}
```

关键漏洞：**每个符合条件的敌人都吃满 `wpnDmg × 3` 的伤害**，不做"总伤害池分摊"。以 ChatGPT 满 build `wpnDmg ≈ 272` 计算：

- 单次触发对每个目标伤害 = 272 × 3 = **816**（老板血量 4360 的 18.7%）
- 触发条件：8 秒不受伤（配合 blame_reflect 或 fuse_break 极易满足）
- 假设 260px 范围内 15 只怪：单次触发总产出 = 12,240 伤害
- 均摊 DPS = 12,240 / 8 = **1530 DPS 全屏 AoE**，与直接开火的 DPS 齐平

**问题**：这个"清屏 AoE"不占开火时间、不吃射速软上限、不消耗资源、被动触发。等价于"给玩家的 DPS 直接翻倍"。而觉醒后（`evo_pretend_not_seen`）触发窗口从 8s 缩到 5s，进一步 ×1.6。

**修**：改为 "总伤害池模型"——`totalBurst = wpnDmg(u) * 3`，实际每个目标分到 `totalBurst / max(1, hitCount) * damageDistribution`，或直接给单次触发一个绝对上限 `min(wpnDmg * 3, wpnDmg * 8)`（打 15 只时每只只吃到 `wpnDmg * 8 / 15 = 145` 伤害）。同时把触发冷却抬到 12s，觉醒版 8s。

### 破局 2：永动摸鱼引擎（skills.js:87 橙）

`core.js:1043-1064` 的实现：

```js
} else if (u.slackMiles >= 300) {
  u.slackMiles = 0;
  u.slackBurstT = 4;
  u.buffs.spdT = ...; u.buffs.spdM = 3;
  ...
}
// slackBurstT > 0 阶段
u.invulnT = Math.max(u.invulnT, dt + .05);   // 完全免疫
u.slackTickT -= dt;
if (u.slackTickT <= 0) {
  u.slackTickT = .2;
  for (const t of G.units) if (isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 50 * 50) {
    applyDamage(t, wpnDmg(u) * .6, u, { quiet: true });
```

关键数据：
- 触发条件：累计移动 300px，`moveWithCollide` 里 `dist = min(spd × dt, spdBase × 1.2 × dt)`，即基础移速 130 → 156/s，**触发间隔 300/156 ≈ 1.92s**
- 触发后：**4 秒完全无敌** + 移速 ×3 + 50px 内 5 tick/s 造成 wpnDmg × 0.6 伤害
- 单个目标承伤：`wpnDmg × 0.6 × 5 × 4 = wpnDmg × 12 = 3260`（ChatGPT 满 build）——**一次触发直接秒杀老板 3/4 血量**
- 循环节奏：1.92s 充能 + 4s 无敌爆发 = **6s 一循环，无敌占比 67%**

**问题**：这个技能等价于"整局玩家 67% 时间无敌 + 期间免费打输出"。设计文档里加了"每秒最多累计正常移速×1.2"的护栏，但没解决"1.92s 就触发一次 + 4s 无敌"这个根本节奏问题。

**修**：把 slackMiles 触发阈值从 300 提到 800（触发间隔 ≈ 5s），slackBurstT 从 4s 缩到 2s。触发后进入 10s 冷却（新增 `u.slackCd`），冷却期间移动累计不入账。觉醒版（`evo_online_offline`）触发阈值 600、slackBurstT 3s、冷却 6s。

### 破局 3：甩锅式反伤 + 控制流（skills.js:76 紫 + 觉醒 blame_furnace）

裸的 blame_reflect：40% 概率把伤害转移给 3 格内受控敌人（core.js:634-642）。觉醒后 (`evo_blame_furnace`)：概率 80%。

配合控制流的完整链：`guilt_by_association`（眩晕传染 90%）+ `circuit_breaker`（受重击触发全屏 1.2s 眩晕）+ `keyboard` 副武器（近战附加 stunT 0.15）。玩家实际承伤概率：

- 每次受伤 20% 直接转移（觉醒后 20% 概率原本吃伤害）
- 但受伤本身触发 circuit_breaker → 全屏眩晕 → 下次受伤时"3 格内有受控敌人" = 100%（周围全被熔断眩晕）→ 又 80% 转移
- 熔断 20s CD 但每次熔断能覆盖 1.2s + 全场眩晕间隔的传染时长（每 6-8s 一次）

结果：**玩家实际承伤率约 20% × 80% × 80% ≈ 12.8%**（80% 转移率 × 眩晕状态可用率），配合 uptimeCert（连续不受伤加成）几乎无限循环。老板的 pua/slap 系伤害是唯一还能过滤触发条件的（不是弹道），但也每 6-8s 一次。

**问题**：设计文档里说觉醒后概率上限 80% 是为了"排除圈伤和 Boss 触碰"，但实际 60%+ 减伤已经把游戏难度砸穿。

**修**：blame_reflect 基础概率从 40% 降到 25%，觉醒版从 80% 降到 55%。同时排除 Boss 战期间的所有伤害（`!attacker.isBoss && !attacker.isHR`）——Boss 战不能让玩家吃 blame，只能靠正面躲。

### 破局 4：末位淘汰制（skills.js:77 紫）

`updatePersonaSkills` 里（core.js:987-1002）：

```js
if (u.mods.bottomCut) {
  u.bottomCutT -= dt;
  if (u.bottomCutT <= 0) {
    u.bottomCutT = 8;
    let worst = null, worstHp = Infinity;
    for (const t of G.units) if (t.alive && isFoe(u, t) && ... && t.hp < worstHp) { worst = t; worstHp = t.hp; }
    if (worst) { worst.stunT = 2; worst.bottomCutMark = 2; }
  }
}
// ...爆炸时
explodeAt(t.x, t.y, 110, maxHp(t) * 2, u, '#ff6a6a');
```

关键漏洞：**爆炸伤害 = `maxHp(target) × 2`**，不区分目标类型。对小 Boss（tier2, maxHp 200-260 一般，级别加成后可能 500+）：

- 500 maxHp × 2 = 1000 damage → 一发秒杀
- 传染链条：一次爆炸波及 110px 范围内所有敌人吃 1000 伤害
- 触发条件：8s CD，无消耗

**问题**：对普通杂鱼没什么，但对**每 55s 刷一次的 T2 小 Boss**（500-800 血）等于每 8s 一次白嫖 200% maxHp 秒杀。

**修**：`explodeAt` 伤害改为 `Math.min(maxHp(t) * 2, 300)`——参照 layoff 主动的"对 Boss 单发上限 150"的护栏语言。对 T1 精英上限 250，T2 上限 400。

### 破局 5：TECH 模组三 Ultra 叠满

Ultra Fewshot ×2 + Ultra Temp ×3 + Ultra Finetune ×2 全叠满：

- `multishot = 2, echoMult = 0.9` → **单次开火 ×2.8** 输出（详见第一节 Fewshot 分析）
- `crit = 0.57` → 期望伤害 **×1.57**
- `dmg *= 1.12^2 = 1.2544`, `fireRate *= 1.12^2 = 1.2544`, `spd *= 1.08^2 = 1.1664`

三 Ultra 叠满乘子链 = `2.8 × 1.57 × 1.2544 × 1.2544 = 8.63 倍基础`。加卷王 3 级 `×1.728` 再乘 → **总 14.92 倍**。这个乘子链**不吃任何软上限**（fireRateOf 只压 rate，不管 dmg 乘算）。

**修**：见第一节"Fewshot echo 软上限"。同时给 Ultra crit 加上 `min(0.5, m.crit)` 硬上限。

### 破局 6：全员大会核爆（skills.js:78 橙）

`updatePersonaSkills`：

```js
if (u.meetingPoints >= 30) {
  u.meetingPoints = 0;
  u.assemblyT = 3;
  ... 3s 定身
  ... 结算：applyDamage(t, t.isBoss || t.eliteTier === 2 ? Math.min(dmg, 300) : dmg, u);
```

- 积攒条件：控制导致的击杀（core.js:751 处 +1）——控制流每秒能杀 2-3 个受控杂鱼，30 点约 10-15s
- 释放伤害：`wpnDmg(u) × 3.5`（对 Boss 封顶 300）
- 满 build wpnDmg ≈ 272 → 全屏 952 伤害 × 3s 定身

问题：Boss 封顶 300 已经做了，但对小 Boss（`eliteTier === 2`）也吃 min(dmg, 300)——大部分小 Boss 血量 500-800，300 伤害等于 40% 血量瞬间蒸发+3s 定身。10s 一次相当于每 10s 白吃小 Boss 40% 血量。

**修**：eliteTier === 2 单次上限从 300 提到 500——保留对普通杂鱼是清屏、对小 Boss 只造成 60-80% 血量差、对老板 300 上限不变。

### 汇总：破局技能优先级排序

| 技能 | 破局程度 | 修法难度 | 优先级 |
|------|--------|---------|-------|
| 永动摸鱼引擎（橙） | 67% 时间无敌 | 抬阈值 + 加冷却 | ★★★★★ |
| 假勤奋真怠工（紫） | 相当于 DPS 翻倍 | 改为总伤害池模型 | ★★★★★ |
| Ultra Fewshot ×3 组合 | 乘子失控 | 见第一节 echo 软上限 | ★★★★★ |
| 甩锅式反伤（觉醒） | 承伤 87% 减免 | 概率下调 + 排除 Boss | ★★★★ |
| 末位淘汰制（紫） | 每 8s 秒杀 T2 小 Boss | 加封顶 | ★★★★ |
| 全员大会核爆（橙） | 每 10s 蒸发小 Boss 40% 血 | 小 Boss 上限 300 → 500 | ★★★ |

前 3 项必修，这三个技能不修等于整个游戏的紫橙没有意义（因为它们太超模型平衡）。

---

## 六、无尽模式：42 个目标 19 秒打光，胜利即硬停（对应问题⑥）

**给玩家的短说明**：一整局你能杀的 AI 单位大约 42 个，中后期你每秒能干 5+，19 秒打光；剩下全靠等 22 秒/55 秒刷精英 + 18 秒刷 HR。杀完老板，`state='win'` 一切冻结，只能 Enter 重开。用户"再优化一批员工"的诉求，架构层被彻底堵死。

### kill-eligible 总数硬盘点

| 来源 | 数量 | 位置 |
|------|-----|------|
| 固定 AI 机器人 | 19（`shuffle(botNames).slice(0, 19)`） | constants.js:7 + core.js:211 |
| 试用期考核 Boss | 3（月数默认 3，池只有 4 种） | core.js:169 |
| 老板本尊 | 1（`!G.bossSpawned` 门控） | core.js:2854 |
| T1 精英 | 全程 ~10-12（22s CD, cap ≤ 4） | core.js:1313 |
| T2 小 Boss | 全程 ~2-4（55s CD, cap ≤ 2） | core.js:1335 |
| HR（唯一无界源） | ~2-8（Boss 战每 18s 召唤 2 个, cap=4） | core.js:2341-2347 |
| **合计** | **~42** | |

琐事怪 `killUnit:770-772` 里 `if (victim.isMob) return` 直接跳过 G.kills，不算数。用户抱怨完全成立。

### 胜利硬停的根因

`core.js:2842-2867` 的 endChecks 流程一旦满足胜利条件就 `G.winT=1.2`，1.2 秒后 `setState('win')`；`GameCanvas.jsx:32` 的 `if (getState()==='playing') update(dt)` 让整个世界瞬间冻结。`core.js:3036` handleKey 里，胜利画面唯一交互是 Enter 重开。

对比 Vampire Survivors（击杀死神后进入 30 分钟死神轮）、Diablo 3+（Rift 结算后可选继续加深难度）、Risk of Rain 2（Boss 战胜利=进入下一关），本作是**架构级零延续**。

### 落地方案：无尽办公室加班模式

复用 spawnLateBots（core.js:2049）作为空降机制——它本来就是为"新员工入职"设计的，只需把"一次性触发"改成"循环触发"：

**难度爬升公式**（推荐）：
- 每波空降人数：`N(w) = min(20, 6 + floor(1.5 w))`
- HP 倍率：`hpMult(w) = 1 + 0.35(w-1) + 0.02(w-1)²`——w=5 约 2.72x，w=10 约 5.35x，w=20 约 15.65x
- 伤害倍率：`dmgMult(w) = 1 + 0.20(w-1)`（线性温和）
- 武器等级：`clamp(2 + ceil(0.6w), 2, 5)`

**Boss 节奏**：每 4 波刷 ELITE_T2 轮换（池现成），每 10 波刷升级版老板（放宽 `!G.bossSpawned` 单例锁）。

**改动清单**（预估 ~150 行，1-2 天）：

| 文件 | 位置 | 改动 |
|------|------|------|
| constants.js | TUNE 末尾 | 新增 `endless` 子对象 |
| core.js | newGame() | `g.endless = {active, wave, waveT, killsThisWave}` |
| core.js:2842 | endChecks | winPause 中间态 + "继续加班"按钮 |
| core.js:3001 | startGame(mode='endless') | 跳过试用期直接 zone.phase=2 |
| core.js:2049 | 抽出 spawnEndlessWave | 参数化 wave num |
| core.js:1161 | update(dt) 顶部 | waveT 调度器 |
| core.js:2854 | 门控放宽 | `!G.boss \|\| !G.boss.alive` |
| core.js:670 | 死亡免死 | wave >= 10 禁 revive |
| core.js:3047 | saveBest | endlessMaxWave / endlessTime |

**同时改 HR 召唤频率**：`A.summonT = 18 * (0.4 + 0.6 * u.hp / maxHp(u))`——Boss 越残召唤越勤，Boss 战末期形成 HR 潮，配合无尽模式的"永远有新目标"节奏。

---

## 七、优先级路线图

按 ROI（价值/工时比）排序，非按 review 顺序。工时估算按 1 人-日 = 8h 计。

### 第一批（1-2 天，必须做）

阻断玩家爽感的 6 个致命问题，都是十行以内的常数改动，收益立竿见影：

1. **Boss 血量抬高、狂暴前置**（2-3h）
   `core.js:1776` 系数改 180/220/280；`core.js:2318` 狂暴阈值 0.5 → 0.75；狂暴期 `dmgTaken *= 0.7`；狂暴瞬间 `u.shield = maxHp*0.15`、`A.pieT = 0.3` 即刻放饼阵。
2. **Fewshot echo 软上限**（1h）
   `applyTechPickup:924` echoMult 改软上限公式，杜绝 2.8 倍隐藏乘区。
3. **试用期数值三改**（2h）
   `xp 乘数 0.42 → 0.55`；`levelNeed 底数 1.26 → 1.22`；免死回血 `0.6 → 0.4`，扣 XP 改动态半级。
4. **HR 召唤频率随血量线性缩短**（0.5h）
   `A.summonT = 18 * (0.4 + 0.6 * hpRatio)`；cap 4 → 6。
5. **技能池 persona 过滤**（0.5h）
   `buildDraftPool` 加一行 `if (s.persona && s.persona !== pl.persona) continue;`
6. **破局技能三改**（2-3h）
   永动摸鱼引擎：阈值 300 → 800，slackBurstT 4 → 2，触发后 10s 冷却；假勤奋真怠工：改为总伤害池模型；末位淘汰制：爆炸伤害加 300 封顶。

**预计总工时：1.5 个工作日**。这六个改完，玩家侧感受：Boss 真的有第二阶段、试用期不再憋屈、抽到的卡都是自己人设、破局技能不再破局。

### 第二批（3-5 天，强烈推荐）

架构级改动，让内容量维持不变的前提下把体验做出深度：

7. **通用 proc 框架**（1 天）
   `defaultMods()` 加 `procs` 字段；`applyDamage` 加统一遍历；skills.js/tech.js 里 20 条纯数值改写成 `push` 到 procs 数组的形式。10 条元素附魔/触发链/Aegis 卡上线。
8. **蒸馏反制 pw 公式修正**（0.5 天）
   `core.js:2289` 补 crit/range/legendary 系数；反打上限 3 → 4。
9. **spawnLateBots 追赶发育强化**（0.5 天）
   武器等级公式 `clamp(2 + months, 2, 5)`；追赶 XP `0.6 → 0.85`；模组数 `months + 1`；副武器/rollTier 逻辑。
10. **五个新武器 kind**（2-3 天）
    aura/totem/mine/summon/field。全部复用现有引擎基础设施，`core.js:456` switch 加 5 个 case。同步给现有 6 传说打质变补丁。
11. **早期怪物 AI 差异化**（1 天）
    cc_bomb 生前周期性投掷追踪弹；email 存在超 5s 自动升级；新增 phishing_mail（远程射手）和 deadline_alarm（固定预警圈爆炸）。

**预计总工时：5-6 个工作日**。这批完成后，"技能系统"、"主武器攻击范式"、"早期怪物机制"三个大槽点根本转向。

### 第三批（1-2 周，做完就是 v2.0）

12. **无尽办公室加班模式**（1.5-2 天）
    见第六节详细清单。抽象 `waveScheduler` 让试用期波次和无尽波次共用调度器。
13. **传说融合真质变**（2-3 天）
    新增 3 条以上"改变移动/资源循环"的融合配方（如 model_collapse 吸引场、mass_hiring 实习生自动升级）。
14. **saveBest 扩展 + 永久成长**（1 天）
    endlessMaxWave / endlessTime / 连杀纪录；无尽击杀 ×0.1 兑换起始 XP 解锁。

**预计总工时：5-6 个工作日**。做完之后玩家有"我上次打到第几波"的记忆点，重开一局有真正的意义。

---

## 附：交叉验证时的分歧处理

- **Claude 满 build DPS**：balance 说 ≈ 1983，op-weapons 的乘数链说 9.53 倍——两者数学一致（`9.53 × 42 / 0.576 ≈ 1983`），**以 ≈ 2000 为准**。
- **试用期总 XP**：balance 算出 435，op-endless 隐含用 "30 XP × months" 作粗略估算——两者不冲突，`spawnLateBots:2068` 里的 `|| 30 * months` 本身就是 fallback 默认值，balance 的详细推算更接近真实值，**以 435 为准**。
- **传说质变率**：op-weapons 明确统计 1/6，op-skills 在提"独立范式"时把 actives 单独算——两口径不同不构成矛盾，主武器传说的 1/6 结论保留。
- **kill-eligible 总数**：op-endless 给出 42，其他 review 未涉及。数字口径清晰（19+3+1+10+3+6），**保留**。
- **第 2 份 review（early-mobs）返回占位数据 `{"summary":"test"}`**，第二节由主评审员基于 mobs.js/updateMob 亲自补写。
- **第 4 份 review（op-skills）返回 null**，第五节由主评审员基于 skills.js/updatePersonaSkills/updateSubs 亲自补写，含具体 DPS 代入。

---

*本报告由 4 路 agent 独立分析 + 1 路主评审员合成 + 2 路缺口由主评审员亲写补齐。所有 file:line 引用均已在 commit 0f10b0e 验证。*
