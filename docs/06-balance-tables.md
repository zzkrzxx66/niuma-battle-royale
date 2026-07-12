# 《牛马大逃杀》数值表 / Balance Sheets & Data Tables

数据基线：2026-07-12。除“目标/建议”列外，均来自当前代码。运行时以 `src/game/constants.js`、`src/game/data/*.js` 和 `src/game/core.js` 为最终事实来源。

## 1. 全局参数

| 参数 | 当前值 | 说明 |
|---|---:|---|
| 逻辑视口 | 640×360 | Canvas 固定分辨率 |
| 世界尺寸 | 2200×2200 | 正方形办公室 |
| 玩家基础 HP | 100 | 商店和技能可修改 |
| 玩家基础移速 | 130 px/s | 基础怪必须低于该值 |
| 机器人数 | 19 | 总参赛牛马 20 |
| 机器人基础 HP | 80 | 不含成长 |
| 初始安全区半径 | 1050 | 接近世界边界 |
| 单次缩圈时长 | 30s | 线性插值 |
| 击杀基础经验 | 12 | 再加受害者等级×3 |
| Boss 基准触发 | 420s | 或存活牛马 ≤3 |
| 主武器最高等级 | 5 | Lv.5 可融合 |
| 副武器默认/最高槽 | 3 / 4 | 转正或缩圈解锁第 4 槽 |
| 主动技能槽 | 1 | 最高 Lv.3 |

## 2. 核心公式

### 2.1 升级需求

```text
levelNeed(level) = round(11 × 1.27^level)
```

| 到达等级 | 本级需求 | 从 Lv.1 起累计经验 |
|---:|---:|---:|
| 2 | 14 | 14 |
| 3 | 18 | 32 |
| 4 | 23 | 55 |
| 5 | 29 | 84 |
| 6 | 36 | 120 |
| 7 | 46 | 166 |
| 8 | 59 | 225 |
| 9 | 74 | 299 |
| 10 | 95 | 394 |
| 11 | 120 | 514 |
| 12 | 152 | 666 |
| 13 | 194 | 860 |
| 14 | 246 | 1106 |
| 15 | 312 | 1418 |
| 16 | 397 | 1815 |
| 17 | 504 | 2319 |
| 18 | 640 | 2959 |
| 19 | 813 | 3772 |
| 20 | 1032 | 4804 |

说明：代码以当前等级作为需求参数，因此“到达等级”列按从 Lv.1 升到下一等级的顺序展示。

### 2.2 武器等级

```text
normal weapon damage = base dmg × grow^(level-1)
grow = 1.30; drone grow = 1.15
legend damage does not inherit normal weapon level multiplier
```

通用武器 Lv.5 伤害倍率为 `1.3^4 = 2.8561`；drone 类为 `1.15^4 = 1.7490`。

### 2.3 有效射速

```text
f = mods.fireRate × temporary buff × curse modifier
effective = f                              , f <= 2
effective = 2 + sqrt(f - 2) × 0.6         , f > 2
```

副武器使用 `min(effective, 1.6)`。

### 2.4 单位移速

```text
speed = base × mods.spd × temporary buff
      × lowHP modifier × beam modifier × curse modifier
      × empower/review/event/slow modifiers
```

重要倍率：传说贯穿激光开火时 ×0.5；过拟合 ×0.6；向上管理赋能 ×1.15；OA 减速 ×0.6。

### 2.5 试用期怪物成长

```text
HP multiplier = 1 + 0.25 × (month - 1)
touch multiplier = 1 + 0.08 × (month - 1)
XP = base XP + (month - 1)
```

### 2.6 Boss 血量

```text
bossHP = round(
  900
  + 600 × min(1, max(battleTime/420, playerLevel/15))
  + 60 × playerLevel
  + 90 × totalTechLevels
  + 120 × totalSubLevels
  + 150 × distillCount
  + 400 if player has legend
)
```

设计目标：Boss 狂暴阶段 P50 持续 8—15 秒；需用遥测验证，不能只靠公式。

## 3. 试用期波次

| 月 | 时长 | 考核窗口 | 累计时长 | 爆发名额 | 存活上限 | 池内类型数 |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 60s | 18s | 60s | 12 | 12 | 4 |
| 2 | 70s | 19s | 130s | 17 | 14 | 8 |
| 3 | 80s | 20s | 210s | 22 | 16 | 9 |
| 4 | 90s | 21s | 300s | 27 | 18 | 11 |
| 5 | 100s | 22s | 400s | 32 | 20 | 13 |
| 6 | 110s | 23s | 510s | 37 | 22 | 14 |

其他规则：爆发每 0.5 秒最多投放 3 个名额；普通涓流每 1.5 秒补齐；月考 Boss 在场时上限减半；Boss 已倒后的最后 6 秒冲刺补怪间隔 0.6 秒。

