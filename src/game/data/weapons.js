/* =====================================================================
 * 12 把 AI 武器 + 6 把传说融合武器
 * 加新武器：在 WEAPONS 里加一条，kind 决定弹道逻辑（见 core.js updateWeapon）
 * ===================================================================== */
export const WEAPONS = {
  deepseek: { name: 'DeepSeek', country: 'CN', color: '#3d6bff',
    tagline: '性价比之王，量大管饱，偶尔"服务器繁忙"',
    pat: '高射速机枪：子弹跟 token 一样不要钱',
    kind: 'mg', cd: .11, dmg: 2.3, spd: 300, range: 220, spread: .07 },
  kimi: { name: 'Kimi', country: 'CN', color: '#38d3e8',
    tagline: '两百万字长文档一口吞',
    pat: '超长射程穿透狙击：射程跟上下文窗口一样长',
    kind: 'sniper', cd: 1.5, dmg: 30, spd: 620, range: 600, pierce: 99 },
  qwen: { name: '通义千问', country: 'CN', color: '#ff9440',
    tagline: '开源全家桶，型号多到你选择困难',
    pat: '5 发扇形霰弹：贴脸即蒸发',
    kind: 'shotgun', cd: 1.1, dmg: 4.6, spd: 260, range: 125, count: 5, spread: 1.0 },
  wenxin: { name: '文心一言', country: 'CN', color: '#ffcf33',
    tagline: '饼画得又大又圆，落地才知道有多响',
    pat: '抛物线大饼：落点爆炸，可越过办公桌',
    kind: 'lob', cd: 1.4, dmg: 26, spd: 190, range: 190, boomR: 42 },
  doubao: { name: '豆包', country: 'CN', color: '#ff9edb',
    tagline: '萌萌的豆子锁定你，甩都甩不掉',
    pat: '追踪豆：自动索敌，走位苦手救星',
    kind: 'homing', cd: .7, dmg: 12.5, spd: 185, range: 560, homing: 4.5 },
  glm: { name: '智谱GLM', country: 'CN', color: '#7ac8ff',
    tagline: '清华学霸出品，一道闪电电得全部门规规矩矩',
    pat: '链式闪电：弹跳 3 个敌人，打人堆收益爆炸',
    kind: 'chain', cd: 1.0, dmg: 17, range: 190, chains: 3, decay: .8 },
  chatgpt: { name: 'ChatGPT', country: 'US', color: '#4ec9a0',
    tagline: '地表最火，啥都会亿点，偶尔一本正经地胡编',
    pat: '标准单发步枪：六边形战士，闭眼能用',
    kind: 'single', cd: .5, dmg: 10, spd: 320, range: 260 },
  claude: { name: 'Claude', country: 'US', color: '#e8825a',
    tagline: '写代码一绝，就是动不动"用量上限"',
    pat: '蓄力激光：按住蓄力，松开一枪巨额伤害',
    kind: 'charge', cd: .45, dmg: 8, dmgMax: 42, chargeT: 1.2, range: 270, beamW: 8 },
  gemini: { name: 'Gemini', country: 'US', color: '#8f7bff',
    tagline: '双子座人格，上一枪天才下一枪天塌',
    pat: '双联平行弹道：弹幕量双倍，中间留缝',
    kind: 'twin', cd: .55, dmg: 6, spd: 320, range: 240 },
  copilot: { name: 'Copilot', country: 'US', color: '#6aa3ff',
    tagline: '回形针成精，专替你打工顺便抢功',
    pat: '环绕僚机：全自动索敌，解放双手专心跑毒',
    kind: 'drone', cd: .8, dmg: 8.5, spd: 300, range: 150, drones: 2 },
  midjourney: { name: 'Midjourney', country: 'US', color: '#e86ad0',
    tagline: '开火全靠抽卡，美是真美，手是真崩',
    pat: '抽卡弹道：四种弹型随机，伤害 0.5~3 倍浮动',
    kind: 'gacha', cd: .9, dmg: 10, spd: 300, range: 230 },
  grok: { name: 'Grok', country: 'US', color: '#e8e4d8',
    tagline: '阴阳怪气拉满，说出去的话迟早拐回来',
    pat: '回旋镖：去程回程各判一次，能打身后',
    kind: 'boomerang', cd: .95, dmg: 10, spd: 300, range: 140 },
};

export const LEGENDS = {
  agi: { name: 'AGI降临', color: '#ffffff',
    tagline: '中美顶级模型合体——第一个被优化的是在场全体牛马',
    pat: '全自动追踪弹幕 + 每 3 秒一道天罚激光柱',
    kind: 'leg_agi', cd: .12, dmg: 5.5, spd: 330, range: 320, homing: 3,
    pillarCd: 3, pillarDmg: 60, pillarR: 48 },
  price_war: { name: '百模大战·价格屠夫', color: '#ff9edb',
    tagline: '子弹跟 token 一样卷到零元购，用量淹死对手',
    pat: '每次开火 15 发扇形追踪豆弹幕',
    kind: 'leg_pea', cd: .5, dmg: 3.2, spd: 250, range: 280, count: 15, spread: 1.4, homing: 2.5 },
  tenx: { name: '十倍程序员', color: '#e8825a',
    tagline: '一个人干十个人的活，背十个人的锅',
    pat: '4 台回形针实习生炮台，开火时全体齐射',
    kind: 'leg_drone', cd: 1.2, dmg: 9, spd: 340, range: 170, drones: 4, volleyDmg: 26 },
  pie_feast: { name: '画饼充饥', color: '#ffcf33',
    tagline: '画了三年的饼，今天又大又圆又烫',
    pat: '连抛 3 张巨型大饼，留下燃烧颜料地带',
    kind: 'leg_pie', cd: 1.5, dmg: 36, spd: 210, range: 210, boomR: 55, burnR: 45, burnDps: 10, burnT: 5 },
  infinite_ctx: { name: '无限上下文', color: '#38d3e8',
    tagline: '你的绩效它一秒读完，然后一束光全部带走',
    pat: '按住开火：贯穿全图双联激光横扫（移速减半）',
    kind: 'leg_beam', cd: .12, dmg: 6, range: 9999 },
  mouthpiece: { name: '职场嘴替', color: '#7ac8ff',
    tagline: '工位上不敢说的话，它带一万伏替你说，拐弯再补一刀',
    pat: '巨型带电 X 回旋镖，沿途链式放电，回程伤害翻倍',
    kind: 'leg_boom', cd: 1.3, dmg: 30, spd: 280, range: 200, zapCd: .25, zapDmg: 9, chains: 4 },
};

/* 融合配方：满级武器 + 另一品牌芯片 -> 传说 */
export const RECIPES = [
  ['deepseek', 'chatgpt', 'agi'],
  ['qwen', 'doubao', 'price_war'],
  ['claude', 'copilot', 'tenx'],
  ['wenxin', 'midjourney', 'pie_feast'],
  ['kimi', 'gemini', 'infinite_ctx'],
  ['glm', 'grok', 'mouthpiece'],
];

export function findRecipe(a, b) {
  for (const [x, y, leg] of RECIPES) if ((a === x && b === y) || (a === y && b === x)) return leg;
  return null;
}
export function recipePartner(id) {
  for (const [x, y, leg] of RECIPES) {
    if (id === x) return { partner: y, leg };
    if (id === y) return { partner: x, leg };
  }
  return null;
}
/* 当前武器定义（普通或传说） */
export const wdef = u => (u.weapon.leg ? LEGENDS[u.weapon.leg] : WEAPONS[u.weapon.id]);
