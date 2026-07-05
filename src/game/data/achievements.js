/* v4.0 成就系统 */
export const ACHIEVEMENTS = [
  { id: 'first_game', name: '初入职场', desc: '完成任意一局', reward: 20 },
  { id: 'kill_50', name: '裁员新星', desc: '累计击杀 50 个敌人', reward: 30 },
  { id: 'kill_300', name: '裁员风暴', desc: '累计击杀 300 个敌人', reward: 80 },
  { id: 'boss_killer', name: '老板克星', desc: '击败一次 Boss', reward: 80 },
  { id: 'fuse_once', name: '融合专家', desc: '完成一次传说融合', reward: 60 },
  { id: 'endless_10', name: '无尽打工人', desc: '无尽模式达到第 10 波', reward: 100 },
  { id: 'endless_20', name: '永不下班', desc: '无尽模式达到第 20 波', reward: 200 },
  { id: 'gold_500', name: '金币搬砖工', desc: '累计获得 500 金币', reward: 100 },
  { id: 'level_15', name: '职级跃迁', desc: '单局达到 Lv.15', reward: 60 },
  { id: 'shop_first', name: '福利领取', desc: '购买任意商城升级', reward: 30 },
];

export function loadAchievements() {
  try { return JSON.parse(localStorage.getItem('niuma_achievements') || '{}'); } catch (e) { return {}; }
}
export function saveAchievements(v) {
  try { localStorage.setItem('niuma_achievements', JSON.stringify(v)); } catch (e) {}
}
export function loadStats() {
  try { return JSON.parse(localStorage.getItem('niuma_stats') || '{}'); } catch (e) { return {}; }
}
export function saveStats(v) {
  try { localStorage.setItem('niuma_stats', JSON.stringify(v)); } catch (e) {}
}
export function addStat(key, n = 1) {
  const s = loadStats(); s[key] = (s[key] || 0) + n; saveStats(s); return s[key];
}
export function setStatMax(key, v) {
  const s = loadStats(); s[key] = Math.max(s[key] || 0, v); saveStats(s); return s[key];
}
