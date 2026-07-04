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
  /* ===== v2.0 新增道具 ===== */
  triple_coffee: { name: '三倍浓缩冰美式', spr: 'coffee', desc: '回复 60 HP' },
  energy_drink: { name: '魔爪能量饮料', spr: 'can', desc: '8 秒移速 +80% + 射速 +20%' },
  golden_parachute: { name: '金色降落伞', spr: 'doc', big: true, desc: '满血回复 + 10 秒无敌' },
  stock_vest: { name: '限制性股票包', spr: 'doc2n', desc: '100 护盾（15 秒）+ 回 30 HP' },
  promote_letter: { name: '晋升通知书', spr: 'xp', big: true, desc: '+100 经验 + 立即升 2 级' },
  overtime_4x: { name: '四倍加班费卡', spr: 'quota', desc: '10 秒内射速 ×2 + 伤害 ×1.5' },
  refresh_token: { name: 'Token 刷新卡', spr: 'reset', desc: '全部冷却清零 + 5 秒无消耗开火' },
  hr_blessing: { name: 'HR 祝福卡', spr: 'bing', desc: '50% 满血+50% 升级+1 抽卡次数' },
  team_hotpot: { name: '团建火锅券', spr: 'milktea', desc: '15 秒射速 +50% + 移速 +30%' },
  final_paycheck: { name: '最终工资单', spr: 'doc', big: true, desc: '回 50 HP + 5 秒全场减速 50%' },
};