## 4. 缩圈表

| 阶段 | 基准触发 | 目标比例 | 目标半径 | 圈外 DPS | 收缩时长 |
|---:|---:|---:|---:|---:|---:|
| 1 | 90s | 70% | 735 | 4 | 30s |
| 2 | 210s | 45% | 472.5 | 9 | 30s |
| 3 | 330s | 25% | 262.5 | 16 | 30s |
| 4 | 450s | 12% | 126 | 28 | 30s |
| 5 | 570s | 5% | 52.5 | 48 | 30s |

不同试用期月数的正式战斗触发点：

| 月数 | 阶段 1—5 触发秒 |
|---:|---|
| 0 | 90 / 210 / 330 / 450 / 570 |
| 1 | 85 / 197 / 310 / 423 / 536 |
| 2 | 79 / 185 / 290 / 396 / 502 |
| 3 | 74 / 172 / 271 / 369 / 467 |
| 4 | 68 / 160 / 251 / 342 / 433 |
| 5 | 63 / 147 / 231 / 315 / 399 |
| 6 | 58 / 134 / 211 / 288 / 365 |

## 5. 主武器池（live 12 把）

“基础理论 DPS”只用于粗排，不包含射程命中率、暴击、穿透、爆炸、回程、链电目标数量、随机弹型和特殊效果。

| ID | 名称 | 类型 | CD | 伤害 | 关键参数 | 基础理论 DPS | Lv.5 粗略 DPS |
|---|---|---|---:|---:|---|---:|---:|
| deepseek | DeepSeek | mg | 0.12 | 2.2 | 300 速/210 射程 | 18.3 | 52.4 |
| kimi | Kimi | sniper | 1.55 | 28 | 560 射程/80 穿透 | 18.1 | 51.6 |
| qwen | 通义千问 | shotgun | 1.05 | 4.4×5 | 135 射程/1.0 扇角 | 21.0 | 59.8 |
| wenxin | 文心一言 | lob | 1.45 | 24 | 爆炸半径 40/Boss×0.75 | 16.6 | 47.3 |
| doubao | 豆包 | homing | 0.75 | 10.5 | 540 射程/追踪 4.2 | 14.0 | 40.0 |
| glm | 智谱 GLM | chain | 1.05 | 16 | 3 跳/每跳×0.8 | 单体 15.2 | 单体 43.5 |
| chatgpt | ChatGPT | single | 0.50 | 10 | 320 速/260 射程 | 20.0 | 57.1 |
| claude | Claude | charge | 0.45 | 7—38 | 蓄力 1.25s/270 射程 | 满蓄 22.4 | 满蓄 63.8 |
| gemini | Gemini | twin | 0.58 | 6.2×2 | 双联间距 12 | 21.4 | 61.1 |
| copilot | Copilot | drone | 0.85 | 8×2 | 2 僚机/150 射程 | 18.8 | 32.9 |
| midjourney | Midjourney | gacha | 0.90 | 10 | 随机 0.6—3 倍与弹型 | 11.1 基准 | 31.7 基准 |
| grok | Grok | boomerang | 1.00 | 10.5 | 155 射程/去回两判 | 10.5 单程 | 30.0 单程 |

平衡观察：

- 霰弹、双联和蓄力的纸面单体上限较高，但对距离/操作更敏感。
- 追踪和无人机以命中稳定性换纸面 DPS。
- 链电、狙击、抛射和回旋镖不能只用单体 DPS 排名。
- Qwen 的 `coderEvery`、GLM 的 `qingyanLv5` 等字段需要确认运行时是否完整消费，数据校验应报告未使用字段。

## 6. 扩展普通武器（experimental/legacy）

这些定义存在于代码，但不进入 v4.1 主池、开局、芯片和升级抽卡。

| ID | 名称 | 类型 | CD | 伤害 | 备注 |
|---|---|---|---:|---:|---|
| llama | Llama | single | 0.80 | 8 | 三连发，burst 字段需核对实现 |
| mistral | Mistral | single | 0.90 | 22 | crit 字段需核对实现 |
| perplexity | Perplexity | homing | 0.65 | 9 | markT 字段需核对实现 |
| qwen_coder | Qwen2.5-Coder | mg | 0.08 | 1.8 | 更快、更短射程 |
| sora | Sora | lob | 1.80 | 20 | 持续爆炸区 |
| sd | Stable Diffusion | gacha | 1.00 | 12 | 极端随机描述与通用 gacha 实现需对齐 |
| yandex | YandexGPT | chain | 1.20 | 14 | 5 跳、衰减 0.88 |
| runway | Runway | twin | 0.42 | 5×2 | 双联间距 6 |
| qingyan | 智谱清言 | charge | 0.35 | 6—36 | 蓄力 0.8s |

