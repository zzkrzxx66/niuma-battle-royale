/* ============================================================
 * 金币商城 · 永久升级表
 * 购买后用 localStorage 持久化，每局开局自动生效
 * 每项升级有 max 等级，升满后不再可购买
 * ============================================================ */

export const SHOP_ITEMS = [
  {
    id: 'hp_boost',
    name: '体检套餐',
    icon: '🩺',
    desc: '开局永久多 20 HP',
    cost: [30, 60, 90],
    max: 3,
    perLevel: 20,
    effect: 'hpBonus',
  },
  {
    id: 'spd_boost',
    name: '通勤电动车',
    icon: '🛵',
    desc: '开局永久移速 +10%',
    cost: [40, 80],
    max: 2,
    perLevel: 0.10,
    effect: 'spdBonus',
  },
  {
    id: 'start_weapon',
    name: '内推信',
    icon: '✉️',
    desc: '开局自选武器（而非随机）',
    cost: [25],
    max: 1,
    effect: 'chooseWeapon',
  },
  {
    id: 'start_level',
    name: '学历提升计划',
    icon: '🎓',
    desc: '开局从 Lv.2 开始（自带 1 级升级）',
    cost: [50, 100],
    max: 2,
    perLevel: 1,
    effect: 'startLevel',
  },
  {
    id: 'start_item',
    name: '入职大礼包',
    icon: '🎁',
    desc: '开局自带 1 个随机道具',
    cost: [15, 30, 45],
    max: 3,
    perLevel: 1,
    effect: 'startItems',
  },
  {
    id: 'extra_card',
    name: '面试加试',
    icon: '🗂️',
    desc: '升级三选一变四选一',
    cost: [100],
    max: 1,
    effect: 'extraCard',
  },
  {
    id: 'dmg_boost',
    name: '绩效加成',
    icon: '📈',
    desc: '开局永久伤害 +8%',
    cost: [50, 100, 150],
    max: 3,
    perLevel: 0.08,
    effect: 'dmgBonus',
  },
  {
    id: 'fire_rate',
    name: '效率工具包',
    icon: '⚡',
    desc: '开局永久射速 +10%',
    cost: [50, 100],
    max: 2,
    perLevel: 0.10,
    effect: 'fireRateBonus',
  },
  {
    id: 'shield_start',
    name: '期权护盾',
    icon: '🛡️',
    desc: '开局自带 30 护盾（10 秒）',
    cost: [20, 40, 60],
    max: 3,
    perLevel: 30,
    effect: 'startShield',
  },
  {
    id: 'xp_boost',
    name: '导师带教',
    icon: '👨‍🏫',
    desc: '经验获取 +15%',
    cost: [35, 70, 105],
    max: 3,
    perLevel: 0.15,
    effect: 'xpBonus',
  },
];

/* 加载已购买升级（localStorage） */
export function loadShopUpgrades() {
  try {
    const raw = localStorage.getItem('niuma_shop');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) { return {}; }
}

/* 保存升级状态 */
export function saveShopUpgrades(upgrades) {
  try {
    localStorage.setItem('niuma_shop', JSON.stringify(upgrades));
  } catch (e) { /* ignore */ }
}

/* 获取某项升级的当前等级 */
export function getUpgradeLevel(upgrades, itemId) {
  return upgrades[itemId] || 0;
}

/* 购买升级：返回 { success, cost, goldLeft } */
export function purchaseUpgrade(upgrades, gold, itemId) {
  const item = SHOP_ITEMS.find(i => i.id === itemId);
  if (!item) return { success: false, error: '道具不存在' };
  const lv = getUpgradeLevel(upgrades, itemId);
  if (lv >= item.max) return { success: false, error: '已满级' };
  const cost = item.cost[lv];
  if (gold < cost) return { success: false, error: '金币不足' };
  upgrades[itemId] = lv + 1;
  saveShopUpgrades(upgrades);
  try {
    const stats = JSON.parse(localStorage.getItem('niuma_stats') || '{}');
    stats.shopPurchases = (stats.shopPurchases || 0) + 1;
    localStorage.setItem('niuma_stats', JSON.stringify(stats));
  } catch (e) {}
  return { success: true, cost, goldLeft: gold - cost };
}

/* 计算升级效果汇总（给 newGame 用） */
export function computeUpgrades(upgrades) {
  const r = {
    hpBonus: 0, spdBonus: 0, chooseWeapon: false,
    startLevel: 0, startItems: 0, extraCard: false,
    dmgBonus: 0, fireRateBonus: 0, startShield: 0, xpBonus: 0,
  };
  for (const item of SHOP_ITEMS) {
    const lv = getUpgradeLevel(upgrades, item.id);
    if (lv <= 0) continue;
    switch (item.effect) {
      case 'hpBonus': r.hpBonus += item.perLevel * lv; break;
      case 'spdBonus': r.spdBonus += item.perLevel * lv; break;
      case 'chooseWeapon': r.chooseWeapon = true; break;
      case 'startLevel': r.startLevel += item.perLevel * lv; break;
      case 'startItems': r.startItems += item.perLevel * lv; break;
      case 'extraCard': r.extraCard = true; break;
      case 'dmgBonus': r.dmgBonus += item.perLevel * lv; break;
      case 'fireRateBonus': r.fireRateBonus += item.perLevel * lv; break;
      case 'startShield': r.startShield += item.perLevel * lv; break;
      case 'xpBonus': r.xpBonus += item.perLevel * lv; break;
    }
  }
  return r;
}
