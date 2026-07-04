/* =====================================================================
 * 像素精灵：字符画 -> 离屏 canvas
 * ===================================================================== */
export const PAL = {
  k: '#14161d', w: '#f2efe6', W: '#ffffff',
  s: '#e8b98a', S: '#c98f5e',
  h: '#3a3430', H: '#5a5048',
  q: '#d8c9a3',
  y: '#ffcf33', Y: '#ffe27a',
  r: '#ff4f4f', R: '#d43a2f',
  g: '#4ec9a0', b: '#6aa3ff', p: '#b665ff', o: '#ff9440',
  d: '#2a2f3c', D: '#454e63', m: '#8d9dbb', M: '#b9c6de',
  c: '#7a5232', C: '#a8794f',
  e: '#1e2230', E: '#323a4c',
  n: '#3f9f66', N: '#67c98b',
  u: '#38b6d9',
};

export function makeSprite(rows, overrides) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      if (ch === '.') continue;
      const col = (overrides && overrides[ch]) || PAL[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

/* 牛马打工人（12x15，长了一对牛角），T=衬衫色 */
const WORKER_ROWS = [
  '..q......q..',
  '.qq......qq.',
  '..khhhhhhk..',
  '.khhhhhhhhk.',
  '.kssssssssk.',
  '.kskssssksk.',
  '.kssssssssk.',
  '..kssssssk..',
  '.kTTTTTTTTk.',
  '.kTyTTTTTTk.',
  '.kTTTTTTTTk.',
  '..kTTTTTTk..',
  '..kdd..ddk..',
  '..kd....dk..',
  '..kk....kk..',
];
/* 老板（16x18）：背头、墨镜、西装、金表 */
const BOSS_ROWS = [
  '....kkkkkkkk....',
  '...kHHHHHHHHk...',
  '..kHHHHHHHHHHk..',
  '..kssssssssssk..',
  '..kkkkkkkkkkkk..',
  '..ksskkssskssk..',
  '..kssssssssssk..',
  '...kssssssssk...',
  '..keeWWWWWWeek..',
  '.keeeWWrrWWeeek.',
  '.keeeWWrrWWeeyk.',
  '.keeeWWWWWWeeek.',
  '.keeeeWWWWeeeek.',
  '..keeeeeeeeeek..',
  '...keee..eeek...',
  '...kee....eek...',
  '...kee....eek...',
  '...kkk....kkk...',
];
/* 幻觉体（10x8，会闪烁的紫色幽灵） */
const GHOST_ROWS = [
  '..pppppp..',
  '.pPPPPPPp.',
  'pPkPPPkPPp',
  'pPPPPPPPPp',
  'pPPPPPPPPp',
  '.pPPPPPPp.',
  '.pP.pp.Pp.',
  '..........',
];
/* AI 芯片（9x8），C=品牌色 */
const CHIP_ROWS = [
  '.k.kk.k..',
  'kkkkkkkk.',
  'kCCwCCCk.',
  'kCCCCCCk.',
  'kCCCCwCk.',
  'kkkkkkkk.',
  '.k.kk.k..',
  '.........',
];
/* 技术模组软盘（8x8），C=模组色 */
const FLOPPY_ROWS = [
  'kkkkkkkk',
  'kCCkwwCk',
  'kCCCCCCk',
  'kCwwwwCk',
  'kCwwwwCk',
  'kCCCCCCk',
  'kkkkkkkk',
  '........',
];
const XP_ROWS = [
  '...y...',
  '..yYy..',
  '.yYWYy.',
  '..yYy..',
  '...y...',
  '.......',
];
const COFFEE_ROWS = [
  '..w..w..',
  '.w..w...',
  'kkkkkk..',
  'kWWWWkk.',
  'kWccWk.k',
  'kWccWk.k',
  'kWWWWkk.',
  '.kkkk...',
  '........',
];
const CAN_ROWS = [
  '.kkkk.',
  'kbbbbk',
  'kbWWbk',
  'kbrrbk',
  'kbrrbk',
  'kbWWbk',
  'kbbbbk',
  '.kkkk.',
  '......',
];
const DOC_ROWS = [
  'kkkkkkkk.',
  'kWWWWWWk.',
  'kWkkkkWk.',
  'kWWWWWWk.',
  'kWkkkWWk.',
  'kWWWWWWk.',
  'kWrrrWWk.',
  'kWWWWWWk.',
  'kkkkkkkk.',
  '.........',
];
const BING_ROWS = [
  '..kkkkkk..',
  '.kYYYYYYk.',
  'kYyYYYyYYk',
  'kYYYoYYYYk',
  'kYYYYYyYYk',
  'kYyYYYYYYk',
  '.kYYYYYYk.',
  '..kkkkkk..',
];
const DESK_ROWS = [
  '..........................',
  '.........kkkkkkkk.........',
  '.........kuuuuuuk.........',
  '.........kuuMuuuk.........',
  '.........kuuuuuuk.........',
  '.........kkkkkkkk.........',
  '............kk............',
  '..........kkkkkk..........',
  'kkkkkkkkkkkkkkkkkkkkkkkkkk',
  'kDDDDDDDDDDDDDDDDDDDDDDDDk',
  'kDDDDDDDDDDDDDDDDDDDDDDDDk',
  'kkkkkkkkkkkkkkkkkkkkkkkkkk',
  '.kddk................kddk.',
  '.kddk................kddk.',
  '.kddk................kddk.',
  '..........................',
];
const PLANT_ROWS = [
  '...nn.nn..',
  '..nNNnNn..',
  '.nNNnnNNn.',
  '..nnNNnn..',
  '...nNNn...',
  '....nn....',
  '..kkkkkk..',
  '..kCCCCk..',
  '...kCCk...',
  '...kCCk...',
  '...kkkk...',
  '..........',
  '..........',
];
const COOLER_ROWS = [
  '..kkkkkk..',
  '.kuuuuuuk.',
  '.kuWuuuuk.',
  '.kuuuuuuk.',
  '.kkkkkkkk.',
  '.kMMMMMMk.',
  '.kMkkkkMk.',
  '.kMMMMMMk.',
  '.kMMMMMMk.',
  '.kMMMMMMk.',
  '.kkkkkkkk.',
  '..kk..kk..',
  '..........',
  '..........',
  '..........',
  '..........',
];

/* 双倍配额卡（金卡 9x8） */
const QUOTA_ROWS = [
  'kkkkkkkkk',
  'kYYYYYYYk',
  'kYWYYWYYk',
  'kYYYYYYYk',
  'kYWWYWWYk',
  'kYYYYYYYk',
  'kkkkkkkkk',
  '.........',
];
/* 重置卡（白卡绿环 9x8） */
const RESET_ROWS = [
  'kkkkkkkkk',
  'kWWWWWWWk',
  'kWnnnnWWk',
  'kWnWWnWWk',
  'kWnWWnnWk',
  'kWnnnnnWk',
  'kWWWWWWWk',
  'kkkkkkkkk',
];
/* 试用期杂鱼：未读邮件 / 待办便利贴 / 需求变更单（8x7 级别小怪） */
const MOB_EMAIL_ROWS = [
  'kkkkkkkk',
  'kWWWWWrk',
  'kWkWWkWk',
  'kWWkkWWk',
  'kWWWWWWk',
  'kkkkkkkk',
  '........',
];
const MOB_STICKY_ROWS = [
  'kkkkkkkk',
  'kyyyyyyk',
  'kyykyyyk',
  'kyyyyyyk',
  'kyykykyk',
  'kyyyyyYk',
  'kkkkkkkk',
];
const MOB_CR_ROWS = [
  'kkkkkkk.',
  'kWWWWWk.',
  'kWWrWWk.',
  'kWWrWWk.',
  'kWWWWWk.',
  'kWWrWWk.',
  'kkkkkkk.',
];
/* 抄送轰炸：橙色抄送徽章 */
const MOB_CCBOMB_ROWS = [
  'kkkkkkkk',
  'kooooook',
  'kokWWkok',
  'kokWWkok',
  'kooooook',
  'kkkkkkkk',
  '........',
];
/* 已读不回：迷你蓝色气泡 */
const MOB_READREPLY_ROWS = [
  '.kkkkk..',
  '.kbbbk..',
  '.kbkbk..',
  '.kbbbk..',
  '.kkkkk..',
  '........',
  '........',
];
/* 会议邀请：红头日历 */
const MOB_MEETING_ROWS = [
  'kkkkkkkk',
  'krrrrrrk',
  'kWWWWWWk',
  'kWkWkWWk',
  'kWWWWWWk',
  'kkkkkkkk',
  '........',
];
/* 加急会议提醒：橙色警示日历 */
const MOB_URGENT_ROWS = [
  'kkkkkkkk',
  'kooooook',
  'kWoWoWWk',
  'kWWoWWWk',
  'kooooook',
  'kkkkkkkk',
  '........',
];
/* 深夜加班灯：静止台灯 */
const MOB_LAMP_ROWS = [
  '..kkkk..',
  '.kyyyyk.',
  '.kyYYyk.',
  '.kyyyyk.',
  '..kkkk..',
  '..kCCk..',
  '..kCCk..',
];

/* 重复造轮子任务：便利贴形状+蓝色护盾配色 */
const MOB_WHEEL_ROWS = [
  'kkkkkkkk',
  'kbbbbbbk',
  'kbbkbbbk',
  'kbbbbbbk',
  'kbbkbbbk',
  'kbbbbbYk',
  'kkkkkkkk',
];
/* KPI追杀者：需求单形状+红色激进配色，中间层体积更大 */
const MOB_HUNTER_ROWS = [
  'kkkkkkkkk',
  'kRRRRRRRk',
  'kRRoRRoRk',
  'kRRRRRRRk',
  'kRRoRRoRk',
  'kRRRRRRRk',
  'kkkkkkkkk',
];
/* 临时工外包大军：邮件形状+绿色配色，小体积群怪 */
const MOB_ARMY_ROWS = [
  'kkkkkk',
  'kNNNNk',
  'kNkNNk',
  'kNNkNk',
  'kNNNNk',
  'kkkkkk',
];
/* 深夜返工提醒：日历形状+紫色配色 */
const MOB_REWORK_ROWS = [
  'kkkkkkkk',
  'kppppppk',
  'kWpWpWWk',
  'kWWpWWWk',
  'kppppppk',
  'kkkkkkkk',
  '........',
];
/* 已读不回·终极形态：幽灵状半透明气泡，白色轮廓 */
const MOB_GHOSTREPLY_ROWS = [
  '.kkkkk..',
  '.kWWWk..',
  '.kWkWk..',
  '.kWWWk..',
  '.kkWkk..',
  '..k.k...',
  '........',
];
/* 需求评审会：据点型台灯形状+青色配色 */
const MOB_REVIEWBOARD_ROWS = [
  '..kkkk..',
  '.kuuuuk.',
  '.kuUUuk.',
  '.kuuuuk.',
  '..kkkk..',
  '..kMMk..',
  '..kMMk..',
];
/* 已发送-撤回中：警示日历形状+蓝色配色 */
const MOB_RECALL_ROWS = [
  'kkkkkkkk',
  'kbbbbbbk',
  'kWbWbWWk',
  'kWWbWWWk',
  'kbbbbbbk',
  'kkkkkkkk',
  '........',
];

/* AI 替身样本（紫色小瓶 7x9） */
const FLASK_ROWS = [
  '..kkk..',
  '..kWk..',
  '..kWk..',
  '.kpPpk.',
  'kpPPPpk',
  'kpPPPpk',
  'kpppppk',
  '.kkkkk.',
  '.......',
];

export const SPR = {
  boss: makeSprite(BOSS_ROWS),
  quota: makeSprite(QUOTA_ROWS),
  reset: makeSprite(RESET_ROWS),
  flask: makeSprite(FLASK_ROWS, { P: '#d9b3ff' }),
  mob_email: makeSprite(MOB_EMAIL_ROWS),
  mob_sticky: makeSprite(MOB_STICKY_ROWS),
  mob_ccbomb: makeSprite(MOB_CCBOMB_ROWS),
  mob_readreply: makeSprite(MOB_READREPLY_ROWS),
  mob_meeting: makeSprite(MOB_MEETING_ROWS),
  mob_urgent: makeSprite(MOB_URGENT_ROWS),
  mob_lamp: makeSprite(MOB_LAMP_ROWS),
  mob_wheel: makeSprite(MOB_WHEEL_ROWS),
  mob_hunter: makeSprite(MOB_HUNTER_ROWS),
  mob_army: makeSprite(MOB_ARMY_ROWS),
  mob_rework: makeSprite(MOB_REWORK_ROWS),
  mob_ghostreply: makeSprite(MOB_GHOSTREPLY_ROWS, { W: '#d8e8ff' }),
  mob_reviewboard: makeSprite(MOB_REVIEWBOARD_ROWS),
  mob_recall: makeSprite(MOB_RECALL_ROWS),
  mob_cr: makeSprite(MOB_CR_ROWS),
  ghost: makeSprite(GHOST_ROWS, { P: '#c9a0f5' }),
  xp: makeSprite(XP_ROWS),
  coffee: makeSprite(COFFEE_ROWS),
  can: makeSprite(CAN_ROWS),
  doc: makeSprite(DOC_ROWS),
  bing: makeSprite(BING_ROWS),
  desk: makeSprite(DESK_ROWS),
  plant: makeSprite(PLANT_ROWS),
  cooler: makeSprite(COOLER_ROWS),
  milktea: makeSprite(CAN_ROWS, { b: '#f3d9c3', r: '#c98f5e', W: '#ff9edb' }),
  doc2n: makeSprite(DOC_ROWS, { r: '#c9a227' }),
};

export const SHIRT_COLORS = ['#6aa3ff', '#4ec9a0', '#ff9440', '#b665ff', '#e0e0e0', '#ff6a8a', '#38b6d9', '#c9b458'];

const workerCache = {};
export function workerSprite(shirt) {
  if (!workerCache[shirt]) workerCache[shirt] = makeSprite(WORKER_ROWS, { T: shirt });
  return workerCache[shirt];
}
const chipCache = {};
export function chipSprite(color) {
  if (!chipCache[color]) chipCache[color] = makeSprite(CHIP_ROWS, { C: color });
  return chipCache[color];
}
const techCache = {};
export function techSprite(color) {
  if (!techCache[color]) techCache[color] = makeSprite(FLOPPY_ROWS, { C: color });
  return techCache[color];
}

/* 地板贴图：夜班办公室地毯 */
function makeFloorTile(variant) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#1c212c'; g.fillRect(0, 0, 32, 32);
  g.fillStyle = '#191d28';
  for (let i = 0; i < 32; i += 4) g.fillRect(i, 0, 1, 32);
  g.fillStyle = '#141821';
  g.fillRect(0, 0, 32, 1); g.fillRect(0, 0, 1, 32);
  if (variant === 1) { g.fillStyle = '#222838'; g.fillRect(9, 13, 3, 2); g.fillRect(20, 6, 2, 2); }
  if (variant === 2) { g.fillStyle = '#161a24'; g.fillRect(14, 20, 4, 3); g.fillStyle = '#242a3a'; g.fillRect(5, 5, 2, 2); }
  return c;
}
export const FLOOR_TILES = [makeFloorTile(0), makeFloorTile(1), makeFloorTile(2)];
