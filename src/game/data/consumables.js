/* 地面消耗品（spr 对应 sprites.js 里 SPR 的键名，效果逻辑见 core.js useItem） */
export const CONSUMABLES = {
  iced_americano: { name: '冰美式续命水', spr: 'coffee', desc: '回复 30 HP' },
  overtime_redbull: { name: '加班红牛', spr: 'can', desc: '5 秒移速 +50%' },
  stock_option: { name: '期权空头支票', spr: 'xp', big: true, desc: '+50 经验' },
  n1_package: { name: 'N+1大礼包', spr: 'doc', desc: '30 点护盾（10 秒）' },
  teambuild_milktea: { name: '团建奶茶', spr: 'milktea', desc: '8 秒射速 +30%' },
  boss_pie: { name: '老板画的饼', spr: 'bing', desc: '50% 回 25 HP，50% 啥也没有' },
  double_quota: { name: '双倍配额卡', spr: 'quota', desc: '6 秒内射速 ×2——敞开用！' },
  reset_card: { name: '重置卡', spr: 'reset', desc: '全部冷却清零（武器/冲刺/蒸馏技能）' },
  n2_package: { name: '2N 大礼包', spr: 'doc2n', desc: '60 护盾（12 秒）+ 回 20 HP' },
  resume_refresh: { name: '简历刷新卡', spr: 'doc', desc: '获得一次三选一免费重抽机会' },
};