## 7. 传说武器与配方

| 配方 | 传说 | 类型 | 核心参数/效果 |
|---|---|---|---|
| DeepSeek + ChatGPT | AGI 降临 | leg_agi | CD 0.13，4.8 伤害追踪弹；3.5s 天罚 48 伤/半径44 |
| 通义千问 + 豆包 | 百模大战·价格屠夫 | leg_pea | CD 0.55，14 发扇形追踪豆，每发 2.8 |
| Claude + Copilot | 十倍程序员 | leg_drone | 4 僚机，CD 1.3，每发 8，齐射伤害 22 |
| 文心一言 + Midjourney | 画饼充饥 | leg_pie | CD 1.6，31 伤，爆炸半径52，燃烧 8 DPS×5s |
| Kimi + Gemini | 无限上下文 | leg_beam | CD 0.14，5.2 伤，贯穿全图，开火移速减半 |
| 智谱 GLM + Grok | 职场嘴替 | leg_boom | CD 1.4，26 伤，链电 7×4，回程双倍描述需实测 |
| DeepSeek + 通义千问 | 开源共治 | leg_agi | CD 0.08，2.8 伤追踪；5s 全图脉冲 40/半径80 |
| ChatGPT + Midjourney | 多模态融合 | leg_pea | CD 0.6，20 发，每发 2.5，追踪 1.5 |

存在但无当前配方入口的传说定义：视频生成矩阵、深度伪造、涡轮上下文、冷战回旋。应标记 experimental，避免图鉴或宣传写成可获得内容。

## 8. 通用技能（live 20 条）

| ID | 名称 | 上限 | 每层/效果 |
|---|---|---:|---|
| moyu_master | 摸鱼学大师 | 3 | 移速 ×1.15 |
| paid_toilet | 带薪如厕 | 2 | 站定 1s 后每秒回血 +3 |
| pua_immunity | PUA 免疫 | 3 | 受伤 ×0.8 |
| manage_up | 向上管理 | 3 | 经验 ×1.25 |
| resume_gilding | 简历镀金 | 1 | 每次升级最大 HP +10 并回 10 |
| fubao_996 | 996 福报 | 2 | 射速 ×1.25，最大 HP -10 |
| huabing | 画饼充饥 | 2 | 击杀回血 +10；杂鱼按 30% 效率 |
| early_leave | 提前下班 | 2 | 解锁 3s 冲刺 CD；再选 CD 减半 |
| side_hustle | 副业变现 | 1 | 击杀掉道具概率 +30% |
| juanwang | 卷王之王 | 3 | 伤害 ×1.2 |
| quit_threat | 离职威胁 | 1 | 低于 30% HP 移速 +30% |
| n_plus_one | N+1 谈判专家 | 1 | 死亡复活一次，50% HP |
| weekly_report | 周报生成器 | 2 | 每秒经验 +1 |
| desk_fengshui | 工位风水学 | 2 | 最大 HP +30 |
| invisible_worker | 办公室小透明 | 1 | 敌人索敌范围 ×0.7 |
| blame_master | 甩锅大师 | 2 | 每层按 20% 独立合并闪避，2 层为 36% |
| instant_reply | 已读秒回 | 2 | 弹速 ×1.3；部分武器不出现 |
| company_wool | 薅公司羊毛 | 1 | 道具效果 +50%（初始 itemBoost 已为 1，代码加 0.5） |
| skip_report | 越级汇报 | 2 | 穿透 +1/链电多跳；部分武器不出现 |
| toxic_aura | 职场毒瘤 | 3 | 100px 内每秒伤害 +2 |

乘法堆叠提示：3 层卷王为 ×1.728；3 层 PUA 免疫为 ×0.512；3 层向上管理为 ×1.953。需要留意多层乘法带来的极端构筑。

## 9. 人设技能（experimental 17 条）

### 首席降本增效官

| 名称 | 稀有度 | 上限 | 效果摘要 |
|---|---|---:|---|
| 办公室政治 | 白 | 5 | 每层 12% 概率挂内耗，1.5s 后溅射本次伤害 30% |
| 3 秒发言等待区 | 白 | 5 | 每层减速强度 +8% |
| 回收站冷静期 | 绿 | 3 | 控制命中后目标 2s 易伤 +15%/层 |
| 连坐制度 | 绿 | 3 | 每层 25% 概率将眩晕以 70% 时长传染，最高 90% |
| 季度考核倒计时 | 蓝 | 3 | 每个受控敌人提供 +2%/层全伤，最多 20 层 |
| 熔断机制 | 蓝 | 1 | 单次受伤 > 当前 HP 15%：范围眩晕 1.2s、自身无敌 0.6s、CD20s |
| 甩锅式反伤 | 紫 | 1 | 40% 概率将伤害以 150% 转给 90px 内受控敌人；不转 Boss 伤害 |
| 末位淘汰制 | 紫 | 1 | 每 8s 约谈最低生命敌人，定身后爆炸；具体上限见运行时 |
| 全员大会核爆 | 橙 | 1 | 控制击杀累计 30 点，触发全屏聚拢/定身/核爆 |

