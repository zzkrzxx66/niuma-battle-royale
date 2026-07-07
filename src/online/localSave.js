import { loadShopUpgrades, saveShopUpgrades } from '../game/data/shop.js';
import { loadAchievements, saveAchievements, loadStats, saveStats } from '../game/data/achievements.js';
import { loadDex, saveDex } from '../game/data/dex.js';

const getJson = (key, fallback = null) => {
  try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch (e) { return fallback; }
};
const setJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
};
const getInt = key => {
  try { return parseInt(localStorage.getItem(key) || '0', 10) || 0; } catch (e) { return 0; }
};
const setInt = (key, v) => {
  try { localStorage.setItem(key, String(Math.max(0, Math.floor(v || 0)))); } catch (e) {}
};

export function loadLocalSaveBundle() {
  return {
    version: 1,
    gold: getInt('niuma_gold'),
    shopUpgrades: loadShopUpgrades(),
    achievements: loadAchievements(),
    stats: loadStats(),
    dex: loadDex(),
    best: {
      classic: getJson('niuma_best', null),
      endlessWave: getInt('niuma_endless_best'),
    },
    settings: {
      trial: getInt('niuma_trial') || 3,
      chosenWeapon: localStorage.getItem('niuma_chosen_weapon') || '',
      fireMode: getInt('niuma_firemode'),
    },
    localUpdatedAt: localStorage.getItem('niuma_local_updated_at') || null,
  };
}

export function applyLocalSaveBundle(data = {}) {
  if (!data || typeof data !== 'object') return;
  if (Number.isFinite(data.gold)) setInt('niuma_gold', data.gold);
  if (data.shopUpgrades) saveShopUpgrades(data.shopUpgrades);
  if (data.achievements) saveAchievements(data.achievements);
  if (data.stats) saveStats(data.stats);
  if (data.dex) saveDex(data.dex);
  if (data.best?.classic) setJson('niuma_best', data.best.classic);
  if (Number.isFinite(data.best?.endlessWave)) setInt('niuma_endless_best', data.best.endlessWave);
  if (data.settings) {
    if (Number.isFinite(data.settings.trial)) setInt('niuma_trial', data.settings.trial);
    if (typeof data.settings.chosenWeapon === 'string') localStorage.setItem('niuma_chosen_weapon', data.settings.chosenWeapon);
    if (Number.isFinite(data.settings.fireMode)) setInt('niuma_firemode', data.settings.fireMode);
  }
  touchLocalSave();
}

export function touchLocalSave() {
  try { localStorage.setItem('niuma_local_updated_at', new Date().toISOString()); } catch (e) {}
}

export function loadPendingScores() { return getJson('niuma_pending_scores', []); }
export function savePendingScores(v) { setJson('niuma_pending_scores', Array.isArray(v) ? v.slice(-20) : []); }
export function queuePendingScore(score) {
  const q = loadPendingScores();
  q.push({ ...score, queuedAt: new Date().toISOString() });
  savePendingScores(q);
}
