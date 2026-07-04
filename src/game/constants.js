/* 视口与全局平衡数值 */
export const VIEW_W = 640;
export const VIEW_H = 360;

export const TUNE = {
  playerHp: 100, playerSpeed: 130,
  botCount: 19, botHp: 80,
  world: 2200, zoneR0: 1050, shrinkDur: 30,
  zonePhases: [
    { at: 60,  pct: .70, dps: 4 },
    { at: 150, pct: .45, dps: 9 },
    { at: 240, pct: .25, dps: 16 },
    { at: 330, pct: .12, dps: 28 },
    { at: 420, pct: .05, dps: 48 },
  ],
  xpPerKill: 12,
  levelNeed: lvl => Math.round(10 * Math.pow(1.26, lvl)),   // 1.22→1.26，配合试用期折扣加深放慢试用期升级节奏
  bossHp: 1500,          // 上限参考值；实际按登场时机与玩家等级插值，见 spawnBoss
  bossAt: 360,           // 插值基准；实际触发见 endChecks（t>=300 或存活<=3）
  /* 试用期月度时长：三段式结构（爆发/涓流/考核），考核秒数固定给足现有17秒击杀窗口+缓冲，
   * 爆发/涓流用减法瓜分剩余时间，保证逐月精确相加=trialWaveT，不再是近似百分比。见设计文档第1.1/1.2节 */
  trialWaveT: month => 60 + 10 * (month - 1),
  trialExamT: month => 18 + (month - 1),
};
