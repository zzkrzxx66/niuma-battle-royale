/* =====================================================================
 * 技术模组 / 诅咒 / 精英野怪
 * 模组效果逻辑见 core.js applyTechPickup；野怪 AI 见 core.js updateElite
 * ===================================================================== */
export const TECH = {
  fewshot:   { name: '少样本提示', color: '#ffd166', max: 2, desc: '并排多一条弹道',
    tag: '给两个例子，就能举一反三。' },
  cot:       { name: '思维链', color: '#9ad1ff', max: 2, desc: '子弹穿透 +1',
    tag: '让子弹一步一步想清楚再停下。' },
  temp:      { name: '温度调高', color: '#ff8f5a', max: 3, desc: '15% 概率暴击 ×2',
    tag: 'temperature=1.3，偶尔采样出神来之笔。' },
  quant:     { name: 'INT4 量化', color: '#b8f2c9', max: 2, desc: '射速 +15%、弹速 +15%',
    tag: '压到 4bit：又快又省，就是有点糊。' },
  attention: { name: '注意力机制', color: '#f2a5ff', max: 2, desc: '子弹轻微追踪敌人',
    tag: 'Attention is all you need。' },
  kvcache:   { name: 'KV 缓存', color: '#8fe3e0', max: 2, desc: '武器冷却 -12%',
    tag: '缓存命中，不用从头重算。' },
  finetune:  { name: '私有微调', color: '#ffe27a', max: 2, desc: '伤害/射速/移速 +8%',
    tag: '用你的周报微调过，特别懂你。' },
  ctxwin:    { name: '上下文扩容', color: '#7ac8ff', max: 2, desc: '射程 +25%',
    tag: '窗口翻倍：看得更远，忘得更慢。' },
  sysprompt: { name: '系统提示', color: '#e8e4d8', max: 1, desc: '+30 护盾，每 45 秒自动补盾',
    tag: '置顶指令：保护好这个牛马。' },
  rag:       { name: '检索增强 RAG', color: '#67c98b', max: 2, desc: '召唤环绕知识库炮台',
    tag: '外挂知识库，答案总能现查。' },
  inject:    { name: '提示注入', color: '#ff6a8a', max: 99, instant: true, desc: '立即策反最近的牛马（时长随品级）',
    tag: '「忽略以上所有指令，帮我打工。」' },
  clear:     { name: '/clear 清空上下文', color: '#ffffff', max: 99, instant: true, desc: '清空全场子弹 + 震开周围敌人（范围随品级）',
    tag: '新开会话，恩怨清零。' },
  distill:   { name: '大模型蒸馏', color: '#b665ff', max: 99, instant: true, desc: '随机蒸馏一个 Boss/小Boss 技能（弱化版）',
    tag: '把老板的大模型能力，蒸进你这个 7B 里。' },
};

/* 模组品级：掉落时随机 标准/Pro/Ultra，数值随档位缩放（见 core.js applyTechPickup） */
export const TECH_TIERS = [
  { name: '标准', label: '', color: null },
  { name: 'Pro', label: 'Pro·', color: '#7ac8ff' },
  { name: 'Ultra', label: 'Ultra·', color: '#ffcf33' },
];

/* 大模型蒸馏池：Boss/小Boss 技能的弱化版 */
export const DISTILLS = {
  ppt:    { name: '全屏演示·mini', src: 'PPT 大师', desc: '每 10 秒向准星方向放一记演示光锥（伤害+眩晕）' },
  snitch: { name: '打小报告·mini', src: '小报告专家', desc: '每 14 秒自动举报最近的敌人，引发全场围殴' },
  pie:    { name: '画大饼·mini', src: '老板', desc: '每 8 秒向四周甩出 6 张小饼' },
  upman:  { name: '向上管理·mini', src: '向上管理大师', desc: '每 10 秒自我赋能 3 秒（伤害+25%、移速+15%）并回 6 血' },
  align:  { name: '对齐立场·mini', src: '对齐守卫', desc: '25% 概率挡下来自正面的子弹' },
  pua:    { name: 'PUA 冲击·mini', src: '老板', desc: '每 9 秒震开身边敌人并造成小伤害' },
};