### 摸鱼表演艺术家

| 名称 | 稀有度 | 上限 | 效果摘要 |
|---|---|---:|---|
| 鼠标晃动器 | 白 | 5 | 移速 ×1.10/层 |
| 线上响应术 | 白 | 5 | 连续移动 >2s 后受伤 -15%/层，运行时最高减伤 60% |
| 假装忙碌 | 绿 | 3 | 闲置 >1.5s 自动短暂提速；重复选择当前只设置布尔值，成长价值需核对 |
| 已读不回学 | 绿 | 3 | 闪避后 1s 移速 +12%/层 |
| 在线时长认证 | 蓝 | 3 | 未受击每 5s 获认证层，攻速/伤害增长 |
| 永不下线 | 蓝 | 1 | 闪避 +18%，上限 90%；最大 HP -15 |
| 假勤奋，真怠工 | 紫 | 1 | 8s 未受伤触发全屏武器伤害×3 |
| 永动摸鱼引擎 | 橙 | 1 | 移动累计 300px 触发 4s 高铁摸鱼 |

当前问题：卡池未按 persona 过滤；正式平衡前不应视为 live。

## 10. 觉醒配方（experimental）

| 觉醒 | 需求 | 效果 |
|---|---|---|
| 无限连坐熔炉 | 甩锅式反伤 + 熔断机制 | 反伤转移概率 40% → 80% |
| 永续裁员委员会 | 末位淘汰制 + 花名册点对点连坐 | 连坐升级为排序锁链与殉爆，附加移速/伤害 |
| 在线但心已离职 | 永动摸鱼引擎 + 临时下线 | 高铁摸鱼附带下线效果并可叠永久攻击 |
| 被优化了但我假装没看见 | 假勤奋真怠工 + 在线状态徽章 | 触发条件 8s → 5s，爆发后 2s 有 35% 无视伤害 |

## 11. 副武器

| ID | 名称 | 最大等级 | 基础 CD/方式 | Lv.1 → Lv.3 核心数值 | 状态 |
|---|---|---:|---|---|---|
| keyboard | 机械键盘 | 3 | 1.6s 近战扇 | 14 / 20 / 28 伤 | live |
| stapler | 订书机炮台 | 3 | 6s，存在 8s | 炮台伤害 6 / 9 / 12；数量 1/1/2 | live |
| monitor | 显示器回旋盾 | 3 | 常驻环绕 | 数量 1/2/2；伤害 10/14/18 | live |
| mug | 马克杯流星锤 | 3 | 2.2s 爆炸 | 16 / 24 / 34 伤 | live |
| shredder | 碎纸机光环 | 3 | 常驻 DPS | 半径 42/48/56；DPS 8/12/17 | live |
| laserpen | 会议激光笔 | 3 | 3.2s 穿透射线 | 22 / 32 / 46 伤 | live |
| oa_form | OA 审批流公文包 | 3 | 2.6s | 8 / 12 / 17，减速+延爆 | optimizer |
| fire_sprinkler | 消防警报喷淋装置 | 3 | 8s，存在10s | 半径55/62/70，DPS6/9/13 | optimizer |
| meeting_room | 会议室预定表 | 3 | 9s，存在6s | 半径50/58/66，DPS3/5/7 | optimizer |
| online_badge | 在线状态徽章 | 3 | 0.6s | 标记概率35%/50%/65% | slacker |
| fitness_ring | 健身环挑战 | 3 | 1.4s | 半径36/42/48，移动尾迹定身 | slacker |
| printer | 打印机 | 3 | 4s，存在6s | 10 / 15 / 22 伤 | experimental |
| whiteboard | 白板擦盾 | 3 | 3s | 数量1/1/2，伤害14/20/28 | experimental |
| chair | 转椅漂移 | 3 | 5s | 伤害20/30/42，速度200/250/300 | experimental |
| water_cooler | 饮水机炮台 | 3 | 7s，存在10s | 半径50/60/70，DPS5/8/12 | experimental |
| projector | 投影仪光炮 | 3 | 2.8s | 18 / 26 / 38 伤 | experimental |
| phone | 电话弹射 | 3 | 1.8s | 12/18/26，弹跳2/3/4 | experimental |

## 12. 主动技能

