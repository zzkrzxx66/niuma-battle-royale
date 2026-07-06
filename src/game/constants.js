/* 视口与全局平衡数值 */
export const VIEW_W = 640;
export const VIEW_H = 360;

export const TUNE = {
  playerHp: 100, playerSpeed: 130,
  botCount: 19, botHp: 80,
  world: 2200, zoneR0: 1050, shrinkDur: 30,
  zonePhases: [
    { at: 90,  pct: .70, dps: 4 },
    { at: 210, pct: .45, dps: 9 },
    { at: 330, pct: .25, dps: 16 },
    { at: 450, pct: .12, dps: 28 },
    { at: 570, pct: .05, dps: 48 },
  ],
  xpPerKill: 12,
  levelNeed: lvl => Math.round(11 * Math.pow(1.27, lvl)),   // v4.1：前期略松、中后期略慢，目标10分钟Lv16-20
  bossHp: 1500,          // 上限参考值；实际按登场时机与玩家等级插值，见 spawnBoss
  bossAt: 420,           // v4.1：Boss基准与触发延后到7分钟左右
  /* 试用期月度时长：三段式结构（爆发/涓流/考核），考核秒数固定给足现有17秒击杀窗口+缓冲，
   * 爆发/涓流用减法瓜分剩余时间，保证逐月精确相加=trialWaveT，不再是近似百分比。见设计文档第1.1/1.2节 */
  trialWaveT: month => 60 + 10 * (month - 1),
  trialExamT: month => 18 + (month - 1),
};
