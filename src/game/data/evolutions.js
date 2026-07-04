/* =====================================================================
 * 觉醒配方：技能满级 + 指定搭档（副武器/主动/另一个技能）融合成质变效果
 * 参考游戏已有的主武器融合系统(RECIPES/LEGENDS)的设计语言。
 * 触发判定统一收敛在 core.js 的 pickLevelChoice() 末尾调用 checkEvolutions()，
 * 效果实现遵循"专属具名 mods 字段 + 运行时读取"模式，不建通用状态机框架。
 * ===================================================================== */
export const EVOLUTIONS = [
  {
    id: 'evo_blame_furnace', name: '无限连坐熔炉', persona: 'optimizer',
    needSkillId: 'blame_reflect', needSkillLv: 1,
    needPartnerType: 'skill', needPartnerId: 'circuit_breaker', needPartnerLv: 1,
    recipe: '甩锅式反伤(紫满级) + 熔断机制(蓝满级)',
    desc: '甩锅式反伤触发概率从40%提升到80%，敌人围得越多反而越安全',
  },
  {
    id: 'evo_dismissal_committee', name: '永续裁员委员会', persona: 'optimizer',
    needSkillId: 'bottom_elimination', needSkillLv: 1,
    needPartnerType: 'active', needPartnerId: 'linked_fate',
    recipe: '末位淘汰制(紫满级) + 花名册点对点连坐',
    desc: '花名册连坐质变为全场排序锁链，末位淘汰沿链殉爆，技能期内+15%移速+10%全伤害',
  },
  {
    id: 'evo_online_offline', name: '在线但心已离职', persona: 'slacker',
    needSkillId: 'perpetual_slack', needSkillLv: 1,
    needPartnerType: 'active', needPartnerId: 'temp_offline',
    recipe: '永动摸鱼引擎(橙满级) + 临时下线',
    desc: '高铁摸鱼触发时附带完整临时下线效果，每次命中弹射叠永久攻击力（上限15层）',
  },
  {
    id: 'evo_pretend_not_seen', name: '被优化了但我假装没看见', persona: 'slacker',
    needSkillId: 'fake_diligence', needSkillLv: 1,
    needPartnerType: 'sub', needPartnerId: 'online_badge',
    recipe: '假勤奋真怠工(紫满级) + 在线状态徽章',
    desc: '业绩展示触发条件从8秒降到5秒，爆发后2秒内35%概率无视伤害',
  },
];