| ID | 名称 | CD Lv.1/2/3 | 核心成长 | 状态 |
|---|---|---|---|---|
| blink | 摸鱼瞬移 | 9/7/5s | 距离 120/150/185 | live |
| layoff | 裁员通知 | 12/10/8s | 40+8% / 60+10% / 80+12% 最大生命；Boss 单发上限150 | live |
| bing_shield | 画饼护盾 | 16/13/10s | 无敌 1.2/1.6/2.0s，圈伤除外 | live |
| teambuild | 团建号召 | 14/11/9s | 半径150/190/230，聚怪+眩晕+20%易伤 | live |
| force_mute | 强制五分钟静音 | 14/12/10s | 扇形半径180/210/240，眩晕减速 | optimizer |
| linked_fate | 花名册点对点连坐 | 20/17/14s | 连接最近两敌人8s | optimizer |
| temp_offline | 临时下线 | 11/9/7s | 隐身无敌 1/1.3/1.6s，移速×2 | slacker |
| slack_appeal | 摸鱼申诉信 | 22/18/15s | 真摸鱼回复40%生命+免死；否则减半 | slacker |
| overtime_burst | 加班狂暴 | 18/15/12s | 4/5/6s 伤害×2+射速×2，结束掉20%血 | experimental |
| dept_merge | 部门合并 | 25/20/16s | 半径200/250/300，全屏拉扯碰撞 | experimental |
| whisteblow | 吹哨举报 | 20/16/13s | 60+15% / 90+20% / 120+25% 当前生命；Boss上限200 | experimental；ID 拼写保留 |
| ai_replace | AI 替代通知 | 30/25/20s | 全场停机 6/8/10s，Boss效果减半 | experimental |

## 13. 技术模组

品级数值由运行时 `applyTechPickup` 缩放；下表为设计描述与最大常驻层数。

| ID | 名称 | 最大层 | 效果 | 玩家专属 |
|---|---|---:|---|---|
| fewshot | 少样本提示 | 2 | 并排增加弹道 | 是 |
| cot | 思维链 | 2 | 穿透 +1 | 否 |
| temp | 温度调高 | 3 | 15% 暴击×2 | 是 |
| quant | INT4 量化 | 2 | 射速、弹速 +15% | 否 |
| attention | 注意力机制 | 2 | 子弹轻微追踪 | 是 |
| kvcache | KV 缓存 | 2 | 武器冷却 -12% | 否 |
| finetune | 私有微调 | 2 | 伤害/射速/移速 +8% | 否 |
| ctxwin | 上下文扩容 | 2 | 射程 +25% | 否 |
| sysprompt | 系统提示 | 1 | +30 护盾，每45s补盾 | 否 |
| rag | 检索增强 RAG | 2 | 环绕知识库炮台 | 否 |
| inject | 提示注入 | 即时 | 策反最近牛马 | 否 |
| clear | /clear 清空上下文 | 即时 | 清屏子弹并震开周围敌人 | 否 |
| distill | 大模型蒸馏 | 即时 | 随机获得 Boss/小 Boss 弱化技能 | 是 |

品级：标准、Pro、Ultra。当前仅用颜色/标签表达，目标版本增加形状冗余。

## 14. 蒸馏池

| ID | 名称 | 来源 | 周期/效果摘要 |
|---|---|---|---|
| ppt | 全屏演示·mini | PPT 大师 | 每10s 光锥伤害+眩晕 |
| snitch | 打小报告·mini | 小报告专家 | 每14s 举报最近敌人 |
| pie | 画大饼·mini | 老板 | 每8s 四周6张小饼 |
| upman | 向上管理·mini | 向上管理大师 | 每10s 赋能3s并回6血 |
| align | 对齐立场·mini | 对齐守卫 | 25% 正面挡弹 |
| pua | PUA 冲击·mini | 老板 | 每9s 震开近敌并造成小伤害 |

## 15. 诅咒

| ID | 名称 | 效果 |
|---|---|---|
| hallu | 幻觉 | 准星漂移 |
| overfit | 过拟合 | 移速 ×0.6，禁止冲刺 |
| repeat | 复读机 | 弹道锁定第一次方向 |
| overflow | 上下文溢出 | 射速 ×0.55 |

## 16. 精英与小 Boss