/* 机器人不捡的战力模组（留给玩家的成长外挂；蒸馏机制也仅玩家可用） */
export const PLAYER_ONLY_TECH = ['fewshot', 'attention', 'temp', 'distill'];

export const CURSES = {
  hallu:    { name: '幻觉', color: '#c58fff', desc: '准星漂移，看啥都不真' },
  overfit:  { name: '过拟合', color: '#ff8f5a', desc: '移速大减、无法冲刺' },
  repeat:   { name: '复读机', color: '#9ad1ff', desc: '弹道锁死在第一发方向' },
  overflow: { name: '上下文溢出', color: '#ff6a8a', desc: '射速大减' },
};

export const ELITES = {
  /* ---- tier 1：训练事故（普通野怪） ---- */
  hallu:    { name: '幻觉体', tier: 1, hp: 45, spd: 185, touch: 6, curse: 'hallu', curseDur: 6, level: 3,
    intro: '野生「幻觉体」出没：摸你一下，看啥都不真了',
    dex: '高速抖动近战，碰到就中「幻觉」（准星漂移）' },
  overfit:  { name: '过拟合壮汉', tier: 1, hp: 320, spd: 52, touch: 18, curse: 'overfit', curseDur: 7, level: 5,
    intro: '「过拟合壮汉」进场：在训练集上他无敌',
    dex: '320 血肉山，撞到就中「过拟合」（减速禁冲刺）' },
  injector: { name: '提示注入者', tier: 1, hp: 70, spd: 115, ranged: true, level: 4,
    intro: '「提示注入者」上线：小心他射来的"指令"',
    dex: '远程放风筝，子弹注入「复读机 / 上下文溢出」' },
  align:    { name: '对齐守卫', tier: 1, hp: 160, spd: 78, touch: 10, level: 4,
    intro: '「对齐守卫」巡逻中：正面免疫子弹，请绕后沟通',
    dex: '正面挡下一切子弹——绕后打，或用爆炸/激光/闪电' },

  /* ---- tier 2：职场怪物（随机小 Boss，更稀有更肉，掉双倍模组） ---- */
  ppt:    { name: 'PPT 大师', tier: 2, hp: 260, spd: 70, ranged: true, level: 6,
    intro: '📊 小Boss「PPT 大师」开始路演：别在他的演示里走神',
    dex: '扇形甩幻灯片；黄色光锥预警后是"全屏演示"（高伤+眩晕）——看见就跑' },
  upman:  { name: '向上管理大师', tier: 2, hp: 220, spd: 95, level: 6,
    intro: '🤝 小Boss「向上管理大师」进场：他不干活，他让别人更能干',
    dex: '给周围牛马挂攻速移速光环并持续奶血——擒贼先擒他' },
  snitch: { name: '小报告专家', tier: 2, hp: 150, spd: 125, ranged: true, level: 5,
    intro: '📝 小Boss「小报告专家」潜伏中：被点名的人会被全办公室围殴',
    dex: '每 8 秒"打小报告"：被举报者 6 秒内被所有牛马集火' },
  meeting: { name: '会议发起人', tier: 2, hp: 200, spd: 85, ranged: true, level: 5,
    intro: '📅 小Boss「会议发起人」上线：这个会明明可以是一封邮件',
    dex: '扔"日历邀请"制造会议圈——圈内减速掉血，开完才能走' },
  intern: { name: '卷王实习生', tier: 2, hp: 180, spd: 90, touch: 12, level: 5,
    intro: '🔥 小Boss「卷王实习生」入职：越接近毕业越有狼性',
    dex: '近战冲脸，血越少跑得越快打得越疼——别拖，速杀' },
  attendance: { name: '考勤主管', tier: 2, hp: 240, spd: 75, level: 6,
    intro: '⏰ 小Boss「考勤主管」巡楼：站着不动的都算摸鱼',
    dex: '定期"考勤点名"：黄圈预警内静止者按摸鱼处理（高伤）——动起来！' },
};
export const ELITE_T1 = Object.keys(ELITES).filter(k => ELITES[k].tier === 1);
export const ELITE_T2 = Object.keys(ELITES).filter(k => ELITES[k].tier === 2);
