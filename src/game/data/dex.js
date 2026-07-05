import { WEAPONS, LEGENDS } from './weapons.js';
import { MOBS } from './mobs.js';
import { CONSUMABLES } from './consumables.js';

export const DEX_SECTIONS = [
  { id: 'weapons', name: 'AI武器', source: WEAPONS },
  { id: 'legends', name: '传说融合', source: LEGENDS },
  { id: 'mobs', name: '怪物', source: MOBS },
  { id: 'items', name: '道具', source: CONSUMABLES },
];

export function loadDex() {
  try { return JSON.parse(localStorage.getItem('niuma_dex') || '{}'); } catch (e) { return {}; }
}
export function saveDex(v) {
  try { localStorage.setItem('niuma_dex', JSON.stringify(v)); } catch (e) {}
}
export function discoverDex(section, id) {
  const d = loadDex();
  if (!d[section]) d[section] = {};
  if (d[section][id]) return false;
  d[section][id] = 1;
  saveDex(d);
  return true;
}
export function sectionProgress(section) {
  const sec = DEX_SECTIONS.find(s => s.id === section);
  if (!sec) return { got: 0, total: 0 };
  const d = loadDex()[section] || {};
  return { got: Object.keys(d).length, total: Object.keys(sec.source).length };
}