| ID | 名称 | Tier | HP | 移速 | 接触 | 等级 | 机制 |
|---|---|---:|---:|---:|---:|---:|---|
| hallu | 幻觉体 | 1 | 45 | 185 | 6 | 3 | 接触施加幻觉 6s |
| overfit | 过拟合壮汉 | 1 | 320 | 52 | 18 | 5 | 肉盾，接触过拟合 7s |
| injector | 提示注入者 | 1 | 70 | 115 | — | 4 | 远程注入复读/溢出 |
| align | 对齐守卫 | 1 | 160 | 78 | 10 | 4 | 正面挡弹，需绕后或特殊伤害 |
| ppt | PPT 大师 | 2 | 260 | 70 | — | 6 | 扇形幻灯片、预警光锥 |
| upman | 向上管理大师 | 2 | 220 | 95 | — | 6 | 强化并治疗附近牛马 |
| snitch | 小报告专家 | 2 | 150 | 125 | — | 5 | 每8s 举报，6s 全场集火 |
| meeting | 会议发起人 | 2 | 200 | 85 | — | 5 | 日历邀请会议圈，减速掉血 |
| intern | 卷王实习生 | 2 | 180 | 90 | 12 | 5 | 残血越快越痛 |
| attendance | 考勤主管 | 2 | 240 | 75 | — | 6 | 定期点名，静止者受高伤 |

Tier 1 击杀：1 个模组 + 10 XP 拾取；Tier 2：2 个模组 + 20 XP + 1 道具；玩家亲手击杀额外掉 AI 替身样本。

## 17. 试用期怪物基础表

| ID | 名称 | HP | 移速 | 接触 | XP | 关键机制 |
|---|---|---:|---:|---:|---:|---|
| email | 未读邮件 | 11 | 105 | 2.5 | 1.6 | 基础追击 |
| sticky | 待办便利贴 | 20 | 60 | 4 | 2.2 | 慢速肉身 |
| cr | 需求变更单 | 14 | 95 | 3 | 1.6 | 抖动，死亡分裂 |
| cc_bomb | 抄送轰炸 | 8 | 130 | 2 | 1.5 | 35% 分裂1只已读不回 |
| read_reply | 已读不回 | 3 | 160 | 1.5 | 1 | 仅分裂产物 |
| reinvent_wheel | 重复造轮子任务 | 12 | 55 | 3 | 2.5 | 5 护盾，破前减伤80% |
| meeting_invite | 会议邀请 | 22 | 50 | 3.5 | 2.5 | 每8s 消失1.5s |
| message_recall | 已发送-撤回中 | 12 | 100 | 2.5 | 2 | 50% 原地复活一次 |
| urgent_meeting | 加急会议提醒 | 16 | 45 | 0 | 3 | 半径70，DOT2，减速40% |
| outsourced_army | 临时工外包大军 | 5 | 140 | 1.5 | 0.8 | 6只一组，清组+6 XP |
| overtime_rework | 深夜返工提醒 | 24 | 85 | 3.5 | 3.5 | 受伤累计20触发冲刺/虚弱 |
| kpi_hunter | KPI 追杀者 | 60 | 118 | 6 | 8 | 第3月起周期单体 |
| read_no_reply_ultimate | 已读不回·终极形态 | 45 | 170 | 2 | 6 | 85% 闪避 |
| req_review_board | 需求评审会 | 45 | 0 | 0 | 6 | 半径110 强化附近杂鱼 |
| night_lamp | 深夜加班灯 | 8 | 0 | 0 | 5 | 半径80 使玩家易伤 |
| intern_swarm | 实习生大军 | 4 | 150 | 1 | 0.6 | 8只一组，清组+8 XP |
| tech_debt | 技术债幽灵 | 40 | 70 | 5 | 5 | 15 护盾 |
| scope_creep | 需求蔓延体 | 30 | 80 | 4 | 4 | 50% 分裂2只已读不回 |
| burnout | 职业倦怠体 | 35 | 55 | 5 | 5 | 半径60，DOT3，减速50% |
| age_35 | 35岁危机 | 80 | 115 | 8 | 12 | 中层追击 |
| devops_pipeline | CI/CD 流水线 | 50 | 0 | 0 | 8 | 半径130 据点强化 |
| all_hands | 全员大会通告 | 25 | 40 | 3 | 4 | 每5s 消失2s |
| phishing_mail | 钓鱼邮件 | 10 | 145 | 2 | 2 | 40% 分裂2个自身，需防数量爆炸 |
| legacy_code | 屎山代码 | 60 | 35 | 6 | 7 | 60% 复活一次 |
| kpi_review | KPI 述职报告 | 70 | 50 | 7 | 10 | 受伤累计30触发返工 |
| pdd_master | PPT大师·觉醒 | 120 | 90 | 10 | 15 | 40% 闪避；名称疑似 typo/临时内容 |
| overtime_devil | 加班魔王 | 100 | 100 | 9 | 12 | 受伤累计40触发返工 |
| merged_dept | 部门合并风暴 | 55 | 75 | 6 | 8 | 30% 分裂3只已读不回 |
| silent_quit | 静默离职者 | 20 | 100 | 2 | 3 | 每6s 消失3s |

注意：上表全部存在于代码，不代表全部已达到 live 表现质量。`phishing_mail` 可递归分裂自身但子体禁止再分裂；对象预算仍需压力测试。

## 18. 月度怪物池

| 月 | 类型 |
|---:|---|
| 1 | email, cc_bomb, reinvent_wheel, phishing_mail |
| 2 | email, sticky, cc_bomb, reinvent_wheel, meeting_invite, message_recall, intern_swarm, all_hands |
| 3 | email, sticky, cc_bomb, meeting_invite, message_recall, urgent_meeting, outsourced_army, burnout, scope_creep |
| 4 | email, sticky, cr, cc_bomb, meeting_invite, urgent_meeting, outsourced_army, overtime_rework, req_review_board, tech_debt, legacy_code |
| 5 | email, sticky, cr, cc_bomb, meeting_invite, urgent_meeting, outsourced_army, overtime_rework, req_review_board, read_no_reply_ultimate, tech_debt, merged_dept, silent_quit |
| 6 | email, sticky, cr, cc_bomb, meeting_invite, urgent_meeting, outsourced_army, overtime_rework, devops_pipeline, read_no_reply_ultimate, tech_debt, merged_dept, kpi_review, age_35 |
| 7+ | 月6池 + pdd_master + overtime_devil；用于无尽高阶段映射 |

## 19. 消耗品

| ID | 名称 | 当前描述 | 状态 |
|---|---|---|---|
| iced_americano | 冰美式续命水 | 回 30 HP | live |
| overtime_redbull | 加班红牛 | 5s 移速 +50% | live |
| stock_option | 期权空头支票 | +50 经验 | live |
| n1_package | N+1 大礼包 | 30 护盾，10s | live |
| teambuild_milktea | 团建奶茶 | 8s 射速 +30% | live |
| boss_pie | 老板画的饼 | 50% 回25，50% 无效果 | live |
| double_quota | 双倍配额卡 | 6s 射速×2 | live |
| reset_card | 重置卡 | 清武器/冲刺/蒸馏冷却 | live |
| n2_package | 2N 大礼包 | 60盾12s + 回20 | live |
| resume_refresh | 简历刷新卡 | 免费重抽 +1 | live |
| triple_coffee | 三倍浓缩冰美式 | 回60 | experimental |
| energy_drink | 魔爪能量饮料 | 8s 移速+80%、射速+20% | experimental |
| golden_parachute | 金色降落伞 | 满血 + 10s 无敌 | experimental，强度高 |
| stock_vest | 限制性股票包 | 100盾15s + 回30 | experimental |
| promote_letter | 晋升通知书 | +100经验 + 立即升2级 | experimental，需核对重复升级结算 |
| overtime_4x | 四倍加班费卡 | 10s 射速×2、伤害×1.5 | experimental |
| refresh_token | Token 刷新卡 | 清冷却 + 5s 无消耗开火 | experimental |
| hr_blessing | HR 祝福卡 | 50%满血 + 50%升级/抽卡 | experimental |
| team_hotpot | 团建火锅券 | 15s 射速+50%、移速+30% | experimental |
| final_paycheck | 最终工资单 | 回50 + 5s 全场减速50% | experimental |

## 20. 随机事件

| ID | 名称 | 时长 | 效果 |
|---|---|---:|---|
| leader_check | 领导突击检查 | 30s | 敌人速度 +20%，击杀金币 +30% |
| tea_supply | 茶水间补给 | 1s | 玩家附近刷新 5 道具 |
| server_down | 服务器宕机 | 5s | 所有敌人眩晕 3s |
| hr_calibration | HR 绩效校准 | 35s | 按时间刷 1—3 个 KPI 追杀者 |
| all_hands | 全员大会 | 25s | 敌人向玩家靠拢，经验 +20%（需确认经验倍率真实应用） |
| budget_cut | 预算削减 | 30s | 金币 +50%，道具刷新减半（需确认刷新减半真实应用） |

事件间隔：正式战斗中 80—110 秒；试用期不触发。

## 21. 永久升级商店

| ID | 名称 | 等级成本 | 满级效果 | 总成本 |
|---|---|---|---|---:|
| hp_boost | 体检套餐 | 80/160/240 | 开局 HP +60 | 480 |
| spd_boost | 通勤电动车 | 100/200 | 开局移速 +20% | 300 |
| start_weapon | 内推信 | 120 | 可自选开局武器 | 120 |
| start_level | 学历提升计划 | 150/300 | 开局等级 +2 | 450 |
| start_item | 入职大礼包 | 40/80/120 | 开局掉 3 个随机道具 | 240 |
| extra_card | 面试加试 | 300 | 三选一变四选一 | 300 |
| dmg_boost | 绩效加成 | 120/240/360 | 开局伤害 +24% | 720 |
| fire_rate | 效率工具包 | 120/240 | 开局射速 +20% | 360 |
| shield_start | 期权护盾 | 60/120/180 | 开局 90 护盾，10s | 360 |
| xp_boost | 导师带教 | 90/180/270 | 经验 +45% | 540 |

全部买满总成本：3870 金币。`startShield` 满级 90 远高于基础 100 HP，但仅持续 10 秒；在试用期模式价值偏低，在 0 月模式价值极高，需按模式评估。

## 22. 成就奖励

| ID | 名称 | 条件 | 金币 |
|---|---|---|---:|
| first_game | 初入职场 | 完成任意一局 | 20 |
| kill_50 | 裁员新星 | 累计击杀50 | 30 |
| kill_300 | 裁员风暴 | 累计击杀300 | 80 |
| boss_killer | 老板克星 | 击败 Boss 1 次 | 80 |
| fuse_once | 融合专家 | 融合 1 次 | 60 |
| endless_10 | 无尽打工人 | 无尽第10波 | 100 |
| endless_20 | 永不下班 | 无尽第20波 | 200 |
| gold_500 | 金币搬砖工 | 累计获得500金币 | 100 |
| level_15 | 职级跃迁 | 单局 Lv.15 | 60 |
| shop_first | 福利领取 | 购买任意升级 | 30 |

一次性成就总奖励：760 金币，约覆盖商店总成本的 19.6%。

## 23. 无尽模式

```text
wave interval = max(12, 30 - 0.5 × wave)
burst = min(waveComp(mappedMonth).burst + floor(1.5 × wave), 40)
HP multiplier intent = 1 + 0.15 × wave
damage multiplier intent = 1 + 0.08 × wave
wave gold = 5 + wave
mappedMonth = min(7, 1 + floor(wave/2))
```

已知实现问题：`hpMul` 和 `dmgMul` 被计算，但 `spawnMob` 又按 `month=wave` 自行使用月度 HP/接触成长；局部变量没有传入，公式注释与真实成长不一致。正式调参前应先统一为一套公式。

## 24. 排行榜计分

```text
score = surviveTime × 10
      + kills × 2
      + level × 50
      + 3000 if boss killed
      + legendaryCount × 500
      + endlessWave × 800 in endless
```

客户端可疑条件：

- 生存时间 <0 或 >5400 秒。
- 击杀数 > `max(200, surviveTime×12)`。
- 等级 >80。
- 单局金币 >5000。
- 传说数量 >6。

问题：经典击杀权重仅 2 分，远低于生存每秒 10 分；排行榜几乎由时长和 Boss 决定，可能奖励拖延。建议经典模式改为名次/胜利主导，并对不同模式使用独立公式。

## 25. 每日挑战默认规则

| 项目 | 示例值 | 当前状态 |
|---|---|---|
| 武器池 | 国产 6 把 | 已生效 |
| 敌人速度 | ×1.15 | 仅 UI 显示，未应用 |
| 金币 | ×1.2 | 仅 UI 显示，未应用 |
| Boss 时间 | 360s | 仅 UI 显示，未应用 |
| 通关奖励 | 100 金币 | 未发放 |
| seed | `daily-YYYY-MM-DD` | 未驱动 RNG |

## 26. 调参护栏

- 任何常驻乘法单项每层建议不超过 20%；三层乘积必须显式列出。
- 闪避、硬控、无敌均需硬上限；有效闪避建议不超过 60%，特定大招短时可更高。
- 同一构筑的全屏清场间隔不低于 5 秒，Boss 伤害应有单次或每秒上限。
- 试用期怪物有效移速默认低于玩家基础 130；超过者必须低 HP、低接触伤害或有明显预警。
- 标准局同屏高机制威胁不超过 3 类。
- 商店永久伤害/射速/经验应计入排行榜分组或统一禁用，否则榜单不可比。
- 所有新增字段必须由内容校验脚本确认被运行时读取；未使用字段不得写入 live 描述。

## 27. 平衡验证样本

每次版本至少跑以下固定 seed 组合各 20 局：

| 组合 | 模式 | 试用期 | 武器/控制 | 目标 |
|---|---|---:|---|---|
| A | 经典 | 3 | ChatGPT，手动 | 标准基线 |
| B | 经典 | 2 | 豆包，自动 | 移动端近似 |
| C | 经典 | 0 | Claude，手动 | 硬核开局 |
| D | 经典 | 6 | DeepSeek，全托管 | 长局与极端成长 |
| E | 无尽 | — | 随机 | 20 波性能与成长 |
| F | 每日 | — | 固定 seed | 规则复现与榜单 |

输出：首升时间、转正等级、武器等级、融合时间、死亡来源、Boss 出场/存活时间、局长、最低帧率、对象峰值。
