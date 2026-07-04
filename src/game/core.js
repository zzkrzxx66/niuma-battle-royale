/* =====================================================================
 * 游戏引擎核心：对局状态 / 单位 / 武器 / 战斗 / AI / 缩圈 / Boss / 野怪 / 拾取
 * 不直接操作 DOM —— 一切 UI 通过 bridge 事件与版本号通知 React
 * ===================================================================== */
import { TUNE } from './constants.js';
import { rand, randi, pick, clamp, lerp, dist, dist2, shuffle, distToSeg } from './utils.js';
import { WEAPONS, LEGENDS, findRecipe, recipePartner, wdef } from './data/weapons.js';
import { SKILLS } from './data/skills.js';
import { CONSUMABLES } from './data/consumables.js';
import { TECH, PLAYER_ONLY_TECH, TECH_TIERS, DISTILLS, CURSES, ELITES, ELITE_T1, ELITE_T2 } from './data/tech.js';
import { MOBS, waveComp } from './data/mobs.js';
import { SUBS, MAX_SUB_SLOTS } from './data/subweapons.js';
import { ACTIVES } from './data/actives.js';
import { EVOLUTIONS } from './data/evolutions.js';
import { COPY } from './data/copy.js';
import { SHOP_ITEMS, loadShopUpgrades, purchaseUpgrade, computeUpgrades } from './data/shop.js';
import { SPR, workerSprite, SHIRT_COLORS } from './sprites.js';
import { SFX, beep, later, cancelPendingSfx, initAudio } from './audio.js';
import { BGM } from './bgm.js';
import { keys, mouse, touch, handlers } from './input.js';
import * as bridge from './bridge.js';

/* ---------- 对外状态 ---------- */
export let G = null;
let state = 'menu';   // menu | playing | levelup | paused | dead | win
const loadedAt = Date.now();   // 防止页面加载瞬间的意外/合成 keydown 被误判成"按回车开局"
export const getG = () => G;
export const getState = () => state;
function setState(s) {
  const prev = state;
  state = s;
  if (s !== 'playing') cancelPendingSfx();   // 暂停/结算时掐掉尚未播出的延时音符
  BGM.onStateChange(s, prev, G);
  bridge.notify();
}

export const cam = { x: 0, y: 0, shake: 0 };
export function addShake(v) { cam.shake = Math.min(8, cam.shake + v); }

/* ---------- 开火模式（桌面）：手动 / 自动开火 / 全托管 ——触控板玩家友好 ---------- */
export const FIRE_MODES = ['手动', '自动开火', '全托管'];
let fireMode = 0;
try { fireMode = parseInt(localStorage.getItem('niuma_firemode') || '0', 10) || 0; } catch (e) { /* ignore */ }
export const getFireMode = () => fireMode;
export function cycleFireMode() {
  fireMode = (fireMode + 1) % 3;
  try { localStorage.setItem('niuma_firemode', String(fireMode)); } catch (e) { /* ignore */ }
  if (G && G.player.alive) addFloat(G.player.x, G.player.y - 22, `开火模式：${FIRE_MODES[fireMode]}`, '#ffcf33', 9, 1.3);
  bridge.notify();
}

function addFeed(text, hl) { bridge.emit('feed', { text, hl }); }
function warn(text) { bridge.emit('warn', text); }

export function addFloat(x, y, text, color, size = 7, life = .8) {
  if (G) G.floats.push({ x, y, text, color, size, life, t: 0 });
}
export function addParts(x, y, color, n, spd = 60, life = .5) {
  if (!G) return;
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), s = rand(spd * .3, spd);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, color, life: rand(life * .5, life), t: 0, size: rand(1, 2.4) });
  }
}
export function addFx(fx) { if (G) { fx.t = 0; G.fx.push(fx); } }

/* ---------- 单位 ---------- */
function defaultMods() {
  return { spd: 1, dmg: 1, dmgTaken: 1, fireRate: 1, xp: 1, bulletSpd: 1, pierce: 0,
    dodge: 0, killHeal: 0, standRegen: 0, auraDmg: 0, aggro: 1, itemBoost: 1,
    xpPerSec: 0, dropChance: 0, dashCd: 0, lowHpSpd: 0, revive: 0, levelHp: 0, maxHpAdd: 0,
    multishot: 0, crit: 0, homing: 0, range: 1, rag: 0, sysPrompt: 0,
    echoMult: 1, ragBoost: 1,
    /* 人设四·首席降本增效官 */
    workplacePolitics: 0, slowPower: 0, stunPunish: 0, stunSpread: 0, kpiPerLayer: 0,
    fuseBreak: false, blameReflect: false, blameReflectPct: .4, bottomCut: false, assemblyNuke: false,
    /* 人设五·摸鱼表演艺术家 */
    onlineResponse: 0, fakeBusy: 0, dodgeBoost: 0, uptimeCertRate: 0, neverOffline: false,
    fakeDiligence: false, fakeDiligencePct: .35, perpetualSlack: false, perpetualSlackTier: 50,
    /* 觉醒专属标记位 */
    __evoDismissalChain: false, __evoOnlineOffline: false, __evoFakeDiligenceUpgrade: false };
}

/* "牛马"判定：参与大逃杀名次的普通打工人（试用期 PVP 锁定的保护对象） */
const isWorker = u => u && !u.isBoss && !u.isHR && !u.isElite && !u.isMob;

/* 阵营判定：策反盟友、野怪互不为敌 */
export function isFoe(a, b) {
  if (!a || !b || a === b || !b.alive) return false;
  if (a.allyOwner === b || b.allyOwner === a) return false;
  if (a.allyOwner && a.allyOwner === b.allyOwner) return false;
  if (a.isElite && b.isElite) return false;
  return true;
}

function makeUnit(name, x, y, opts = {}) {
  const shirt = opts.shirt || pick(SHIRT_COLORS);
  return {
    name, x, y, r: 5,
    isPlayer: !!opts.isPlayer, isBoss: !!opts.isBoss, isHR: !!opts.isHR,
    hpBase: opts.hp || TUNE.botHp, hp: opts.hp || TUNE.botHp,
    spdBase: opts.spd || TUNE.playerSpeed * rand(.92, 1.02),
    shirt, spr: opts.isBoss ? SPR.boss : workerSprite(shirt),
    face: 1, walkT: 0, aim: 0,
    weapon: { id: opts.weaponId || 'chatgpt', lvl: 1, leg: null, cd: 0,
      charge: 0, charging: false, pillarT: 3, droneAng: rand(0, 6), droneCds: [0, 0, 0, 0] },
    mods: defaultMods(), skills: {},
    xp: 0, level: 1, kills: 0,
    alive: true, hurtT: 0, standT: 0, stunT: 0, invulnT: 0,
    shield: 0, shieldT: 0, auraT: 0,
    buffs: { spdT: 0, spdM: 1, fireT: 0, fireM: 1, dmgT: 0, dmgM: 1 },
    dashT: 0, dashVx: 0, dashVy: 0, dashDur: 0,
    beamFiring: false, lastAtk: null, isMoving: false, moveT: 0, idleT: 0,
    curses: { hallu: 0, overfit: 0, repeat: 0, overflow: 0 }, repeatAim: 0,
    tech: {}, ragAng: rand(0, 6), ragCds: [0, 0], sysT: 0,
    allyOwner: null, allyUntil: 0, vulnT: 0, vulnBonus: 0,
    /* 人设四·首席降本增效官 运行时状态 */
    politicsT: 0, politicsDmg: 0, politicsOwner: null, fuseBreakCd: 0, bottomCutT: 0, bottomCutMark: 0,
    meetingPoints: 0, assemblyT: 0, kpiLayers: 0, kpiLayerT: 0,
    /* 副武器专属延迟结算（任意单位都可能被命中，字段放在通用 tick 里处理） */
    oaSlowT: 0, oaBurstT: 0, oaBurstDmg: 0, oaBurstOwner: null, badgeMarkT: 0, badgeMarkOwner: null,
    linkedTo: null, linkedT: 0, lastDealT: -999,
    /* 人设五·摸鱼表演艺术家 运行时状态 */
    noHitT: 0, slackMiles: 0, slackBurstT: 0, slackTickT: 0, ignoreDmgT: 0,
    distills: null, dstT: null,                         // 大模型蒸馏
    subs: {}, active: null, activeCd: 0,                // 副武器槽 / 主动技能（玩家专属）
    isSummon: false, summonType: null, sumT: 2,         // AI 替身（蒸馏召唤物）
    isMob: false, mobType: null, mobHitT: 0, mobTarget: null, isSplitChild: false,   // 试用期杂鱼
    isElite: false, eliteType: null, eliteTier: 0, touchT: 0, injT: 1,
    empowerT: 0, reportedT: 0,                          // 向上管理光环 / 被打小报告
    slideT: 1, coneWarnT: 0, coneAng: 0, coneCd: 5,     // PPT 大师
    pokeT: 1, auraTickT: 0, reportT: 4,                 // 向上管理 / 小报告
    bot: opts.bot || null, bossAI: null,
  };
}
export const maxHp = u => Math.max(20, u.hpBase + u.mods.maxHpAdd);
export const wpnDmg = u => {
  const def = wdef(u);
  const grow = def.kind === 'drone' ? 1.15 : 1.3;   // 僚机靠数量成长
  const lvlMult = u.weapon.leg ? 1 : Math.pow(grow, u.weapon.lvl - 1);
  const empower = u.empowerT > 0 ? 1.25 : 1;        // 向上管理光环
  return def.dmg * lvlMult * u.mods.dmg * empower;
};
export const droneCount = (u, def) =>
  def.kind === 'drone' ? Math.min(3, def.drones + Math.floor((u.weapon.lvl - 1) / 2)) : def.drones;
export const wpnName = u => u.weapon.leg ? LEGENDS[u.weapon.leg].name : `${WEAPONS[u.weapon.id].name} Lv.${u.weapon.lvl}`;
export const fireRateOf = u => {
  const f = u.mods.fireRate * (u.buffs.fireT > 0 ? u.buffs.fireM : 1) * (u.curses.overflow > 0 ? .55 : 1);
  return f <= 2 ? f : 2 + Math.sqrt(f - 2) * .6;   // 软上限：射速不再是唯一无限乘区
};
export const speedOf = u => {
  let s = u.spdBase * u.mods.spd * (u.buffs.spdT > 0 ? u.buffs.spdM : 1);
  if (u.mods.lowHpSpd && u.hp < maxHp(u) * .3) s *= 1 + u.mods.lowHpSpd;
  if (u.beamFiring) s *= .5;
  if (u.curses.overfit > 0) s *= .6;
  if (u.empowerT > 0) s *= 1.15;
  if (u.reviewBoostT > 0) s *= 1.15;   // 需求评审会光环
  if (u.oaSlowT > 0) s *= .6;          // OA审批流公文包
  let slow = 1;
  for (const bz of G.burns) if (isFoe(bz.owner, u) && dist2(u.x, u.y, bz.x, bz.y) < bz.r * bz.r) slow = Math.min(slow, 1 - bz.slow);
  return s * slow;
};

/* ---------- 对局创建 ---------- */
function newGame(trialMonths = 0, mode = 'battle') {
  const W = TUNE.world;
  const g = {
    mode,  /* 'battle' | 'endless' */
    endlessWave: 0, endlessWaveT: 30, endlessBurstLeft: 0, endlessMobsAlive: 0,
    goldEarned: 0,
    /* 试用期：每月 30 秒一波杂鱼 + 一个月度考核小 Boss；期间同事互相无敌 */
    trial: { months: trialMonths, active: trialMonths > 0, wave: 0, waveT: .01, bossThisWave: true,
      bossOrder: shuffle(['ppt', 'meeting', 'intern', 'attendance']), cdWarned: false },   // 考核池只含无需同事在场的四位
    trialOffset: Array.from({ length: trialMonths }, (_, i) => TUNE.trialWaveT(i + 1)).reduce((a, b) => a + b, 0),
    /* 割草流清场快：试用期越长，转正后的缩圈时间轴按比例前移 */
    zonePhases: TUNE.zonePhases.map(p => ({ ...p, at: Math.round(p.at * (1 - trialMonths * .06)) })),
    trialXpEarned: 0, rerollCredits: 0, dryDrafts: 0,
    t: 0, endT: 0, units: [], projs: [], pickups: [], floats: [], parts: [], fx: [], burns: [],
    obstacles: [], decor: [],
    zone: { cx: W / 2, cy: W / 2, r: TUNE.zoneR0, phase: 0, shrinking: false,
      fromR: 0, toR: 0, fromCx: 0, fromCy: 0, toCx: 0, toCy: 0, shrinkT: 0, dps: 1 },
    kills: 0, playerRank: 0, bossSpawned: false, bossDead: false, boss: null, turrets: [],
    chipT: 15, itemT: 12, techT: 20, eliteT: 35, minibossT: 95, pendingLevels: 0, hoverChip: null,
    pityChipDone: false, pityT: 2, deathInfo: null, newBest: false,
    deathLine: '', winLine: '', freezeT: 0, streak: 0, lastKillT: undefined, heartT: 0,
  };

  /* 办公家具 */
  const rects = [];
  for (let i = 0; i < 72; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const x = rand(120, W - 172), y = rand(120, W - 160);
      if (dist2(x, y, W / 2, W / 2) < 190 * 190) continue;
      if (rects.some(r => Math.abs(r.x - x) < 110 && Math.abs(r.y - y) < 80)) continue;
      rects.push({ x, y });
      g.obstacles.push({ x: x + 2, y: y + 18, w: 48, h: 12, sx: x, sy: y, spr: 'desk' });
      break;
    }
  }
  for (let i = 0; i < 48; i++) {
    const x = rand(60, W - 80), y = rand(60, W - 80);
    if (dist2(x, y, W / 2, W / 2) < 160 * 160) continue;
    g.decor.push({ x, y, spr: Math.random() < .6 ? 'plant' : 'cooler' });
  }

  /* 玩家 + 机器人牛马 */
  const wIds = Object.keys(WEAPONS);
  const pa = rand(0, Math.PI * 2);
  const player = makeUnit('你（牛马本马）', W / 2 + Math.cos(pa) * 350, W / 2 + Math.sin(pa) * 350,
    { isPlayer: true, hp: TUNE.playerHp, spd: TUNE.playerSpeed, weaponId: pick(wIds), shirt: '#ffcf33' });
  player.subSlotCount = MAX_SUB_SLOTS;   // 里程碑事件解锁到4，见 unlockSubSlot()
  g.units.push(player);
  g.player = player;

  const names = shuffle(COPY.botNames).slice(0, TUNE.botCount);
  const persPool = shuffle([...Array(6).fill('juan'), ...Array(9).fill('norm'), ...Array(4).fill('moyu')]);
  if (trialMonths > 0) {
    /* 试用期：同事还没到岗（转正日空降入场，届时按月数补发育） */
    g.latentBots = names.map((n, i) => ({ name: n, pers: persPool[i % persPool.length] }));
  } else {
    g.latentBots = null;
    for (let i = 0; i < TUNE.botCount; i++) {
      let bx = W / 2, by = W / 2;
      for (let tries = 0; tries < 30; tries++) {
        const a = rand(0, Math.PI * 2), rr = rand(250, TUNE.zoneR0 * .85);
        bx = W / 2 + Math.cos(a) * rr; by = W / 2 + Math.sin(a) * rr;
        if (g.units.every(u => dist2(u.x, u.y, bx, by) > 260 * 260)) break;
      }
      const pers = persPool[i % persPool.length];
      g.units.push(makeUnit(names[i], bx, by, { weaponId: pick(wIds), bot: {
        pers, state: 'wander', wx: bx, wy: by, target: null, decideT: rand(0, .3),
        aimErr: pers === 'juan' ? .07 : pers === 'norm' ? .13 : .2,
        chargeHold: 0, provokedT: 0, strafe: 1,
      } }));
    }
  }

  /* 初始芯片：按武器数量自适应，保证每种至少 ~2 个 */
  const chipCount = Math.max(26, Object.keys(WEAPONS).length * 2);
  for (let i = 0; i < chipCount; i++) spawnChip(g, pick(wIds), 1);
  for (let i = 0; i < 16; i++) spawnItem(g);
  for (let i = 0; i < 6; i++) spawnTech(g, pickTechId());
  return g;
}
function randPosInZone(g, margin = .88) {
  for (let tries = 0; tries < 30; tries++) {
    const a = rand(0, Math.PI * 2), rr = Math.sqrt(Math.random()) * g.zone.r * margin;
    const x = g.zone.cx + Math.cos(a) * rr, y = g.zone.cy + Math.sin(a) * rr;
    if (x > 40 && y > 40 && x < TUNE.world - 40 && y < TUNE.world - 40 &&
        !g.obstacles.some(o => x > o.x - 14 && x < o.x + o.w + 14 && y > o.y - 14 && y < o.y + o.h + 14)) return { x, y };
  }
  return { x: g.zone.cx, y: g.zone.cy };
}
function spawnChip(g, id, lvl, x, y) {
  if (x === undefined) ({ x, y } = randPosInZone(g));
  g.pickups.push({ type: 'chip', id, lvl, x, y, bob: rand(0, 6) });
}
function spawnItem(g, id, x, y) {
  if (x === undefined) ({ x, y } = randPosInZone(g));
  g.pickups.push({ type: 'item', id: id || pick(Object.keys(CONSUMABLES)), x, y, bob: rand(0, 6) });
}
function spawnXp(g, x, y, amt) {
  g.pickups.push({ type: 'xp', amt, x: x + rand(-8, 8), y: y + rand(-8, 8), bob: rand(0, 6) });
}
/* 随机选一个模组 id（蒸馏为稀有权重） */
function pickTechId() {
  if (Math.random() < .08) return 'distill';
  return pick(Object.keys(TECH).filter(k => k !== 'distill'));
}
/* 品级掉落：标准 60% / Pro 30% / Ultra 10%；elite=true 时上偏（35/40/25） */
function rollTier(elite) {
  const r = Math.random();
  if (elite) return r < .35 ? 1 : r < .75 ? 2 : 3;
  return r < .6 ? 1 : r < .9 ? 2 : 3;
}
function spawnTech(g, id, x, y, tier) {
  if (x === undefined) ({ x, y } = randPosInZone(g));
  g.pickups.push({ type: 'tech', id, tier: tier || rollTier(false), x, y, bob: rand(0, 6) });
}

/* ---------- 开火 ---------- */
export function nearestUnit(x, y, range, filter) {
  let best = null, bd = range * range;
  for (const t of G.units) {
    if (!filter(t)) continue;
    const d = dist2(x, y, t.x, t.y);
    if (d < bd) { bd = d; best = t; }
  }
  return best;
}
function nearPlayer(x, y) {
  return G.player.alive && dist2(x, y, G.player.x, G.player.y) < 300 * 300;
}

function spawnBullet(u, a, opt = {}) {
  const def = wdef(u);
  const spd = (opt.spd || def.spd || 300) * u.mods.bulletSpd;
  G.projs.push({
    x: opt.x !== undefined ? opt.x : u.x, y: opt.y !== undefined ? opt.y : u.y - 4,
    vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, spd,
    dmg: opt.dmg !== undefined ? opt.dmg : wpnDmg(u),
    r: opt.r || 2, pierce: (opt.pierce !== undefined ? opt.pierce : (def.pierce || 0)) + u.mods.pierce,
    hit: new Set(), owner: u,
    color: opt.color || def.color, shape: opt.shape || 'dot',
    dist: 0, maxDist: opt.exact ? opt.range : (opt.range || def.range || 250) * u.mods.range,
    homing: (opt.homing || 0) + u.mods.homing, boom: opt.boom || null,
    boomerang: opt.boomerang || null, zap: opt.zap || null, zapT: 0,
    stun: opt.stun || 0, fromBoss: !!u.isBoss, curse: opt.curse || null,
    onHitMark: opt.onHitMark || null,
  });
  /* 少样本提示：并排复制弹道（复制弹伤害按品级折损，防终盘乘算失控） */
  if (u.mods.multishot && !opt._echo) {
    const px = Math.cos(a + Math.PI / 2), py = Math.sin(a + Math.PI / 2);
    const echoDmg = (opt.dmg !== undefined ? opt.dmg : wpnDmg(u)) * u.mods.echoMult;
    for (let i = 1; i <= u.mods.multishot; i++) {
      const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 7;
      spawnBullet(u, a, { ...opt, _echo: true, dmg: echoDmg,
        /* 爆炸/放电也要按品级折损——引用共享曾让复制弹的 AoE 全额泄漏 */
        boom: opt.boom ? { ...opt.boom, dmg: opt.boom.dmg * u.mods.echoMult,
          burn: opt.boom.burn ? { ...opt.boom.burn, dps: opt.boom.burn.dps * u.mods.echoMult } : null } : null,
        zap: opt.zap ? { ...opt.zap, dmg: opt.zap.dmg * u.mods.echoMult } : null,
        boomerang: opt.boomerang ? { ...opt.boomerang } : null,
        x: (opt.x !== undefined ? opt.x : u.x) + px * off,
        y: (opt.y !== undefined ? opt.y : u.y - 4) + py * off });
    }
  }
}
function fireBeam(u, a, len, width, dmg, color) {
  const x2 = u.x + Math.cos(a) * len * u.mods.range, y2 = u.y + Math.sin(a) * len * u.mods.range;
  addFx({ type: 'beam', x1: u.x, y1: u.y - 4, x2, y2, w: width, color, life: .18 });
  for (const t of G.units) {
    if (!isFoe(u, t)) continue;
    if (distToSeg(t.x, t.y, u.x, u.y, x2, y2) < width / 2 + t.r) applyDamage(t, dmg, u);
  }
}
function chainZap(u, sx, sy, firstTarget, count, dmg, decay, stun = 0) {
  const hitSet = new Set([u]);
  const pts = [{ x: sx, y: sy }];
  let cur = firstTarget, cx = sx, cy = sy, d = dmg;
  for (let i = 0; i <= count && cur; i++) {
    pts.push({ x: cur.x, y: cur.y });
    applyDamage(cur, d, u, { stun });
    hitSet.add(cur);
    d *= decay;
    cx = cur.x; cy = cur.y;
    cur = nearestUnit(cx, cy, 140, t => !hitSet.has(t) && isFoe(u, t));
  }
  if (pts.length > 1) addFx({ type: 'bolt', pts, color: '#bfe6ff', life: .22 });
}

function updateWeapon(u, dt, wantFire, aimA) {
  const w = u.weapon, def = wdef(u);
  w.cd -= dt * fireRateOf(u);
  u.aim = aimA;
  u.beamFiring = false;
  if (u.stunT > 0) return;
  const kind = def.kind;

  /* 环绕僚机：常驻自动索敌 */
  if (kind === 'drone' || kind === 'leg_drone') {
    const n = droneCount(u, def);
    w.droneAng += dt * 2;
    for (let i = 0; i < n; i++) {
      w.droneCds[i] -= dt * fireRateOf(u);
      const da = w.droneAng + i * Math.PI * 2 / n;
      const dx = u.x + Math.cos(da) * 20, dy = u.y - 6 + Math.sin(da) * 20;
      if (w.droneCds[i] <= 0) {
        const t = nearestUnit(dx, dy, def.range, o => isFoe(u, o));
        if (t) {
          w.droneCds[i] = (kind === 'drone' ? .8 : .85);
          /* 非玩家持有的自瞄炮台加散布，治「零误差自瞄秒杀玩家」 */
          spawnBullet(u, Math.atan2(t.y - dy, t.x - dx) + (u.isPlayer ? 0 : rand(-.12, .12)),
            { x: dx, y: dy, dmg: wpnDmg(u), spd: def.spd, range: def.range * 1.3,
              color: def.color, shape: kind === 'leg_drone' ? 'streak' : 'dot',
              pierce: kind === 'leg_drone' ? 2 : 0 });
          if (u.isPlayer) SFX.shoot();
        }
      }
    }
    if (kind === 'leg_drone' && wantFire && w.cd <= 0) {   // 齐射
      w.cd = def.cd;
      for (let i = 0; i < n; i++) {
        const da = w.droneAng + i * Math.PI * 2 / n;
        spawnBullet(u, aimA + rand(-.05, .05),
          { x: u.x + Math.cos(da) * 20, y: u.y - 6 + Math.sin(da) * 20,
            dmg: def.volleyDmg * u.mods.dmg, spd: 420, range: 260, color: '#ffd9a8', shape: 'streak', pierce: 3, r: 3 });
      }
      if (u.isPlayer) SFX.laser();
    }
    return;   // 僚机类本体不走通用开火
  }

  /* 画饼齐射队列（游戏时间驱动） */
  if (kind === 'leg_pie' && w.burst > 0) {
    w.burstT -= dt;
    if (w.burstT <= 0) {
      w.burstT = .13;
      w.burst--;
      spawnBullet(u, u.aim + rand(-.08, .08), { shape: 'bigpie', r: 5, range: def.range * rand(.7, 1),
        dmg: 0, boom: { r: def.boomR, dmg: def.dmg * u.mods.dmg,
          burn: { r: def.burnR, dps: def.burnDps, slow: .35, t: def.burnT } } });
    }
  }

  /* AGI：天罚激光柱 */
  if (kind === 'leg_agi') {
    w.pillarT -= dt;
    if (w.pillarT <= 0) {
      const t = nearestUnit(u.x, u.y, 300, o => isFoe(u, o));
      if (t) {
        w.pillarT = def.pillarCd;
        addFx({ type: 'pillar', x: t.x, y: t.y, r: def.pillarR, color: '#ffffff', life: .5 });
        explodeAt(t.x, t.y, def.pillarR, def.pillarDmg * u.mods.dmg, u, '#ffffff');
        if (u.isPlayer || nearPlayer(t.x, t.y)) SFX.explo();
      }
    }
  }

  /* Claude 蓄力（吃模组：射速类加快蓄力、注意力加宽光束、少样本扇形多束） */
  if (kind === 'charge') {
    if (wantFire && w.cd <= 0) {
      w.charging = true;
      w.charge = Math.min(def.chargeT, w.charge + dt * fireRateOf(u));
      if (u.isPlayer && Math.random() < dt * 8) addParts(u.x + Math.cos(aimA) * 10, u.y - 4 + Math.sin(aimA) * 10, def.color, 1, 30, .3);
    } else if (w.charging) {
      const p = w.charge / def.chargeT;
      const dmg = lerp(def.dmg, def.dmgMax, p) * Math.pow(1.3, w.lvl - 1) * u.mods.dmg;
      const bw = def.beamW * (0.5 + p * 0.8) * (1 + .25 * (u.tech.attention || 0));
      fireBeam(u, aimA, def.range, bw, dmg, def.color);
      for (let i = 1; i <= u.mods.multishot; i++)
        fireBeam(u, aimA + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * .14, def.range, bw, dmg * u.mods.echoMult, def.color);
      if (u.isPlayer || nearPlayer(u.x, u.y)) SFX.laser();
      w.charging = false; w.charge = 0; w.cd = def.cd;
    }
    return;
  }

  /* 无限上下文：持续双联横扫光束 */
  if (kind === 'leg_beam') {
    if (wantFire && w.cd <= 0) {
      w.cd = def.cd;
      u.beamFiring = true;
      const off = Math.PI / 2;
      for (const side of [-1, 1]) {
        const ox = Math.cos(aimA + off) * 5 * side, oy = Math.sin(aimA + off) * 5 * side;
        const x2 = u.x + ox + Math.cos(aimA) * 800, y2 = u.y + oy + Math.sin(aimA) * 800;
        addFx({ type: 'beam', x1: u.x + ox, y1: u.y - 4 + oy, x2, y2, w: 5, color: def.color, life: .1 });
        for (const t of G.units) {
          if (!isFoe(u, t)) continue;
          if (distToSeg(t.x, t.y, u.x + ox, u.y + oy, x2, y2) < 4 + t.r) applyDamage(t, def.dmg * u.mods.dmg, u);
        }
      }
      if (u.isPlayer && Math.random() < .3) SFX.laser();
    } else if (wantFire) u.beamFiring = true;
    return;
  }

  if (!wantFire || w.cd > 0) return;
  w.cd = def.cd;
  const dmg = wpnDmg(u);

  switch (kind) {
    case 'mg':
      spawnBullet(u, aimA + rand(-def.spread, def.spread), { shape: 'diamond' });
      break;
    case 'sniper':
      spawnBullet(u, aimA, { shape: 'streak', r: 2.5 });
      if (u.isPlayer || nearPlayer(u.x, u.y)) SFX.laser();
      break;
    case 'shotgun': {
      const n = def.count + (w.lvl >= 3 ? 1 : 0) + (w.lvl >= 5 ? 1 : 0);
      for (let i = 0; i < n; i++) spawnBullet(u, aimA + (i / (n - 1) - .5) * def.spread, { shape: 'dot' });
      break;
    }
    case 'lob': {
      /* 射程模组扩大可及距离，但落点必须精确=瞄准点（曾经会"扔过头"） */
      const cap = def.range * u.mods.range;
      let range = cap;
      if (u.isPlayer) {
        const tp = touch.using ? touch.aimTarget : null;
        range = tp ? clamp(dist(u.x, u.y, tp.x, tp.y), 50, cap)
                   : clamp(dist(u.x, u.y, mouse.x + cam.x, mouse.y + cam.y), 50, cap);
      }
      else if (u.bot && u.bot.target) range = clamp(dist(u.x, u.y, u.bot.target.x, u.bot.target.y), 50, cap);
      spawnBullet(u, aimA, { shape: 'pie', r: 4, range, exact: true, boom: { r: def.boomR, dmg }, dmg: 0 });
      break;
    }
    case 'homing':
      spawnBullet(u, aimA, { shape: 'pea', homing: def.homing, r: 2.5 });
      break;
    case 'chain': {
      /* 吃模组：注意力扩索敌半径、越级汇报/思维链多跳、少样本多一条起始分叉 */
      const rng = def.range * u.mods.range * (1 + .12 * (u.tech.attention || 0));
      const chains = def.chains + u.mods.pierce;
      const t = nearestUnit(u.x, u.y, rng, o => isFoe(u, o));
      if (t) {
        chainZap(u, u.x, u.y - 4, t, chains, dmg, def.decay);
        for (let i = 0; i < u.mods.multishot; i++) {
          const t2 = nearestUnit(u.x, u.y, rng, o => isFoe(u, o) && o !== t);
          if (t2) chainZap(u, u.x, u.y - 4, t2, chains, dmg * u.mods.echoMult, def.decay);
        }
        if (u.isPlayer || nearPlayer(u.x, u.y)) SFX.hit();
      } else w.cd = .15;
      break;
    }
    case 'single':
      spawnBullet(u, aimA, { shape: 'orb', r: 2.5 });
      break;
    case 'twin': {
      const off = aimA + Math.PI / 2;
      for (const side of [-1, 1])
        spawnBullet(u, aimA, { x: u.x + Math.cos(off) * 5 * side, y: u.y - 4 + Math.sin(off) * 5 * side, shape: 'star' });
      break;
    }
    case 'gacha': {
      const roll = rand(.5, 3), mode = randi(0, 3);
      const col = pick(['#ff6a8a', '#ffcf33', '#4ec9a0', '#6aa3ff', '#e86ad0']);
      if (mode === 0) spawnBullet(u, aimA, { dmg: dmg * roll * 1.6, r: 3.5, shape: 'orb', color: col });
      else if (mode === 1) for (let i = -1; i <= 1; i++) spawnBullet(u, aimA + i * .22, { dmg: dmg * roll * .6, shape: 'dot', color: col });
      else if (mode === 2) spawnBullet(u, aimA, { dmg: dmg * roll * 1.2, pierce: 3, shape: 'streak', color: col });
      else spawnBullet(u, aimA, { dmg: 0, boom: { r: 30, dmg: dmg * roll * 1.4 }, shape: 'pie', r: 3, color: col });
      break;
    }
    case 'boomerang':
      spawnBullet(u, aimA, { shape: 'boomerang', r: 3.5, range: def.range, boomerang: { phase: 0 }, pierce: 99 });
      break;
    case 'leg_agi':
      spawnBullet(u, aimA + rand(-.15, .15), { shape: 'orb', homing: def.homing, r: 2 });
      break;
    case 'leg_pea':
      for (let i = 0; i < def.count; i++)
        spawnBullet(u, aimA + (i / (def.count - 1) - .5) * def.spread, { shape: 'pea', homing: def.homing, r: 2 });
      break;
    case 'leg_pie':
      w.burst = 3; w.burstT = 0;
      break;
    case 'leg_boom':
      spawnBullet(u, aimA, { shape: 'bigboom', r: 5, range: def.range, boomerang: { phase: 0 }, pierce: 99,
        zap: { cd: def.zapCd, dmg: def.zapDmg * u.mods.dmg, chains: def.chains }, stun: .2 });
      break;
  }
  if (u.isPlayer && !['sniper', 'chain'].includes(kind)) SFX.shoot();
}

/* ---------- 爆炸 / 燃烧区 ---------- */
function explodeAt(x, y, r, dmg, owner, color, burn) {
  addFx({ type: 'boom', x, y, r, color: color || '#ff9440', life: .35 });
  addParts(x, y, color || '#ff9440', 14, 90, .5);
  addShake(3);
  for (const t of G.units) {
    if (!isFoe(owner, t)) continue;
    if (dist2(x, y, t.x, t.y) < (r + t.r) * (r + t.r)) applyDamage(t, dmg, owner);
  }
  if (burn) G.burns.push({ x, y, r: burn.r, dps: burn.dps, slow: burn.slow, life: burn.t, t: 0, owner, color: '#e86ad0' });
  if (nearPlayer(x, y)) SFX.explo();
}

/* ---------- 伤害 / 诅咒 / 击杀 ---------- */
export function applyDamage(target, raw, attacker, opts = {}) {
  if (!target.alive || !G) return;
  if (target.invulnT > 0 && opts.cause !== 'zone') return;   // 画饼护盾挡不住裁员红线
  /* 试用期：同事之间互相无敌（PVE 照常） */
  if (G.trial.active && attacker && isWorker(attacker) && isWorker(target)) return;
  if (target.mods.dodge && opts.cause !== 'zone' && Math.random() < target.mods.dodge) {
    addFloat(target.x, target.y - 14, '甩锅！', '#9aa4b5', 6, .5);
    /* 已读不回学：闪避成功后短暂提速 */
    if (target.isPlayer && target.mods.dodgeBoost) {
      target.buffs.spdT = Math.max(target.buffs.spdT, 1);
      target.buffs.spdM = Math.max(target.buffs.spdM, 1 + target.mods.dodgeBoost);
    }
    return;
  }
  let dmg = raw * target.mods.dmgTaken;
  if (target.vulnT > 0) dmg *= (1.2 + (target.vulnBonus || 0));   // 团建易伤 + 回收站冷静期加成
  /* 牛马内战伤害衰减：机器人互卷是内耗（决赛圈内卷升级，避免僵局） */
  if (attacker && attacker.bot && !attacker.isHR && attacker.allyOwner !== G.player &&
      target.bot && !target.isHR) dmg *= G.zone.phase >= 4 ? .55 : .28;
  /* 持传说的机器人对玩家降额，治「进圈即被 0.6 秒开盒」的随机暴毙 */
  if (attacker && attacker.bot && !attacker.isHR && attacker.weapon.leg && target.isPlayer) dmg *= .65;
  let crit = false;
  if (attacker && attacker.mods && attacker.mods.crit && Math.random() < attacker.mods.crit) {
    dmg *= 2; crit = true;
  }
  if (attacker && attacker.buffs && attacker.buffs.dmgT > 0) dmg *= attacker.buffs.dmgM;   // 季度考核倒计时 KPI压力等临时增伤
  /* 办公室政治：小概率给目标挂"内耗标记"，1.5秒后对最近另一敌人溅射本次伤害30% */
  if (attacker && attacker.mods.workplacePolitics && Math.random() < attacker.mods.workplacePolitics) {
    target.politicsT = 1.5; target.politicsDmg = dmg * .3; target.politicsOwner = attacker;
  }
  /* 线上响应术：移动中受到的伤害减免 */
  if (target.isPlayer && target.mods.onlineResponse && target.moveT > 2) dmg *= (1 - Math.min(.6, target.mods.onlineResponse));
  if (target.shield > 0) {
    const ab = Math.min(target.shield, dmg);
    target.shield -= ab; dmg -= ab;
    addFloat(target.x, target.y - 14, `盾-${Math.round(ab)}`, '#6aa3ff', 6, .5);
  }
  /* 重复造轮子任务：dmgTaken=.2 期间减伤80%持续生效，累计命中的折后伤害耗尽独立护盾计数后破防硬直 */
  if (target.mobShieldHp > 0 && !target.mobShieldBroken) {
    target.mobShieldHp -= dmg;
    if (target.mobShieldHp <= 0) {
      target.mobShieldBroken = true;
      target.mods.dmgTaken = 1;
      target.stunT = Math.max(target.stunT, 1.2);
      if (nearPlayer(target.x, target.y)) addFloat(target.x, target.y - 14, '破防了！', '#ff9440', 7, .6);
    }
  }
  if (dmg <= 0) return;
  /* 甩锅式反伤：受到的伤害一定概率完全转移给附近受控敌人（觉醒后概率更高，见下方常量） */
  if (target.isPlayer && target.mods.blameReflect && opts.cause !== 'zone' && !(attacker && attacker.isBoss)) {
    if (Math.random() < target.mods.blameReflectPct) {
      const patsy = nearestUnit(target.x, target.y, 90, t => isFoe(target, t) && t.stunT > 0);
      if (patsy) {
        applyDamage(patsy, dmg * 1.5, attacker, { quiet: false });
        addFloat(target.x, target.y - 14, '甩锅成功！', '#c58fff', 7, .7);
        return;
      }
    }
  }
  /* 熔断机制：单次重击（>15%当前生命）触发全屏眩晕+短暂免疫，20秒冷却 */
  if (target.isPlayer && target.mods.fuseBreak && target.fuseBreakCd <= 0 && dmg > target.hp * .15) {
    target.fuseBreakCd = 20;
    target.invulnT = Math.max(target.invulnT, .6);
    for (const t of G.units) if (isFoe(target, t) && dist2(target.x, target.y, t.x, t.y) < 260 * 260) t.stunT = Math.max(t.stunT, 1.2);
    addFloat(target.x, target.y - 20, '熔断保护！', '#9ad1ff', 9, 1);
    SFX.deny(); addShake(4);
  }
  if (target.isPlayer) target.noHitT = 0;   // 在线时长认证 / 假勤奋真怠工 计时清零
  if (attacker && attacker.isPlayer) attacker.lastDealT = G.t;   // 摸鱼申诉信：判定是否真的没输出
  /* 被优化了但我假装没看见（觉醒）：35%概率无视本次伤害，但仍完整走完结算流程（curse/vulnT等副作用不受影响），
     对Boss/小Boss的固定演出类攻击不生效 */
  if (target.isPlayer && target.ignoreDmgT > 0 && !(attacker && (attacker.isBoss || attacker.eliteTier === 2)) && Math.random() < .35) {
    addFloat(target.x, target.y - 14, '已读不回', '#c9d4e4', 7, .6);
  } else {
    target.hp -= dmg;
  }
  target.hurtT = .15;
  /* 只有重击（>5% 最大生命）才打断"站定"状态——蹭血不再无限打断带薪如厕 */
  if (dmg > maxHp(target) * .05) target.standT = 0;
  if (opts.stun) {
    target.stunT = Math.max(target.stunT, opts.stun);
    if (attacker && attacker.mods) {
      /* 回收站冷静期：眩晕命中后目标下一次受伤加成 */
      if (attacker.mods.stunPunish) target.vulnT = Math.max(target.vulnT, 2), target.vulnBonus = Math.max(target.vulnBonus, attacker.mods.stunPunish);
      /* 连坐制度：眩晕概率传染给附近另一敌人 */
      if (attacker.mods.stunSpread && Math.random() < attacker.mods.stunSpread) {
        const near = nearestUnit(target.x, target.y, 150, t => t !== target && isFoe(attacker, t));
        if (near) near.stunT = Math.max(near.stunT, opts.stun * .7);
      }
    }
  }
  if (attacker && target.bot) { target.bot.provokedT = 4; target.lastAtk = attacker; }
  if (target.isPlayer) { addShake(2); SFX.hurt(); }
  const show = !opts.quiet && (target.isPlayer || (attacker && attacker.isPlayer) || nearPlayer(target.x, target.y));
  if (show) {
    addFloat(target.x + rand(-4, 4), target.y - 16, String(Math.round(dmg)) + (crit ? '!' : ''),
      crit ? '#ff8f5a' : target.isPlayer ? '#ff6a6a' : (attacker && attacker.isPlayer ? '#ffe27a' : '#c9c4b4'),
      (target.isPlayer ? 8 : 7) + (crit ? 2 : 0), .6);
    addParts(target.x, target.y - 6, '#ff6a6a', 3, 50, .3);
    if (attacker && attacker.isPlayer) SFX.hit();
  }
  if (target.hp <= 0) killUnit(target, attacker, opts.cause);
}

export function applyCurse(u, id, dur) {
  if (!u.alive || u.isBoss || u.isElite) return;
  const fresh = u.curses[id] <= 0;
  if (id === 'repeat' && fresh) u.repeatAim = u.aim;
  u.curses[id] = Math.max(u.curses[id], dur);
  if (fresh && (u.isPlayer || nearPlayer(u.x, u.y)))
    addFloat(u.x, u.y - 22, `中了「${CURSES[id].name}」`, CURSES[id].color, 7, 1.1);
  if (fresh && u.isPlayer) { SFX.deny(); addShake(2); }
}

function killUnit(victim, killer, cause) {
  /* 试用期晕倒救济：每月一次被同事扶起（试用期是发育期，不该有一波带走）——
     代价是扣经验；正赛阶段无此待遇 */
  if (victim.isPlayer && G.trial.active && !G.trial.revivedThisWave) {
    G.trial.revivedThisWave = true;
    victim.hp = maxHp(victim) * .6;
    victim.invulnT = 1.5;
    victim.xp = Math.max(0, victim.xp - 10);
    for (const m of G.units) {
      if (m.isMob && m.alive && dist2(m.x, m.y, victim.x, victim.y) < 130 * 130) m.alive = false;
    }
    for (const p of G.projs) if (dist2(p.x, p.y, victim.x, victim.y) < 130 * 130) p.dead = true;
    addFloat(victim.x, victim.y - 22, '晕倒了…被同事扶起（扣半月薪水）', '#ffcf33', 8, 1.6);
    addFeed('你在工位晕倒，被同事扶到茶水间缓了缓', true);
    addParts(victim.x, victim.y, '#7ee08a', 16, 90, .6);
    SFX.hurt();
    return;
  }
  if (victim.mods.revive > 0) {
    victim.mods.revive = 0;
    victim.hp = maxHp(victim) * .5;
    victim.invulnT = 1.2;
    for (const p of G.projs) if (dist2(p.x, p.y, victim.x, victim.y) < 90 * 90) p.dead = true;
    addFloat(victim.x, victim.y - 20, victim.isBoss ? '“我给自己批了 N+1！”' : 'N+1到账，原地复活！', '#ffcf33', 8, 1.4);
    if (victim.isBoss) addFeed('老板 动用蒸馏来的 N+1 条款原地复活', true);
    addParts(victim.x, victim.y, '#ffcf33', 20, 100, .7);
    if (victim.isPlayer || nearPlayer(victim.x, victim.y)) SFX.fuse();
    return;
  }
  /* 已发送-撤回中：死亡50%概率原地"撤回"复活一次，不可再次触发，纯节奏/心理设计怪 */
  if (victim.isMob) {
    const mm = MOBS[victim.mobType];
    if (mm.recallChance && !victim.recalled && Math.random() < mm.recallChance) {
      victim.recalled = true;
      victim.hp = maxHp(victim);
      if (nearPlayer(victim.x, victim.y)) addFloat(victim.x, victim.y - 14, '消息撤回中…', '#6aa3ff', 7, .9);
      return;
    }
  }
  victim.alive = false;
  victim.hp = 0;
  addParts(victim.x, victim.y, victim.isBoss ? '#b665ff' : victim.shirt, victim.isBoss ? 40 : victim.isMob ? 7 : 16, 110, .7);
  if (!victim.isMob) {
    addParts(victim.x, victim.y, '#f2efe6', 8, 70, .5);
    addFloat(victim.x, victim.y - 18, victim.isBoss ? '老板毕业了！' : '已优化', victim.isBoss ? '#b665ff' : '#ff6a6a', 8, 1);
    if (victim.isPlayer || (killer && killer.isPlayer) || nearPlayer(victim.x, victim.y)) SFX.death();
  }

  /* 掉落 */
  if (victim.isMob) {
    const m = MOBS[victim.mobType];
    /* 需求变更单：打死分裂成两张小的；抄送轰炸：35%概率分裂出1只"已读不回"（splitChance/splitCount/splitInto 可选覆盖） */
    if (m.split && !victim.isSplitChild && Math.random() < (m.splitChance ?? 1)) {
      const childType = m.splitInto || victim.mobType;
      for (let i = 0; i < (m.splitCount ?? 2); i++) spawnMob(childType, victim.x + rand(-10, 10), victim.y + rand(-10, 10), true, victim.mobMonth || 1);
      if (nearPlayer(victim.x, victim.y))
        addFloat(victim.x, victim.y - 14, childType === victim.mobType ? '需求又变了！' : '转发出去了！', '#7ac8ff', 6, .8);
    }
    if (Math.random() < .15) spawnXp(G, victim.x, victim.y, 2);
    /* 地板咖啡豆：环境刮痧的对冲回复（割草游戏的地板鸡定律） */
    if (Math.random() < .12) G.pickups.push({ type: 'heal', amt: 4, x: victim.x, y: victim.y, bob: rand(0, 6) });
  } else if (victim.isElite) {
    spawnTech(G, pickTechId(), victim.x, victim.y, rollTier(victim.eliteTier === 2));
    spawnXp(G, victim.x, victim.y, victim.eliteTier === 2 ? 20 : 10);
    if (victim.eliteTier === 2) {   // 小 Boss 掉双倍模组（品级上偏）+ 消耗品
      spawnTech(G, pickTechId(), victim.x + rand(-12, 12), victim.y + rand(-12, 12), rollTier(true));
      spawnItem(G, undefined, victim.x + rand(-14, 14), victim.y + rand(-14, 14));
      addFeed(`小Boss ${victim.name} 被优化了`, !!(killer && killer.isPlayer));
      /* 亲手击杀 → 掉 AI 替身样本（公司用 AI 换员工，你用 AI 换同事） */
      if (killer && killer.isPlayer) {
        G.pickups.push({ type: 'sample', boss: victim.eliteType, x: victim.x + rand(-8, 8), y: victim.y + rand(-8, 8), bob: rand(0, 6) });
        addFloat(victim.x, victim.y - 26, 'AI 替身样本掉落！', '#d9b3ff', 8, 1.4);
      }
    }
  } else if (!victim.isPlayer && !victim.isBoss && !victim.isSummon) {
    if (victim.weapon.leg) spawnChip(G, victim.weapon.id, 5, victim.x, victim.y);
    else spawnChip(G, victim.weapon.id, victim.weapon.lvl, victim.x, victim.y);
    if (Math.random() < .35) spawnItem(G, undefined, victim.x + rand(-14, 14), victim.y + rand(-14, 14));
    spawnXp(G, victim.x, victim.y, 6);
  }
  if (victim.isBoss) {
    G.bossDead = true;
    for (const u of G.units) if (u.isHR && u.alive) { u.alive = false; addParts(u.x, u.y, '#9aa4b5', 10, 80, .5); }
    addFeed('老板 已毕业，HR 集体跑路', true);
    addShake(8);
  }

  /* 击杀奖励 */
  if (killer && killer.alive) {
    gainXp(killer, victim.isMob ? (victim.mobXp || MOBS[victim.mobType].xp)
      : (TUNE.xpPerKill + victim.level * 3) * (victim.isBoss ? 4 : 1) + (victim.isElite ? 15 : 0));
    if (killer.mods.killHeal) killer.hp = Math.min(maxHp(killer), killer.hp + killer.mods.killHeal * (victim.isMob ? .3 : 1));
    /* 全员大会核爆：控制效果间接/直接导致的击杀累积会议积分 */
    if (killer.mods.assemblyNuke && (victim.stunT > 0 || victim.curses.repeat > 0)) killer.meetingPoints = (killer.meetingPoints || 0) + 1;
    /* 临时工外包大军：全组最后1只死亡才一次性结算奖励经验（拖到最后一击才爆发） */
    if (victim.isMob && victim.mobGroup) {
      victim.mobGroup.alive--;
      if (victim.mobGroup.alive <= 0) {
        const bonus = MOBS[victim.mobType].groupBonusXp || 0;
        gainXp(killer, bonus);
        if (nearPlayer(victim.x, victim.y)) addFloat(victim.x, victim.y - 20, `外包大军清空 +${bonus}经验`, '#ffcf33', 8, 1);
      }
    }
    if (victim.isMob) {
      if (killer.isPlayer) SFX.hit();
      return;   // 杂鱼不进击杀数/连杀/播报
    }
    killer.kills++;
    if (killer.mods.dropChance && Math.random() < killer.mods.dropChance)
      spawnItem(G, undefined, victim.x + rand(-10, 10), victim.y + rand(-10, 10));
    if (killer.isPlayer) {
      G.kills++; SFX.kill();
      earnGold(1);  /* 每杀一个得 1 金币 */
      G.freezeT = .07;
      if (G.t - (G.lastKillT === undefined ? -9 : G.lastKillT) < 3) G.streak++;
      else G.streak = 1;
      G.lastKillT = G.t;
      if (G.streak >= 2) {
        const label = G.streak === 2 ? '双杀！' : G.streak === 3 ? '三杀！！' : `裁员风暴 ×${G.streak}！！！`;
        addFloat(killer.x, killer.y - 28, label, '#ffcf33', 10, 1.2);
        beep(500 + G.streak * 90, 900 + G.streak * 90, .13, 'triangle', .055);
      }
    }
  }

  /* 击杀播报 */
  if (victim.isSummon) {
    addFeed(`你的 ${victim.name} 报废了`, true);
  } else if (!victim.isHR && !victim.isElite && !victim.isMob) {
    if (cause === 'zone') addFeed(`${victim.name} 被裁员红线优化了`, victim.isPlayer);
    else if (cause === 'burn') addFeed(`${victim.name} 倒在了画的饼里`, victim.isPlayer);
    else if (cause === 'inject') addFeed(`${victim.name} 提示词失效，精神崩溃离职`, false);
    else if (killer && killer.isMob) addFeed(`${victim.name} 被${killer.name}淹没了（没熬过试用期琐事）`, victim.isPlayer);
    else if (killer && killer.isElite) addFeed(`${victim.name} 被 ${killer.name} 带走了`, victim.isPlayer);
    else if (killer) addFeed(`${killer.name} 用「${killer.weapon.leg ? LEGENDS[killer.weapon.leg].name : WEAPONS[killer.weapon.id].name}」优化了 ${victim.name}`, victim.isPlayer || killer.isPlayer);
  }

  if (victim.isPlayer) {
    G.playerRank = aliveWorkers() + 1 + (G.latentBots ? G.latentBots.length : 0);
    G.deathLine = pick(COPY.deathLines);
    /* 死亡回执：凶手、差距——最强的"再来一局"燃料 */
    G.deathInfo = {
      killer: killer ? killer.name : (cause === 'zone' ? '裁员红线' : cause === 'burn' ? '一张画的饼' : '意外'),
      weapon: killer && !killer.isElite && !killer.isBoss && !killer.isMob
        ? (killer.weapon.leg ? `「${LEGENDS[killer.weapon.leg].name}」` : WEAPONS[killer.weapon.id].name)
        : null,
      remaining: aliveWorkers(),
      bossPct: G.bossSpawned && G.boss && G.boss.alive ? Math.round(G.boss.hp / maxHp(G.boss) * 100) : null,
    };
    G.endT = 1;
  }
}
export function aliveWorkers() {
  /* 被策反的不算竞争者 */
  return G.units.filter(u => u.alive && !u.isBoss && !u.isHR && !u.isElite && !u.isMob && !u.allyOwner).length;
}
/* 某品牌芯片是否还可能拿到（场上有掉落，或有活着的持有者迟早会掉） */
export function chipObtainable(id) {
  if (!G) return false;
  if (G.pickups.some(p => p.type === 'chip' && p.id === id)) return true;
  return G.units.some(u => u.alive && !u.isElite && !u.isBoss && !u.isPlayer && !u.weapon.leg && u.weapon.id === id);
}

/* ---------- 经验 / 技能 / 消耗品 / 模组 ---------- */
export function gainXp(u, amt) {
  /* 试用期工资打折：多源经验的总闸，防止发育期通胀吃光整个卡池 */
  if (G && G.trial.active && u.isPlayer) {
    amt *= .42;   // 0.6→0.42，配合底数1.26与新怪物xp/hp值放慢试用期升级节奏，见设计文档第2节
    G.trialXpEarned = (G.trialXpEarned || 0) + amt * u.mods.xp;   // 记账：转正同事按此补发育
  }
  /* 商城永久经验加成 */
  if (G && G.xpBonus && u.isPlayer) amt *= (1 + G.xpBonus);
  u.xp += amt * u.mods.xp;
  while (u.xp >= TUNE.levelNeed(u.level)) {
    u.xp -= TUNE.levelNeed(u.level);
    u.level++;
    if (u.mods.levelHp) { u.hpBase += u.mods.levelHp; u.hp = Math.min(maxHp(u), u.hp + u.mods.levelHp); }
    if (u.isPlayer) {
      G.pendingLevels++;
      SFX.levelup();
      addFloat(u.x, u.y - 20, '升职了！', '#ffcf33', 9, 1);
    } else {
      const pool = SKILLS.filter(s => (u.skills[s.id] || 0) < s.max && (!s.valid || s.valid(u)));
      if (pool.length) applySkill(u, pick(pool));
      u.hp = Math.min(maxHp(u), u.hp + 15);
    }
  }
}
export function applySkill(u, s) {
  u.skills[s.id] = (u.skills[s.id] || 0) + 1;
  const hpBefore = maxHp(u);
  s.apply(u.mods);
  const diff = maxHp(u) - hpBefore;
  if (diff > 0) u.hp += diff;
  u.hp = Math.min(maxHp(u), u.hp);
}

function useItem(u, id) {
  const boost = u.mods.itemBoost;
  const F = n => Math.round(n * boost);
  switch (id) {
    case 'iced_americano':
      u.hp = Math.min(maxHp(u), u.hp + F(30));
      if (u.isPlayer) addFloat(u.x, u.y - 16, `+${F(30)} HP`, '#7ee08a', 8, .8);
      break;
    case 'overtime_redbull':
      u.buffs.spdT = 5 * boost; u.buffs.spdM = 1.5;
      if (u.isPlayer) addFloat(u.x, u.y - 16, '加班冲刺！', '#6aa3ff', 8, .8);
      break;
    case 'stock_option':
      gainXp(u, F(50));
      if (u.isPlayer) addFloat(u.x, u.y - 16, `+${F(50)} 经验`, '#ffe27a', 8, .8);
      break;
    case 'n1_package':
      u.shield = F(30); u.shieldT = 10;
      if (u.isPlayer) addFloat(u.x, u.y - 16, `+${F(30)} 护盾`, '#6aa3ff', 8, .8);
      break;
    case 'teambuild_milktea':
      u.buffs.fireT = 8 * boost; u.buffs.fireM = 1.3;
      if (u.isPlayer) addFloat(u.x, u.y - 16, '奶茶到位，射速拉满', '#ff9edb', 8, .8);
      break;
    case 'boss_pie':
      if (Math.random() < .5) {
        u.hp = Math.min(maxHp(u), u.hp + F(25));
        if (u.isPlayer) addFloat(u.x, u.y - 16, `真香 +${F(25)} HP`, '#7ee08a', 8, .8);
      } else if (u.isPlayer) addFloat(u.x, u.y - 16, '饼是画的', '#9aa4b5', 8, 1);
      break;
    case 'double_quota':
      u.buffs.fireT = 6 * boost; u.buffs.fireM = 1.5;
      if (u.isPlayer) addFloat(u.x, u.y - 16, '双倍配额，敞开用！', '#ffcf33', 9, 1);
      break;
    case 'reset_card': {
      u.weapon.cd = 0; u.dashT = 0; u.activeCd = 0;
      u.weapon.droneCds = [0, 0, 0, 0]; u.ragCds = [0, 0];
      u.weapon.pillarT = 0;
      if (u.dstT) for (const k in u.dstT) u.dstT[k] = 0;
      for (const sid in u.subs) u.subs[sid].t = 0;
      if (u.isPlayer) addFloat(u.x, u.y - 16, '本月用量已清零', '#67c98b', 9, 1);
      break;
    }
    case 'n2_package':
      u.shield = F(60); u.shieldT = 12;
      u.hp = Math.min(maxHp(u), u.hp + F(20));
      if (u.isPlayer) addFloat(u.x, u.y - 16, `2N 到账：+${F(60)} 盾 +${F(20)} HP`, '#c9a227', 9, 1);
      break;
    case 'resume_refresh':
      if (u.isPlayer) {
        G.rerollCredits = (G.rerollCredits || 0) + 1;
        addFloat(u.x, u.y - 16, `简历已刷新（重抽机会 ×${G.rerollCredits}）`, '#7ac8ff', 8, 1);
      }
      break;
    /* ===== v2.0 新增道具 ===== */
    case 'triple_coffee':
      u.hp = Math.min(maxHp(u), u.hp + F(60));
      if (u.isPlayer) addFloat(u.x, u.y - 16, `三倍浓缩 +${F(60)} HP`, '#7ee08a', 8, .8);
      break;
    case 'energy_drink':
      u.buffs.spdT = 8 * boost; u.buffs.spdM = Math.max(u.buffs.spdM, 1.8);
      u.buffs.fireT = Math.max(u.buffs.fireT, 8 * boost); u.buffs.fireM = Math.max(u.buffs.fireM, 1.2);
      if (u.isPlayer) addFloat(u.x, u.y - 16, '魔爪能量！移速+射速拉满', '#6aa3ff', 9, 1);
      break;
    case 'golden_parachute':
      u.hp = maxHp(u);
      u.invulnT = Math.max(u.invulnT, 10 * boost);
      if (u.isPlayer) addFloat(u.x, u.y - 16, '金色降落伞！满血+无敌', '#ffcf33', 10, 1.3);
      break;
    case 'stock_vest':
      u.shield = F(100); u.shieldT = 15;
      u.hp = Math.min(maxHp(u), u.hp + F(30));
      if (u.isPlayer) addFloat(u.x, u.y - 16, `限股包：+${F(100)}盾 +${F(30)} HP`, '#c9a227', 9, 1);
      break;
    case 'promote_letter':
      gainXp(u, F(100));
      u.level++; u.xp = 0;
      if (u.isPlayer) { addFloat(u.x, u.y - 16, '晋升！+100经验+1级', '#ffe27a', 10, 1.2); SFX.levelup(); }
      break;
    case 'overtime_4x':
      u.buffs.fireT = Math.max(u.buffs.fireT, 10 * boost); u.buffs.fireM = Math.max(u.buffs.fireM, 2);
      u.buffs.dmgT = Math.max(u.buffs.dmgT, 10 * boost); u.buffs.dmgM = Math.max(u.buffs.dmgM, 1.5);
      if (u.isPlayer) addFloat(u.x, u.y - 16, '四倍加班费！伤害射速双拉', '#ff4f4f', 10, 1.2);
      break;
    case 'refresh_token':
      u.weapon.cd = 0; u.activeCd = 0; u.dashT = 0;
      u.weapon.droneCds = [0, 0, 0, 0]; u.ragCds = [0, 0]; u.weapon.pillarT = 0;
      for (const sid in u.subs) u.subs[sid].t = 0;
      u.buffs.fireT = Math.max(u.buffs.fireT, 5); u.buffs.fireM = Math.max(u.buffs.fireM, 99);
      if (u.isPlayer) addFloat(u.x, u.y - 16, 'Token刷新！全CD清零', '#67c98b', 9, 1);
      break;
    case 'hr_blessing':
      u.hp = Math.min(maxHp(u), u.hp + F(maxHp(u) * .5));
      gainXp(u, F(50));
      if (u.isPlayer) { G.rerollCredits = (G.rerollCredits || 0) + 1; addFloat(u.x, u.y - 16, 'HR祝福！回血+经验+重抽', '#ff9edb', 10, 1.3); }
      break;
    case 'team_hotpot':
      u.buffs.fireT = Math.max(u.buffs.fireT, 15 * boost); u.buffs.fireM = Math.max(u.buffs.fireM, 1.5);
      u.buffs.spdT = Math.max(u.buffs.spdT, 15 * boost); u.buffs.spdM = Math.max(u.buffs.spdM, 1.3);
      if (u.isPlayer) addFloat(u.x, u.y - 16, '团建火锅！士气拉满', '#ff9edb', 10, 1.2);
      break;
    case 'final_paycheck':
      u.hp = Math.min(maxHp(u), u.hp + F(50));
      for (const t of G.units) { if (isFoe(u, t)) t.oaSlowT = Math.max(t.oaSlowT, 5); }
      if (u.isPlayer) addFloat(u.x, u.y - 16, '最终工资单！回血+全场减速', '#ffcf33', 10, 1.3);
      break;
  }
  if (u.isPlayer) SFX.pickup();
}

export function applyTechPickup(u, id, tier = 1) {
  const t = TECH[id], m = u.mods;
  const t3 = (a, b, c) => [a, b, c][tier - 1];   // 标准 / Pro / Ultra
  if (!t.instant) u.tech[id] = (u.tech[id] || 0) + 1;
  switch (id) {
    case 'fewshot': m.multishot++; m.echoMult = Math.max(m.echoMult === 1 ? 0 : m.echoMult, t3(.6, .75, .9)); break;
    case 'cot': m.pierce += t3(1, 1, 2); break;
    case 'temp': m.crit += t3(.10, .14, .19); break;
    case 'quant': { const v = t3(1.10, 1.15, 1.22); m.fireRate *= v; m.bulletSpd *= v; break; }
    case 'attention': m.homing += t3(.8, 1.1, 1.5); break;
    case 'kvcache': m.fireRate *= t3(1.08, 1.12, 1.18); break;
    case 'finetune': { const v = t3(1.05, 1.08, 1.12); m.dmg *= v; m.fireRate *= v; m.spd *= t3(1.03, 1.05, 1.08); break; }
    case 'ctxwin': m.range *= t3(1.18, 1.25, 1.35); break;
    case 'sysprompt': m.sysPrompt = Math.max(m.sysPrompt, t3(10, 15, 22)); u.shield = Math.max(u.shield, t3(20, 30, 45)); u.shieldT = 12; break;
    case 'rag': m.rag = Math.min(2, m.rag + 1); m.ragBoost = Math.max(m.ragBoost, t3(1, 1.15, 1.35)); break;
    case 'inject': doInject(u, t3(12, 20, 30)); break;
    case 'clear': doClear(u, t3(70, 95, 125), t3(22, 30, 42)); break;
    case 'distill': grantDistill(u); break;
  }
  if (u.isPlayer && id !== 'distill') {
    const tierInfo = TECH_TIERS[tier - 1];
    addFloat(u.x, u.y - 18, `模组：${tierInfo.label}${t.name}`, tierInfo.color || t.color, tier === 3 ? 9 : 8, 1.1);
    SFX.chip();
    if (tier === 3) SFX.fuse();
  }
}

/* ---------- 人设四/五：控场反噬 + 摸鱼位移流的周期性状态机（仅玩家） ---------- */
function updatePersonaSkills(u, dt) {
  /* 办公室政治：内耗标记倒计时，到点溅射给最近另一敌人 */
  if (u.politicsT > 0) {
    u.politicsT -= dt;
    if (u.politicsT <= 0 && u.alive) {
      const near = nearestUnit(u.x, u.y, 150, t => t !== u && isFoe(u.politicsOwner || u, t));
      if (near) applyDamage(near, u.politicsDmg, u.politicsOwner, { quiet: true });
    }
  }
  u.fuseBreakCd -= dt;

  if (!u.isPlayer) return;
  /* 假装忙碌：闲置超1.5秒触发短暂提速，逼玩家别停 */
  if (u.mods.fakeBusy && u.idleT > 1.5) {
    u.idleT = 0;
    u.buffs.spdT = Math.max(u.buffs.spdT, 1);
    u.buffs.spdM = Math.max(u.buffs.spdM, 1.2);
  }
  /* 在线时长认证：连续不被命中每5秒叠一层"活跃认证"，被命中清零（noHitT 在 applyDamage 里清零） */
  u.noHitT += dt;
  if (u.mods.uptimeCertRate) {
    const layers = Math.min(5, Math.floor(u.noHitT / 5));
    if (layers > 0) {
      u.buffs.dmgT = .3; u.buffs.dmgM = 1 + layers * .02 * u.mods.uptimeCertRate;
      u.buffs.fireT = Math.max(u.buffs.fireT, .3); u.buffs.fireM = Math.max(u.buffs.fireM, 1 + layers * .03 * u.mods.uptimeCertRate);
    }
  }
  /* 假勤奋，真怠工：不受伤满8秒（觉醒后5秒）触发一次全屏伤害清算，随后重置 */
  u.ignoreDmgT -= dt;
  if (u.mods.fakeDiligence && u.noHitT >= (u.mods.__evoFakeDiligenceUpgrade ? 5 : 8)) {
    u.noHitT = 0;
    const burst = wpnDmg(u) * 3;
    for (const t of G.units) if (isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 260 * 260) applyDamage(t, burst, u, { quiet: false });
    addFloat(u.x, u.y - 22, '业绩展示！', '#b665ff', 9, 1.2); addShake(3); SFX.fuse();
    if (u.mods.__evoFakeDiligenceUpgrade) { u.ignoreDmgT = 2; addFloat(u.x, u.y - 32, '已读不回状态', '#c9d4e4', 8, 1); }
  }
  /* 季度考核倒计时：场上每个受控敌人给自身一层KPI压力，每秒重算一次（不做同帧刷层） */
  if (u.mods.kpiPerLayer) {
    u.kpiLayerT -= dt;
    if (u.kpiLayerT <= 0) {
      u.kpiLayerT = 1;
      let n = 0;
      for (const t of G.units) if (t.alive && isFoe(u, t) && t.stunT > 0) n++;
      u.kpiLayers = Math.min(20, n);
    }
    if (u.kpiLayers > 0) {
      u.buffs.dmgT = Math.max(u.buffs.dmgT, .3);
      u.buffs.dmgM = Math.max(u.buffs.dmgM, 1 + u.kpiLayers * u.mods.kpiPerLayer);
    }
  }
  /* 末位淘汰制：每8秒强制"约谈"场上生命最低的敌人，定身2秒后爆炸，再指向下一个最低生命目标 */
  if (u.mods.bottomCut) {
    u.bottomCutT -= dt;
    if (u.bottomCutT <= 0) {
      u.bottomCutT = 8;
      let worst = null, worstHp = Infinity;
      for (const t of G.units) if (t.alive && isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 500 * 500 && t.hp < worstHp) { worst = t; worstHp = t.hp; }
      if (worst) {
        worst.stunT = Math.max(worst.stunT, 2);
        worst.bottomCutMark = 2;
      }
    }
  }
  for (const t of G.units) {
    if (t.bottomCutMark > 0) {
      t.bottomCutMark -= dt;
      if (t.bottomCutMark <= 0 && t.alive) {
        t.bottomCutMark = 0;
        explodeAt(t.x, t.y, 110, maxHp(t) * 2, u, '#ff6a6a');
      }
    }
  }
  /* 全员大会核爆：会议积分满30点触发全屏拉拽+核爆 */
  if (u.mods.assemblyNuke) {
    if (u.assemblyT > 0) {
      u.assemblyT -= dt;
      if (u.assemblyT <= 0) {
        const dmg = Math.min(wpnDmg(u) * 3.5, 300);
        for (const t of G.units) if (isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 260 * 260)
          applyDamage(t, t.isBoss || t.eliteTier === 2 ? Math.min(dmg, 300) : dmg, u, { quiet: false });
        addFloat(u.x, u.y - 24, '全员大会核爆！', '#ff6a6a', 10, 1.4); addShake(6); SFX.boss();
      }
    } else if (u.meetingPoints >= 30) {
      u.meetingPoints = 0;
      u.assemblyT = 3;
      for (const t of G.units) if (isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 300 * 300) {
        t.stunT = Math.max(t.stunT, 3);
        const a = Math.atan2(u.y - t.y, u.x - t.x), dd = Math.min(80, dist(u.x, u.y, t.x, t.y) - 40);
        t.x += Math.cos(a) * dd; t.y += Math.sin(a) * dd;
      }
      addFloat(u.x, u.y - 20, '全员大会召集中…', '#ff9440', 9, 1.4); SFX.zone();
    }
  }
  /* 永动摸鱼引擎：累计移动300px触发4秒高铁摸鱼——海量提速+免疫接触伤害+沿途弹射 */
  if (u.mods.perpetualSlack) {
    if (u.slackBurstT > 0) {
      u.slackBurstT -= dt;
      u.invulnT = Math.max(u.invulnT, dt + .05);
      u.slackTickT -= dt;
      if (u.slackTickT <= 0) {
        u.slackTickT = .2;
        for (const t of G.units) if (isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 50 * 50) {
          applyDamage(t, wpnDmg(u) * .6, u, { quiet: true });
          if (u.mods.__evoOnlineOffline) {   // 觉醒：在线但心已离职——命中叠永久攻击力，上限15层
            u.__slackStacks = Math.min(15, (u.__slackStacks || 0) + 1);
            u.mods.dmg = (u.__slackStacksBase || (u.__slackStacksBase = u.mods.dmg)) * (1 + u.__slackStacks * .01);
          }
        }
      }
    } else if (u.slackMiles >= 300) {
      u.slackMiles = 0;
      u.slackBurstT = 4;
      u.buffs.spdT = Math.max(u.buffs.spdT, 4); u.buffs.spdM = Math.max(u.buffs.spdM, 3);
      addFloat(u.x, u.y - 20, '高铁摸鱼！', '#ffcf33', 9, 1.2); SFX.dash();
      if (u.mods.__evoOnlineOffline) u.invulnT = Math.max(u.invulnT, .3);
    }
  }
}

/* ---------- 大模型蒸馏：随机获得一个 Boss/小Boss 技能弱化版 ---------- */
function grantDistill(u) {
  const pool = Object.keys(DISTILLS).filter(k => !(u.distills && u.distills[k]));
  if (!pool.length) {
    gainXp(u, 50);
    if (u.isPlayer) addFloat(u.x, u.y - 18, '蒸馏已饱和 +50经验', '#9aa4b5', 7, .9);
    return;
  }
  const k = pick(pool);
  u.distills = u.distills || {};
  u.dstT = u.dstT || {};
  u.distills[k] = true;
  u.dstT[k] = 2;
  addFloat(u.x, u.y - 24, `蒸馏成功：「${DISTILLS[k].name}」`, '#b665ff', 9, 1.6);
  addFeed(`你 蒸馏出了 ${DISTILLS[k].src} 的「${DISTILLS[k].name}」`, true);
  addParts(u.x, u.y, '#b665ff', 26, 120, .8);
  SFX.fuse();
}
/* 蒸馏技能的自动施放（玩家专属） */
function updateDistills(u, dt) {
  const D = u.distills;
  for (const k in D) {
    if (k === 'align') continue;                       // 被动，见子弹碰撞
    u.dstT[k] -= dt;
    if (u.dstT[k] > 0) continue;
    if (k === 'ppt') {
      u.dstT[k] = 10;
      const ang = u.aim;
      addFx({ type: 'coneflash', x: u.x, y: u.y, ang, spread: .5, len: 120, color: '#e8e4d8', life: .3 });
      for (const t of G.units) {
        if (!isFoe(u, t) || dist(u.x, u.y, t.x, t.y) > 120) continue;
        let da = Math.atan2(t.y - u.y, t.x - u.x) - ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < .5) applyDamage(t, 14, u, { stun: .5 });
      }
    } else if (k === 'snitch') {
      const v = nearestUnit(u.x, u.y, 350, t => isFoe(u, t) && t.bot && !t.isHR && !t.isElite);
      if (!v) { u.dstT[k] = 2; continue; }
      u.dstT[k] = 14;
      v.reportedT = 5;
      addFloat(v.x, v.y - 22, '已被举报', '#ff4f4f', 7, 1.2);
    } else if (k === 'pie') {
      u.dstT[k] = 8;
      for (let i = 0; i < 6; i++)
        spawnBullet(u, i / 6 * Math.PI * 2, { dmg: 8 * u.mods.dmg, spd: 140, range: 200, shape: 'pie', r: 3, _echo: true });
    } else if (k === 'upman') {
      u.dstT[k] = 10;
      u.empowerT = 3;
      u.hp = Math.min(maxHp(u), u.hp + 6);
      addFloat(u.x, u.y - 18, '向上管理：自我赋能', '#c9a227', 7, .9);
    } else if (k === 'pua') {
      u.dstT[k] = 9;
      addFx({ type: 'boom', x: u.x, y: u.y, r: 90, color: '#b665ff', life: .35 });
      for (const t of G.units) {
        if (!isFoe(u, t) || dist2(u.x, u.y, t.x, t.y) > 90 * 90) continue;
        applyDamage(t, 6, u);
        const a = Math.atan2(t.y - u.y, t.x - u.x);
        t.x += Math.cos(a) * 30; t.y += Math.sin(a) * 30;
      }
    }
  }
}
function doInject(u, dur = 20) {
  const t = nearestUnit(u.x, u.y, 320, o => isFoe(u, o) && o.bot && !o.isHR && !o.isElite && !o.allyOwner);
  if (!t) {
    gainXp(u, 25);
    if (u.isPlayer) addFloat(u.x, u.y - 16, '附近没人可策反 +25经验', '#9aa4b5', 7, .8);
    return;
  }
  const owner = u.allyOwner || u;
  t.allyOwner = owner; t.allyUntil = G.t + dur;
  t.bot.target = null; t.bot.decideT = 0;
  t.bot.provokedT = 0; t.lastAtk = null;
  addFloat(t.x, t.y - 20, '已被注入：开始帮忙打工', '#ff6a8a', 7, 1.4);
  if (u.isPlayer || nearPlayer(u.x, u.y)) { addFeed(`${u.name} 策反了 ${t.name}（20秒）`, u.isPlayer); SFX.fuse(); }
}
function doClear(u, radius = 95, dmg = 30) {
  let n = 0;
  for (const p of G.projs) if (p.owner !== u) { p.dead = true; n++; }
  addFx({ type: 'boom', x: u.x, y: u.y, r: radius, color: '#ffffff', life: .5 });
  for (const t of G.units) {
    if (!isFoe(u, t)) continue;
    if (dist2(u.x, u.y, t.x, t.y) < radius * radius) {
      applyDamage(t, dmg, u);
      const a = Math.atan2(t.y - u.y, t.x - u.x);
      t.x += Math.cos(a) * 40; t.y += Math.sin(a) * 40;
    }
  }
  addShake(5);
  if (u.isPlayer || nearPlayer(u.x, u.y)) SFX.explo();
  if (u.isPlayer) addFloat(u.x, u.y - 20, `/clear 已清除 ${n} 发子弹`, '#ffffff', 8, 1);
}

/* ---------- 主循环 ---------- */
export function update(dt) {
  if (G.freezeT > 0) { G.freezeT -= dt; dt *= .15; }   // 击杀顿帧
  G.t += dt;
  BGM.refreshPlayingTrack(G);   // 试用期/正式大逃杀/老板战之间的 BGM 切轨，幂等，开销可忽略

  /* ---------- 试用期波次调度 ---------- */
  const tr = G.trial;
  if (tr.active) {
    tr.waveT -= dt;
    if (tr.wave < tr.months && tr.waveT <= 0) {
      /* 新的一个月开工：三段式时长（爆发/涓流/考核），见 TUNE.trialWaveT/trialExamT */
      tr.wave++;
      tr.waveT = TUNE.trialWaveT(tr.wave);
      tr.bossThisWave = false;
      tr.revivedThisWave = false;   // 每月一次晕倒救济
      warn(`📋 试用期第 ${tr.wave}/${tr.months} 个月：清完本月琐事，月末有考核`);
      SFX.zone();
      tr.burstLeft = waveComp(tr.wave).burst;   // 爆发波改为分批涌入（防开局合围秒杀）
      tr.burstT = 0;
      /* 深夜加班灯：第2月起每月开局固定放2盏，静止环境怪，不进常规涓流池 */
      if (tr.wave >= 2) {
        for (let i = 0; i < 2; i++) {
          const a = rand(0, Math.PI * 2), rr = rand(150, 350);
          spawnMob('night_lamp',
            clamp(G.player.x + Math.cos(a) * rr, 30, TUNE.world - 30),
            clamp(G.player.y + Math.sin(a) * rr, 30, TUNE.world - 30), false, tr.wave);
        }
      }
      tr.hunterT = 20;   // 第3月起本月首次 KPI 追杀者延迟登场，见下方周期判定
    }
    /* KPI 追杀者：中间层，第3月起周期性单只登场，同屏最多1只，填补杂鱼到小Boss的难度断层 */
    if (tr.wave >= 3) {
      tr.hunterT = (tr.hunterT ?? 20) - dt;
      if (tr.hunterT <= 0 && G.player.alive && !G.units.some(u2 => u2.mobType === 'kpi_hunter' && u2.alive)) {
        tr.hunterT = 45;
        const a = rand(0, Math.PI * 2), rr = rand(320, 420);
        spawnMob('kpi_hunter',
          clamp(G.player.x + Math.cos(a) * rr, 30, TUNE.world - 30),
          clamp(G.player.y + Math.sin(a) * rr, 30, TUNE.world - 30), false, tr.wave);
        warn('🏃 KPI 追杀者盯上你了——甩不掉就是硬拼');
      }
    }
    /* 分批放怪：每 0.5 秒 3 只，从稍远处涌来（成组怪一次性整组涌出，按组大小占用名额） */
    if (tr.burstLeft > 0) {
      tr.burstT -= dt;
      if (tr.burstT <= 0 && G.player.alive) {
        tr.burstT = .5;
        const comp = waveComp(tr.wave);
        for (let i = 0; i < 3 && tr.burstLeft > 0; i++) {
          const a = rand(0, Math.PI * 2), rr = rand(200, 380);
          const type = pick(comp.types);
          const x = clamp(G.player.x + Math.cos(a) * rr, 30, TUNE.world - 30);
          const y = clamp(G.player.y + Math.sin(a) * rr, 30, TUNE.world - 30);
          if (MOBS[type].groupSize) { spawnMobGroup(type, x, y, tr.wave); tr.burstLeft -= MOBS[type].groupSize; }
          else { spawnMob(type, x, y, false, tr.wave); tr.burstLeft--; }
        }
      }
    }
    /* 涓流补怪：按缺口补齐；"月底冲刺"只在考核 Boss 已倒后触发——
       它是给清完场闲下来的人的加餐，不是给苦战者的补刀 */
    tr.trickleT = (tr.trickleT || 0) - dt;
    if (tr.wave >= 1 && tr.trickleT <= 0 && G.player.alive) {
      const bossAlive = G.units.some(u2 => u2.isElite && u2.eliteTier === 2 && u2.alive);
      const sprint = tr.waveT <= 6 && tr.bossThisWave && !bossAlive;
      tr.trickleT = sprint ? .6 : 1.5;
      const comp = waveComp(tr.wave);
      const aliveMobs = G.units.filter(u => u.isMob && u.alive).length;
      /* 考核 Boss 在场时小怪减半——Boss 战让位，别复合压死人 */
      const cap = Math.floor(comp.cap * (bossAlive ? .5 : 1)) + (sprint ? 6 : 0);
      let need = Math.min(cap - aliveMobs, 6);
      while (need > 0) {
        const a = rand(0, Math.PI * 2), rr = rand(300, 400);   // 从视野边缘涌入
        const type = pick(comp.types);
        const x = clamp(G.player.x + Math.cos(a) * rr, 30, TUNE.world - 30);
        const y = clamp(G.player.y + Math.sin(a) * rr, 30, TUNE.world - 30);
        if (MOBS[type].groupSize) { spawnMobGroup(type, x, y, tr.wave); need -= MOBS[type].groupSize; }
        else { spawnMob(type, x, y, false, tr.wave); need--; }
      }
    }
    /* 月中考核：第 12 秒在玩家身边刷本月小 Boss（每局顺序随机洗牌，血量随玩家等级插值；
       月末自动下班——打不过可以拖，考核官永不跨月堆叠） */
    if (tr.wave >= 1 && !tr.bossThisWave && tr.waveT <= TUNE.trialExamT(tr.wave)) {
      tr.bossThisWave = true;
      const mb = spawnElite(tr.bossOrder[(tr.wave - 1) % tr.bossOrder.length], G.player, 1 + .06 * G.player.level);
      if (mb) mb.trialDeadline = G.t + 17;
    }
    /* 考核官打卡下班 */
    for (const u2 of G.units) {
      if (u2.alive && u2.trialDeadline && G.t > u2.trialDeadline) {
        u2.alive = false;
        addParts(u2.x, u2.y, '#9aa4b5', 12, 80, .5);
        addFeed(`${u2.name} 打卡下班了（你的本月绩效：C）`, false);
      }
    }
    /* 月度目标达成（考核 Boss 已倒 + 琐事清零）：提前发薪进入下月，消灭月末空窗 */
    if (tr.wave >= 1 && tr.bossThisWave && tr.waveT > 4 && tr.burstLeft <= 0) {
      const busy = G.units.some(u2 => u2.alive && ((u2.isElite && u2.eliteTier === 2) || u2.isMob));
      if (!busy) {
        tr.waveT = 3;
        gainXp(G.player, 10 + 5 * tr.wave);
        addFloat(G.player.x, G.player.y - 22, '考核通过！提前发薪', '#7ee08a', 9, 1.3);
        SFX.levelup();
      }
    }
    /* 转正倒计时 */
    if (tr.wave === tr.months && !tr.cdWarned && tr.waveT <= 10) {
      tr.cdWarned = true;
      warn('⏳ 转正倒计时 10 秒——同事们马上到岗，准备开卷');
    }
    /* 试用期结束：同事空降入场（带追赶发育） */
    if (tr.wave >= tr.months && tr.waveT <= 0) {
      tr.active = false;
      spawnLateBots();
      warn('📢 试用期结束，全体同事到岗——正式开卷！');
      addFeed('HR：全员转正述职即日开始，祝各位好运', true);
      SFX.boss(); addShake(5);
    }
  }

  updateZone(dt);
  updateEndless(dt);

  /* 濒死心跳 */
  if (G.player.alive && G.player.hp < maxHp(G.player) * .3) {
    G.heartT -= dt;
    if (G.heartT <= 0) {
      G.heartT = .9;
      beep(75, 45, .12, 'sine', .11);
      later(() => beep(70, 42, .1, 'sine', .09), 150);
    }
  }

  /* 补给刷新（决赛圈行政停止补货） */
  if (G.zone.phase < 3) {
    G.chipT -= dt;
    if (G.chipT <= 0) {
      G.chipT = 10;
      /* 智能芯片掉落：偏向玩家当前武器（40% 概率），其余随机 */
      if (G.pickups.filter(p => p.type === 'chip').length < 22) {
        const pl = G.player;
        let chipId;
        if (pl && pl.alive && !pl.weapon.leg && pl.weapon.lvl < 5 && Math.random() < .40) {
          chipId = pl.weapon.id;   /* 40% 掉玩家武器的芯片，帮升满级 */
        } else {
          chipId = pick(Object.keys(WEAPONS));
        }
        spawnChip(G, chipId, Math.random() < .25 ? 2 : 1);
        /* 额外多掉一个，加速升级节奏 */
        if (pl && pl.alive && !pl.weapon.leg && pl.weapon.lvl < 5 && Math.random() < .30) {
          spawnChip(G, pl.weapon.id, 1);
        }
      }
    }
    G.itemT -= dt;
    if (G.itemT <= 0) {
      G.itemT = 12;
      if (G.pickups.filter(p => p.type === 'item').length < 12) spawnItem(G);
    }
    G.techT -= dt;
    if (G.techT <= 0) {
      G.techT = 25;
      if (G.pickups.filter(p => p.type === 'tech').length < 8) spawnTech(G, pickTechId());
    }
  }
  /* 精英野怪刷新（tier1 普通野怪；试用期由波次接管，不走常规刷新） */
  if (!tr.active) G.eliteT -= dt;
  if (G.eliteT <= 0) {
    G.eliteT = 22;
    const cap = G.zone.phase >= 4 ? 1 : Math.min(4, 1 + G.zone.phase);   // 终圈少刷
    if (G.units.filter(u => u.isElite && u.alive && u.eliteTier === 1).length < cap) spawnElite(pick(ELITE_T1));
  }
  /* 搭档芯片绝版保底（一次性，不违反决赛圈停止补给） */
  G.pityT -= dt;
  if (G.pityT <= 0 && !G.pityChipDone) {
    G.pityT = 2;
    const pl2 = G.player;
    if ((G.zone.phase >= 2 || G.bossSpawned) && pl2.alive && !pl2.weapon.leg && pl2.weapon.lvl >= 5) {
      const rp = recipePartner(pl2.weapon.id);
      if (rp && !chipObtainable(rp.partner)) {
        G.pityChipDone = true;
        const pos = randPosInZone(G, .5);
        spawnChip(G, rp.partner, 1, pos.x, pos.y);
        addFeed('行政悄悄补发了一块搭档芯片（下不为例）', true);
      }
    }
  }
  /* 职场怪物小 Boss（tier2，更稀有） */
  if (!tr.active) G.minibossT -= dt;
  if (G.minibossT <= 0) {
    G.minibossT = 55;
    const cap2 = G.zone.phase >= 2 ? 2 : 1;
    if (G.units.filter(u => u.isElite && u.alive && u.eliteTier === 2).length < cap2) spawnElite(pick(ELITE_T2));
  }

  /* 尸体清扫：只清杂鱼尸体（试用期涓流是唯一无界尸体源，长局防内存/遍历膨胀） */
  G.corpseT = (G.corpseT ?? 2) - dt;
  if (G.corpseT <= 0) {
    G.corpseT = 2;
    if (G.units.some(u => u.isMob && !u.alive)) G.units = G.units.filter(u => u.alive || !u.isMob);
  }

  for (const u of G.units) if (u.alive) updateUnit(u, dt);

  /* 订书机炮台 / 消防警报喷淋装置 */
  for (const tr2 of G.turrets) {
    tr2.life -= dt; tr2.cd -= dt;
    if (!tr2.owner.alive) continue;
    if (tr2.kind === 'sprinkler') {
      /* 消防警报喷淋装置：持续小范围减速伤害区，敌人扎堆(8+)时额外触发一次全范围定身 */
      if (tr2.cd <= 0) {
        tr2.cd = .3;
        const r = SUBS.fire_sprinkler.radius[tr2.lv - 1];
        let n = 0;
        for (const t of G.units) {
          if (!isFoe(tr2.owner, t) || dist2(tr2.x, tr2.y, t.x, t.y) > r * r) continue;
          n++;
          applyDamage(t, SUBS.fire_sprinkler.dps[tr2.lv - 1] * tr2.owner.mods.dmg * .3, tr2.owner, { quiet: true });
          t.oaSlowT = Math.max(t.oaSlowT, .5);
        }
        if (n >= 8 && !(tr2.stunCd > 0)) {
          tr2.stunCd = 6;
          for (const t of G.units) if (isFoe(tr2.owner, t) && dist2(tr2.x, tr2.y, t.x, t.y) < r * r) t.stunT = Math.max(t.stunT, .8);
          if (nearPlayer(tr2.x, tr2.y)) addFloat(tr2.x, tr2.y - 16, '消防演习强制疏散！', '#6aa3ff', 8, 1);
        }
      }
      tr2.stunCd = (tr2.stunCd || 0) - dt;
      continue;
    }
    if (tr2.cd <= 0) {
      const t = nearestUnit(tr2.x, tr2.y, 170, o => isFoe(tr2.owner, o));
      if (t) {
        tr2.cd = .7;
        spawnBullet(tr2.owner, Math.atan2(t.y - tr2.y, t.x - tr2.x),
          { x: tr2.x, y: tr2.y - 3, dmg: SUBS.stapler.shot[tr2.lv - 1] * tr2.owner.mods.dmg,
            spd: 320, range: 190, shape: 'dot', color: '#c9c4b4', _echo: true });
      }
    }
  }
  G.turrets = G.turrets.filter(t => t.life > 0);

  updateProjs(dt);
  updatePickups(dt);

  /* 花名册点对点连坐：锁链超距拉扯撞击，50%伤害互相同步 */
  for (const u of G.units) {
    if (!u.alive || !u.linkedTo || u.linkedT <= 0) { u.linkedTo = null; continue; }
    u.linkedT -= dt;
    const b = u.linkedTo;
    if (!b.alive || b.linkedTo !== u) { u.linkedTo = null; u.linkedT = 0; continue; }
    if (u === (u.x < b.x ? u : b)) {   // 每对只处理一次（按x坐标固定谁来算）
      const d = dist(u.x, u.y, b.x, b.y), maxD = 140;
      if (d > maxD) {
        const a = Math.atan2(b.y - u.y, b.x - u.x);
        const pull = (d - maxD) * .5;
        u.x += Math.cos(a) * pull; u.y += Math.sin(a) * pull;
        b.x -= Math.cos(a) * pull; b.y -= Math.sin(a) * pull;
        applyDamage(u, pull * .8, b, { quiet: true }); applyDamage(b, pull * .8, u, { quiet: true });
      }
    }
    if (u.linkedT <= 0) u.linkedTo = null;
  }
  /* 会议室预定表 / 健身环挑战：区域内敌人扎堆时互相碰撞眩晕 */
  for (const bz of G.burns) {
    if (!bz.roomTrap && !bz.ringStun) continue;
    bz.stunCd = (bz.stunCd || 0) - dt;
    if (bz.stunCd > 0) continue;
    const trapped = G.units.filter(t => t.alive && isFoe(bz.owner, t) && dist2(t.x, t.y, bz.x, bz.y) < bz.r * bz.r);
    if (trapped.length >= (bz.ringStun ? 1 : 2)) {
      bz.stunCd = .5;
      for (const t of trapped) t.stunT = Math.max(t.stunT, .5);
    }
  }
  for (const b of G.burns) b.t += dt;
  G.burns = G.burns.filter(b => b.t < b.life);
  for (const f of G.fx) f.t += dt;
  G.fx = G.fx.filter(f => f.t < f.life);
  for (const p of G.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= .92; p.vy *= .92; }
  G.parts = G.parts.filter(p => p.t < p.life);
  for (const f of G.floats) { f.t += dt; f.y -= 14 * dt; }
  G.floats = G.floats.filter(f => f.t < f.life);

  const pl = G.player;
  cam.x = clamp(pl.x - 320, 0, TUNE.world - 640);
  cam.y = clamp(pl.y - 180, 0, TUNE.world - 360);
  cam.shake = Math.max(0, cam.shake - dt * 18);

  endChecks(dt);
  if (state === 'playing' && G.pendingLevels > 0 && pl.alive && G.winT === undefined && G.endT <= 0) openLevelup();
}

function updateUnit(u, dt) {
  u.hurtT -= dt; u.invulnT -= dt; u.stunT -= dt;
  u.buffs.spdT -= dt; u.buffs.fireT -= dt; u.buffs.dmgT -= dt;
  /* 加班狂暴结束扣血 */
  if (u._overtimeRecoil > 0) {
    u._overtimeRecoil -= dt;
    if (u._overtimeRecoil <= 0 && u.alive) {
      const recoil = Math.round(maxHp(u) * .2);
      u.hp = Math.max(1, u.hp - recoil);
      if (u.isPlayer) { addFloat(u.x, u.y - 16, `加班后遗症 -${recoil} HP`, '#ff4f4f', 9, 1.2); addShake(3); }
    }
  }
  u.dashT -= dt;
  u.empowerT -= dt; u.reportedT -= dt; u.vulnT -= dt;
  u.reviewBoostT -= dt; u.oaSlowT -= dt;
  if (u.shield > 0) { u.shieldT -= dt; if (u.shieldT <= 0) u.shield = 0; }
  for (const k in u.curses) if (u.curses[k] > 0) u.curses[k] -= dt;
  /* OA审批流公文包：命中后延迟0.8秒引爆叠加伤害（任意单位都可能中招，通用结算） */
  if (u.oaBurstT > 0) {
    u.oaBurstT -= dt;
    if (u.oaBurstT <= 0 && u.alive) applyDamage(u, u.oaBurstDmg, u.oaBurstOwner, { quiet: true });
  }
  /* 在线状态徽章：被"已读"标记的敌人延迟引爆 */
  if (u.badgeMarkT > 0) {
    u.badgeMarkT -= dt;
    if (u.badgeMarkT <= 0 && u.alive && u.badgeMarkOwner) applyDamage(u, wpnDmg(u.badgeMarkOwner) * .5, u.badgeMarkOwner, { quiet: true });
  }

  /* 系统提示：自动补盾（补盾量随品级） */
  if (u.mods.sysPrompt) {
    u.sysT -= dt;
    if (u.sysT <= 0) {
      u.sysT = 45;
      if (u.shield < u.mods.sysPrompt) {
        u.shield = u.mods.sysPrompt; u.shieldT = 10;
        if (u.isPlayer) addFloat(u.x, u.y - 16, '系统提示：自动补盾', '#e8e4d8', 7, .8);
      }
    }
  }
  /* 大模型蒸馏技能自动施放 / 副武器 / 主动技能冷却 */
  if (u.isPlayer) {
    if (u.distills) updateDistills(u, dt);
    updateSubs(u, dt);
    u.activeCd -= dt;
    updatePersonaSkills(u, dt);
  }
  /* RAG 知识库炮台 */
  if (u.mods.rag) {
    u.ragAng += dt * 2.6;
    for (let i = 0; i < u.mods.rag; i++) {
      u.ragCds[i] -= dt;
      if (u.ragCds[i] > 0) continue;
      const da = u.ragAng + i * Math.PI;
      const dx = u.x + Math.cos(da) * 27, dy = u.y - 5 + Math.sin(da) * 27;
      const t = nearestUnit(dx, dy, 140, o => isFoe(u, o));
      if (t) {
        u.ragCds[i] = 1.0;
        spawnBullet(u, Math.atan2(t.y - dy, t.x - dx),
          { x: dx, y: dy, dmg: (6 + u.level * .5) * u.mods.dmg * u.mods.ragBoost, spd: 300, range: 180,
            color: '#67c98b', shape: 'dot', _echo: true });
      }
    }
  }
  /* 策反到期 */
  if (u.allyOwner && G.t > u.allyUntil) {
    u.allyOwner = null;
    killUnit(u, null, 'inject');
    return;
  }
  /* 职场毒瘤光环 */
  if (u.mods.auraDmg) {
    u.auraT -= dt;
    if (u.auraT <= 0) {
      u.auraT = .5;
      for (const t of G.units)
        if (isFoe(u, t) && dist2(u.x, u.y, t.x, t.y) < 100 * 100)
          applyDamage(t, u.mods.auraDmg * .5, u, { quiet: true });
    }
  }
  if (u.mods.standRegen && u.standT > 1 && u.hp < maxHp(u))
    u.hp = Math.min(maxHp(u), u.hp + u.mods.standRegen * dt);
  if (u.mods.xpPerSec) gainXp(u, u.mods.xpPerSec * dt);

  /* 圈外伤害（试用期豁免：发育期不设跑毒压力） */
  const z = G.zone;
  if (!G.trial.active && dist(u.x, u.y, z.cx, z.cy) > z.r) {
    u.zoneAcc = (u.zoneAcc || 0) + z.dps * dt;
    if (u.zoneAcc >= 1) {
      const d = u.zoneAcc; u.zoneAcc = 0;
      applyDamage(u, d, null, { cause: 'zone', quiet: !u.isPlayer });
    }
  }
  /* 燃烧区伤害 */
  for (const bz of G.burns) {
    if (isFoe(bz.owner, u) && dist2(u.x, u.y, bz.x, bz.y) < bz.r * bz.r) {
      u.burnAcc = (u.burnAcc || 0) + bz.dps * dt;
      if (u.burnAcc >= 2) { const d = u.burnAcc; u.burnAcc = 0; applyDamage(u, d, bz.owner, { cause: 'burn', quiet: true }); }
    }
  }
  if (!u.alive) return;

  if (u.isBoss) { updateBoss(u, dt); return; }
  if (u.isElite) { updateElite(u, dt); return; }
  if (u.isSummon) { updateSummon(u, dt); return; }
  if (u.isMob) { updateMob(u, dt); return; }

  let mvx = 0, mvy = 0, wantFire = false, aimA = u.aim;
  if (u.isPlayer) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) mvy -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) mvy += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mvx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mvx += 1;
    const m = Math.hypot(mvx, mvy);
    if (m > 0) { mvx /= m; mvy /= m; }
    if (touch.using) {
      /* 触屏：摇杆移动 + 自动瞄准 + 自动开火 */
      if (touch.active) {
        mvx = touch.dx; mvy = touch.dy;
        const tm = Math.hypot(mvx, mvy);
        if (tm > 1) { mvx /= tm; mvy /= tm; }
      }
      const def = wdef(u);
      const rng = Math.max(190, (def.range || 220) * 1.15);
      const tgt = nearestUnit(u.x, u.y, rng, o => isFoe(u, o));
      touch.aimTarget = tgt;
      if (tgt) {
        aimA = Math.atan2(tgt.y - u.y, tgt.x - u.x);
        wantFire = def.kind === 'charge' ? u.weapon.charge < def.chargeT - .01 : true;
      } else {
        wantFire = def.kind === 'charge' && u.weapon.charging;
      }
    } else {
      aimA = Math.atan2(mouse.y + cam.y - u.y, mouse.x + cam.x - u.x);
      const def = wdef(u);
      if (fireMode === 2 && !mouse.down) {
        /* 全托管：自动瞄准最近敌人 + 自动开火（按住鼠标可临时手动接管） */
        const rng = Math.max(190, (def.range || 220) * 1.15);
        const tgt = nearestUnit(u.x, u.y, rng, o => isFoe(u, o));
        touch.aimTarget = tgt;
        if (tgt) {
          aimA = Math.atan2(tgt.y - u.y, tgt.x - u.x);
          wantFire = def.kind === 'charge' ? u.weapon.charge < def.chargeT - .01 : true;
        } else {
          wantFire = def.kind === 'charge' && u.weapon.charging;
        }
      } else if (fireMode === 1) {
        /* 自动开火：瞄准仍靠鼠标，附近有敌人就自动扣扳机 */
        touch.aimTarget = null;
        const rng = Math.max(220, (def.range || 220) * 1.2);
        const hasFoe = !!nearestUnit(u.x, u.y, rng, o => isFoe(u, o));
        if (mouse.down) wantFire = true;
        else if (hasFoe) wantFire = def.kind === 'charge' ? u.weapon.charge < def.chargeT - .01 : true;
        else wantFire = def.kind === 'charge' && u.weapon.charging;
      } else {
        touch.aimTarget = null;
        wantFire = mouse.down;
      }
    }
  } else {
    const r = botThink(u, dt);
    mvx = r.mvx; mvy = r.mvy; wantFire = r.wantFire; aimA = r.aimA;
  }
  /* 诅咒对瞄准的影响 */
  if (u.curses.hallu > 0) aimA += Math.sin(G.t * 11 + u.x * .07) * .28;
  if (u.curses.repeat > 0) aimA = u.repeatAim;
  moveWithCollide(u, mvx, mvy, dt);
  updateWeapon(u, dt, wantFire, aimA);
}

function moveWithCollide(u, mx, my, dt) {
  if (u.stunT > 0) { mx = 0; my = 0; }
  const sp = speedOf(u);
  let vx = mx * sp, vy = my * sp;
  if (u.dashDur > 0) { vx += u.dashVx; vy += u.dashVy; u.dashDur -= dt; }
  u.x += vx * dt; u.y += vy * dt;
  const moving = Math.abs(vx) + Math.abs(vy) > 5;
  if (moving) { u.walkT += dt * 9; u.standT = 0; } else u.standT += dt;
  /* 摸鱼表演艺术家：移动/闲置状态追踪（线上响应术/假装忙碌/永动摸鱼引擎共用） */
  if (u.isPlayer) {
    u.isMoving = moving;
    if (moving) { u.moveT += dt; u.idleT = 0; } else { u.idleT += dt; u.moveT = 0; }
    if (u.mods.perpetualSlack && moving) {
      const dist = Math.min(Math.hypot(vx, vy) * dt, u.spdBase * 1.2 * dt);   // 每秒最多累计正常移速×1.2，防瞬移刷值
      u.slackMiles = (u.slackMiles || 0) + dist;
    }
  }
  for (const o of G.obstacles) {
    const nx = clamp(u.x, o.x, o.x + o.w), ny = clamp(u.y, o.y, o.y + o.h);
    const dx = u.x - nx, dy = u.y - ny, d2 = dx * dx + dy * dy;
    if (d2 < u.r * u.r) {
      if (d2 === 0) u.y = o.y - u.r;
      else { const d = Math.sqrt(d2); u.x = nx + dx / d * u.r; u.y = ny + dy / d * u.r; }
    }
  }
  u.x = clamp(u.x, 8, TUNE.world - 8);
  u.y = clamp(u.y, 12, TUNE.world - 6);
}

/* ---------- 机器人 AI ---------- */
function botThink(u, dt) {
  const b = u.bot, z = G.zone;
  b.decideT -= dt; b.provokedT -= dt;
  const distZone = dist(u.x, u.y, z.cx, z.cy);

  if (b.decideT <= 0) {
    b.decideT = rand(.25, .45);
    if (distZone > z.r - 50) {
      b.state = 'tozone';
      const a = Math.atan2(z.cy - u.y, z.cx - u.x) + rand(-.4, .4);
      const d = Math.max(80, distZone - z.r * .45);
      b.wx = u.x + Math.cos(a) * d; b.wy = u.y + Math.sin(a) * d;
    } else {
      const baseAggro = b.pers === 'juan' ? 260 : b.pers === 'norm' ? 190 : 140;
      /* 仇恨爬坡按战斗时间算：转正日空降的同事同样有热身期 */
      const ramp = Math.min(1, .1 + Math.max(0, G.t - G.trialOffset) / 120);
      const aggroR = baseAggro * ramp * (1 + .15 * z.phase);
      let tgt = null, bd = Infinity;
      if (G.trial.active) {
        /* 试用期：机器人也去刷怪（杂鱼和月度考核 Boss） */
        tgt = nearestUnit(u.x, u.y, 320, t => (t.isMob || t.isElite) && t.alive);
        if (tgt) bd = dist2(u.x, u.y, tgt.x, tgt.y);
      } else {
        /* 被打小报告的人吸引全场仇恨（小报告是群发的，感知半径与索敌无关） */
        const snitched = nearestUnit(u.x, u.y, Math.max(450, aggroR * 2), t =>
          t.reportedT > 0 && isFoe(u, t) && !t.isElite && !t.isBoss);
        if (snitched) { tgt = snitched; bd = dist2(u.x, u.y, snitched.x, snitched.y); }
        else for (const t of G.units) {
          if (!isFoe(u, t)) continue;
          if (u.isHR && (t.isBoss || t.isHR)) continue;
          const dr = aggroR * (t.isBoss ? .75 : t.mods.aggro);
          const d2 = dist2(u.x, u.y, t.x, t.y);
          if (d2 < dr * dr && d2 < bd) { bd = d2; tgt = t; }
        }
      }
      const provoked = !G.trial.active && b.provokedT > 0 && u.lastAtk && u.lastAtk.alive && isFoe(u, u.lastAtk);
      if (!tgt && provoked) { tgt = u.lastAtk; bd = dist2(u.x, u.y, tgt.x, tgt.y); }
      const dogpile = (G.trial.active && !!tgt) || (!!tgt && tgt.reportedT > 0);   // 试用期刷怪/被举报者：豁免出手门槛

      if (tgt && !G.trial.active && z.phase < 3 && ((b.pers === 'moyu' && !provoked && !dogpile) || (u.hp < maxHp(u) * .3 && b.pers !== 'juan'))) {
        /* 摸鱼怪见人就溜；残血也跑；决赛圈背水一战 */
        b.state = 'flee'; b.target = tgt;
        const a = Math.atan2(u.y - tgt.y, u.x - tgt.x) + rand(-.4, .4);
        b.wx = clamp(u.x + Math.cos(a) * 150, z.cx - z.r * .85, z.cx + z.r * .85);
        b.wy = clamp(u.y + Math.sin(a) * 150, z.cy - z.r * .85, z.cy + z.r * .85);
      } else if (tgt && (dogpile || b.pers === 'juan' || provoked || (bd < 85 * 85 && G.t - G.trialOffset >= 30) || z.phase >= 2)) {
        b.state = 'fight'; b.target = tgt;
        if (!b.strafe || Math.random() < .3) b.strafe = Math.random() < .5 ? 1 : -1;
        const ideal = (wdef(u).range || 200) * .6;
        const ta = Math.atan2(u.y - tgt.y, u.x - tgt.x) + b.strafe * .8;
        b.wx = tgt.x + Math.cos(ta) * ideal;
        b.wy = tgt.y + Math.sin(ta) * ideal;
      } else {
        b.target = null;
        let pk = null, pd = 280 * 280;
        if (!u.isHR) {
          for (const p of G.pickups) {
            if (p.type !== 'chip' && p.type !== 'item' && p.type !== 'tech') continue;
            if (p.type === 'chip') {
              if (u.weapon.leg) continue;
              const w = u.weapon;
              const useful = (p.id === w.id && w.lvl < 5) || p.lvl > w.lvl ||
                (w.lvl === 5 && findRecipe(w.id, p.id));
              if (!useful) continue;
            }
            if (p.type === 'tech') {
              const t = TECH[p.id];
              if (!t.instant && (u.tech[p.id] || 0) >= t.max) continue;
              if (PLAYER_ONLY_TECH.includes(p.id)) continue;
            }
            const d2 = dist2(u.x, u.y, p.x, p.y);
            if (d2 < pd && dist(p.x, p.y, z.cx, z.cy) < z.r * .95) { pd = d2; pk = p; }
          }
        }
        if (pk) { b.state = 'loot'; b.wx = pk.x; b.wy = pk.y; }
        else if (b.state !== 'wander' || dist2(u.x, u.y, b.wx, b.wy) < 30 * 30) {
          b.state = 'wander';
          const p = randPosInZone(G, .7);
          b.wx = p.x; b.wy = p.y;
        }
      }
    }
  }

  const dx = b.wx - u.x, dy = b.wy - u.y, dd = Math.hypot(dx, dy);
  let mvx = 0, mvy = 0;
  if (dd > 6) { mvx = dx / dd; mvy = dy / dd; }

  let wantFire = false, aimA = u.aim;
  const tgt = b.target;
  if (tgt && tgt.alive) {
    const def = wdef(u), d = dist(u.x, u.y, tgt.x, tgt.y);
    aimA = Math.atan2(tgt.y - u.y, tgt.x - u.x) + rand(-b.aimErr, b.aimErr);
    const inRange = d < (def.range || 220) * 1.05;
    if (def.kind === 'charge') {
      if (b.chargeHold > 0) { b.chargeHold -= dt; wantFire = true; }
      else if (inRange && u.weapon.cd <= 0 && !u.weapon.charging) b.chargeHold = rand(.4, 1.1);
    } else {
      /* 开火节律：打打停停，不做永动压枪机器 */
      wantFire = inRange && Math.sin(G.t * 1.7 + u.x * .13) > -.35;
    }
  } else b.target = null;
  return { mvx, mvy, wantFire, aimA };
}

/* ---------- 缩圈（时间轴从试用期结束后起算） ---------- */
function updateZone(dt) {
  if (G.trial.active || G.mode === 'endless') return;
  const bt = G.t - G.trialOffset;   // 战斗时间
  const z = G.zone, phases = G.zonePhases;   // 试用期越长时间轴越前移（割草流清场快）
  if (z.phase < phases.length && bt >= phases[z.phase].at) {
    const p = phases[z.phase];
    z.shrinking = true; z.shrinkT = 0;
    z.fromR = z.r; z.toR = TUNE.zoneR0 * p.pct;
    z.fromCx = z.cx; z.fromCy = z.cy;
    const drift = (z.fromR - z.toR) * .4;
    const a = rand(0, Math.PI * 2);
    z.toCx = clamp(z.cx + Math.cos(a) * drift, z.toR + 60, TUNE.world - z.toR - 60);
    z.toCy = clamp(z.cy + Math.sin(a) * drift, z.toR + 60, TUNE.world - z.toR - 60);
    z.dps = p.dps;
    warn(COPY.zoneWarnings[Math.min(z.phase, COPY.zoneWarnings.length - 1)]);
    SFX.zone();
    z.phase++;
    if (z.phase >= 2) unlockSubSlot();   // 0个月试用期兜底路径：转正路径打不到时靠缩圈进度解锁
    /* 缩圈绩效结算：把成长决策钉在缩圈节拍上，治后期升级断档 */
    if (G.player.alive) {
      gainXp(G.player, 15 * z.phase);
      addFloat(G.player.x, G.player.y - 22, `绩效结算 +${15 * z.phase} 经验`, '#ffe27a', 8, 1.2);
    }
  }
  if (z.shrinking) {
    z.shrinkT += dt;
    const t = Math.min(1, z.shrinkT / TUNE.shrinkDur);
    z.r = lerp(z.fromR, z.toR, t);
    z.cx = lerp(z.fromCx, z.toCx, t);
    z.cy = lerp(z.fromCy, z.toCy, t);
    if (t >= 1) z.shrinking = false;
  }
}

/* ---------- Boss：老板 ---------- */
function spawnBoss() {
  const z = G.zone;
  /* 血量锚定玩家战力指数：时机插值 + 等级 + 模组/副武器/蒸馏/传说全部计入，
     强 build 不再把终局 Boss 打成过场动画 */
  const pl = G.player;
  const techN = Object.values(pl.tech).reduce((a, b) => a + b, 0);
  const subN = Object.values(pl.subs).reduce((a, s) => a + s.lv, 0);
  const dstN = pl.distills ? Object.keys(pl.distills).length : 0;
  const bt = Math.max(0, G.t - G.trialOffset);
  const hp = Math.round(900
    + 600 * Math.min(1, Math.max(bt / TUNE.bossAt, pl.level / 15))
    + 60 * pl.level + 90 * techN + 120 * subN + 150 * dstN
    + (pl.weapon.leg ? 400 : 0));
  const b = makeUnit('老板', clamp(z.cx + rand(-100, 100), 60, TUNE.world - 60),
    clamp(z.cy + rand(-100, 100), 60, TUNE.world - 60),
    { isBoss: true, hp, spd: 55 });
  b.r = 10; b.level = 10; b.spdBase = 55;
  b.bossAI = { pieT: 2.5, burstT: 1.5, summonT: 10, shoutT: 3, touchT: 0,
    distillT: 5, distillCount: 0, distillCap: 3, distilled: [], distilledIds: [], enraged: false,
    buff: { dmg: 1, rate: 1, pies: 0, homing: 0, range: 1 } };
  G.units.push(b);
  G.boss = b; G.bossSpawned = true;
  warn('📢 紧急通知：老板亲自下场了！');
  addFeed('老板 带着期权和大饼进场了', true);
  SFX.boss(); addShake(6);
}
function spawnHR(x, y) {
  const h = makeUnit('HR·' + pick(['小美', '小帅', 'Tina', 'Jack', 'Vicky']), x, y,
    { isHR: true, hp: 60, weaponId: pick(['gemini', 'chatgpt', 'qwen']), shirt: '#9aa4b5',
      bot: { pers: 'juan', state: 'wander', wx: x, wy: y, target: null, decideT: 0, aimErr: .12, chargeHold: 0, provokedT: 9, strafe: 1 } });
  h.weapon.lvl = 2;
  G.units.push(h);
}
/* ---------- 副武器（办公室兵器，全自动索敌） ---------- */
function updateSubs(u, dt) {
  const fr = Math.min(fireRateOf(u), 1.6);   // 副武器统一吃射速但有独立上限
  for (const id in u.subs) {
    const s = u.subs[id], def = SUBS[id];
    if (id === 'monitor') {
      /* 环绕撞击：显示器回旋盾 */
      s.ang = (s.ang || 0) + dt * 3;
      const n = def.count[s.lv - 1];
      for (let i = 0; i < n; i++) {
        const a = s.ang + i * Math.PI * 2 / n;
        const mx = u.x + Math.cos(a) * 34, my = u.y - 4 + Math.sin(a) * 34;
        for (const t of G.units) {
          if (!isFoe(u, t) || dist2(mx, my, t.x, t.y) > (14 + t.r) * (14 + t.r)) continue;
          if (!t._monHit || G.t - t._monHit > .5 / fr) {
            t._monHit = G.t;
            applyDamage(t, def.dmg[s.lv - 1] * u.mods.dmg, u);
            const push = a + Math.PI / 2;   // 沿切线轻推：不再把敌人推出光环/键盘半径
            t.x += Math.cos(push) * 4; t.y += Math.sin(push) * 4;
          }
        }
      }
      continue;
    }
    if (id === 'shredder') {
      /* 贴身绞杀光环（间隔吃射速、半径吃射程模组） */
      s.t = (s.t || 0) - dt * fr;
      if (s.t <= 0) {
        s.t = .4;
        const r = def.radius[s.lv - 1] * u.mods.range;
        let hitAny = false;
        for (const t of G.units) {
          if (!isFoe(u, t) || dist2(u.x, u.y, t.x, t.y) > r * r) continue;
          applyDamage(t, def.dps[s.lv - 1] * .4 * u.mods.dmg, u, { quiet: true });
          hitAny = true;
        }
        if (hitAny && Math.random() < .5) addParts(u.x + rand(-20, 20), u.y + rand(-20, 20), '#e8e4d8', 2, 40, .4);
      }
      continue;
    }
    s.t = (s.t || 0) - dt * fr;
    if (s.t > 0) continue;
    if (id === 'keyboard') {
      const t = nearestUnit(u.x, u.y, 90, o => isFoe(u, o));
      if (!t) { s.t = .3; continue; }
      s.t = def.cd;
      const ang = Math.atan2(t.y - u.y, t.x - u.x);
      addFx({ type: 'slash', x: u.x, y: u.y - 4, ang, r: 70, spread: 1.1, color: '#c9d4e4', life: .18 });
      for (const o of G.units) {
        if (!isFoe(u, o) || dist(u.x, u.y, o.x, o.y) > 92) continue;
        let da = Math.atan2(o.y - u.y, o.x - u.x) - ang;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < 1.1) {
          applyDamage(o, def.dmg[s.lv - 1] * u.mods.dmg, u, { stun: .15 });
          const kb = s.lv >= 3 ? 18 : 10;
          o.x += Math.cos(ang) * kb; o.y += Math.sin(ang) * kb;
        }
      }
      if (nearPlayer(u.x, u.y)) SFX.hit();
    } else if (id === 'stapler') {
      s.t = def.cd;
      const mine = G.turrets.filter(tr => tr.owner === u);
      if (mine.length >= def.count[s.lv - 1]) mine[0].life = 0;   // 旧的拆掉
      G.turrets.push({ x: u.x + rand(-12, 12), y: u.y + rand(-12, 12), owner: u, lv: s.lv, cd: .3, life: def.life });
      addFloat(u.x, u.y - 16, '炮台已部署', '#c9c4b4', 6, .6);
    } else if (id === 'mug') {
      const r0 = 230 * u.mods.range;
      const t = nearestUnit(u.x, u.y, r0, o => isFoe(u, o));
      if (!t) { s.t = .4; continue; }
      s.t = def.cd;
      spawnBullet(u, Math.atan2(t.y - u.y, t.x - u.x),
        { shape: 'mugp', r: 3, spd: 240, range: clamp(dist(u.x, u.y, t.x, t.y), 40, r0), exact: true,
          dmg: 0, boom: { r: 26, dmg: def.dmg[s.lv - 1] * u.mods.dmg }, _echo: true });
    } else if (id === 'laserpen') {
      const t = nearestUnit(u.x, u.y, 270, o => isFoe(u, o));
      if (!t) { s.t = .4; continue; }
      s.t = def.cd;
      fireBeam(u, Math.atan2(t.y - u.y, t.x - u.x), 270, 3, def.dmg[s.lv - 1] * u.mods.dmg, '#ff4f4f');
      if (nearPlayer(u.x, u.y)) SFX.laser();
    } else if (id === 'oa_form') {
      /* OA审批流公文包：命中后40%减速2秒+延迟0.8秒引爆叠加伤害 */
      const t = nearestUnit(u.x, u.y, 220, o => isFoe(u, o));
      if (!t) { s.t = .4; continue; }
      s.t = def.cd;
      spawnBullet(u, Math.atan2(t.y - u.y, t.x - u.x),
        { shape: 'dot', r: 3, spd: 260, range: 220, color: '#c9d4e4',
          dmg: def.dmg[s.lv - 1] * u.mods.dmg * .4, _echo: true,
          onHitMark: { slowT: 2, burstT: .8, burstDmg: def.dmg[s.lv - 1] * u.mods.dmg * 1.6 } });
    } else if (id === 'fire_sprinkler') {
      /* 消防警报喷淋装置：部署固定喷淋区，范围内减速可叠加，敌人扎堆时定身 */
      s.t = def.cd;
      const mine = G.turrets.filter(tr => tr.owner === u && tr.kind === 'sprinkler');
      if (mine.length >= 1) mine[0].life = 0;
      G.turrets.push({ x: u.x, y: u.y, owner: u, lv: s.lv, cd: .3, life: def.life, kind: 'sprinkler' });
    } else if (id === 'meeting_room') {
      /* 会议室预定表：矩形近似为圆形减速灼烧区，2个以上敌人困在内会互相碰撞眩晕 */
      s.t = def.cd;
      const r = def.radius[s.lv - 1] * u.mods.range;
      G.burns.push({ x: u.x, y: u.y, r, dps: def.dps[s.lv - 1] * u.mods.dmg, slow: .5, life: def.life, t: 0, owner: u, color: '#6aa3ff', roomTrap: true });
    } else if (id === 'online_badge') {
      /* 在线状态徽章：移动中光环内敌人被"已读"标记，1.5秒后引爆 */
      if (!u.isMoving) { s.t = .3; continue; }
      s.t = def.cd;
      const r = 90 * u.mods.range;
      for (const t of G.units) {
        if (!isFoe(u, t) || t.badgeMarkT > 0 || dist2(u.x, u.y, t.x, t.y) > r * r) continue;
        if (Math.random() < def.markChance[s.lv - 1]) { t.badgeMarkT = 1.5; t.badgeMarkOwner = u; }
      }
    } else if (id === 'fitness_ring') {
      /* 健身环挑战：边跑边在身后布下短暂定身圈 */
      if (!u.isMoving) { s.t = .3; continue; }
      s.t = def.cd;
      G.burns.push({ x: u.x, y: u.y, r: def.radius[s.lv - 1] * u.mods.range, dps: 0, slow: .001, life: 1.2, t: 0, owner: u, color: '#c9a227', ringStun: true });
    } else if (id === 'printer') {
      /* 打印机：部署炮塔，持续射出穿透减速纸张 */
      s.t = def.cd;
      const mine = G.turrets.filter(tr => tr.owner === u && tr.kind === 'printer');
      if (mine.length >= 1) mine[0].life = 0;
      G.turrets.push({ x: u.x, y: u.y, owner: u, lv: s.lv, cd: .5, life: def.life, kind: 'printer', dmg: def.dmg[s.lv - 1] * u.mods.dmg });
    } else if (id === 'whiteboard') {
      /* 白板擦盾：周期性生成向前推进的白板（挡弹+撞击伤害） */
      s.t = def.cd;
      const ang = u.aim || 0;
      const count = def.count[s.lv - 1];
      for (let i = 0; i < count; i++) {
        G.projs.push({ owner: u, x: u.x + Math.cos(ang) * 20, y: u.y - 4 + Math.sin(ang) * 20,
          vx: Math.cos(ang) * 120, vy: Math.sin(ang) * 120, r: 8, dmg: def.dmg[s.lv - 1] * u.mods.dmg,
          range: 150, dist: 0, shape: 'shield', color: '#e8e4d8', pierce: 99, block: true, life: 1.5 });
      }
    } else if (id === 'chair') {
      /* 转椅漂移：向最近敌人冲刺，撞击伤害+击退 */
      const r0 = 250;
      const t = nearestUnit(u.x, u.y, r0, o => isFoe(u, o));
      if (!t) { s.t = .4; continue; }
      s.t = def.cd;
      const ang = Math.atan2(t.y - u.y, t.x - u.x);
      const spd = def.spd[s.lv - 1];
      addFx({ type: 'slash', x: u.x, y: u.y - 4, ang, r: 50, spread: .6, color: '#c9d4e4', life: .15 });
      /* 沿路径伤害 */
      for (const o of G.units) {
        if (!isFoe(u, o)) continue;
        const d2l = distToSeg(o.x, o.y, u.x, u.y, u.x + Math.cos(ang) * 120, u.y + Math.sin(ang) * 120);
        if (d2l < 12 + o.r) {
          applyDamage(o, def.dmg[s.lv - 1] * u.mods.dmg, u, { stun: .3 });
          o.x += Math.cos(ang) * 15; o.y += Math.sin(ang) * 15;
        }
      }
      if (nearPlayer(u.x, u.y)) SFX.dash();
    } else if (id === 'water_cooler') {
      /* 饮水机炮台：部署减速+灼伤区域 */
      s.t = def.cd;
      const r = def.radius[s.lv - 1] * u.mods.range;
      G.burns.push({ x: u.x, y: u.y, r, dps: def.dps[s.lv - 1] * u.mods.dmg, slow: .5, life: def.life, t: 0, owner: u, color: '#38d3e8' });
    } else if (id === 'projector') {
      /* 投影仪光炮：周期性宽光束扫射（穿透+持续伤害） */
      const t = nearestUnit(u.x, u.y, 280, o => isFoe(u, o));
      if (!t) { s.t = .4; continue; }
      s.t = def.cd;
      const ang = Math.atan2(t.y - u.y, t.x - u.x);
      const w = 6 + s.lv * 2;
      fireBeam(u, ang, 280, w, def.dmg[s.lv - 1] * u.mods.dmg, '#16dbcc');
      if (nearPlayer(u.x, u.y)) SFX.laser();
    } else if (id === 'phone') {
      /* 电话弹射：周期性弹射电话机（弹跳多次） */
      const t = nearestUnit(u.x, u.y, 200, o => isFoe(u, o));
      if (!t) { s.t = .4; continue; }
      s.t = def.cd;
      const ang = Math.atan2(t.y - u.y, t.x - u.x);
      const bounces = s.lv + 1;
      spawnBullet(u, ang, { shape: 'dot', r: 4, spd: 280, range: 200, color: '#c9d4e4',
        dmg: def.dmg[s.lv - 1] * u.mods.dmg, pierce: bounces, bounce: bounces, _echo: true });
    }
  }
}

/* ---------- 主动技能（Q 键） ---------- */
export function castActive() {
  const pl = G && G.player;
  if (!pl || !pl.alive || !pl.active || state !== 'playing') return;
  if (pl.activeCd > 0) { SFX.deny(); return; }
  const id = pl.active.id, lv = pl.active.lv, def = ACTIVES[id];
  pl.activeCd = def.cd[lv - 1];
  if (id === 'blink') {
    let mx = 0, my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
    if (touch.using && touch.active) { mx = touch.dx; my = touch.dy; }
    const m = Math.hypot(mx, my);
    if (!m) { mx = Math.cos(pl.aim); my = Math.sin(pl.aim); } else { mx /= m; my /= m; }
    let d0 = def.dist[lv - 1];
    if (pl.curses.overfit > 0) {   // 过拟合诅咒同样限制瞬移，精英反制不被架空
      d0 *= .4;
      addFloat(pl.x, pl.y - 18, '陷入局部最优！', '#ff8f5a', 7, .7);
    }
    addParts(pl.x, pl.y, '#38d3e8', 10, 70, .4);
    pl.x = clamp(pl.x + mx * d0, 10, TUNE.world - 10);
    pl.y = clamp(pl.y + my * d0, 12, TUNE.world - 8);
    pl.invulnT = Math.max(pl.invulnT, .3);
    addParts(pl.x, pl.y, '#38d3e8', 14, 80, .5);
    SFX.dash();
  } else if (id === 'layoff') {
    /* 固定伤害 + 目标最大生命百分比：后期不再是死卡，对 Boss 单发上限 150 */
    const len = 300 * pl.mods.range;
    const x2 = pl.x + Math.cos(pl.aim) * len, y2 = pl.y + Math.sin(pl.aim) * len;
    addFx({ type: 'beam', x1: pl.x, y1: pl.y - 4, x2, y2, w: 10, color: '#ff4f4f', life: .25 });
    for (const t of G.units) {
      if (!isFoe(pl, t)) continue;
      if (distToSeg(t.x, t.y, pl.x, pl.y, x2, y2) < 5 + t.r) {
        let d = (def.dmg[lv - 1] + maxHp(t) * def.pct[lv - 1]) * pl.mods.dmg;
        if (t.isBoss) d = Math.min(d, 150);
        applyDamage(t, d, pl);
      }
    }
    addFloat(pl.x, pl.y - 20, '裁员通知已送达', '#ff4f4f', 8, 1);
    addShake(4);
    SFX.laser();
  } else if (id === 'bing_shield') {
    pl.invulnT = Math.max(pl.invulnT, def.dur[lv - 1]);
    addFloat(pl.x, pl.y - 20, '这饼真香（无敌）', '#ffcf33', 8, 1);
    SFX.pickup();
  } else if (id === 'teambuild') {
    const r = def.radius[lv - 1];
    addFx({ type: 'boom', x: pl.x, y: pl.y, r, color: '#ffcf33', life: .4 });
    for (const t of G.units) {
      if (!isFoe(pl, t) || t.isBoss || dist2(pl.x, pl.y, t.x, t.y) > r * r) continue;
      const a = Math.atan2(t.y - pl.y, t.x - pl.x);
      t.x = pl.x + Math.cos(a) * 42;
      t.y = pl.y + Math.sin(a) * 42;
      t.stunT = Math.max(t.stunT, .4);
      t.vulnT = 1.5;   // 被拉来开会的人 1.5 秒内受伤 +20%
    }
    addFloat(pl.x, pl.y - 20, '来都来了！', '#ffcf33', 9, 1);
    SFX.explo();
  } else if (id === 'force_mute') {
    /* 强制五分钟静音：扇形范围眩晕+减速+碰撞体积临时增大制造互相卡位 */
    const r = def.range[lv - 1];
    for (const t of G.units) {
      if (!isFoe(pl, t)) continue;
      const d2v = dist2(pl.x, pl.y, t.x, t.y);
      if (d2v > r * r) continue;
      const rel = Math.atan2(t.y - pl.y, t.x - pl.x);
      let dd = rel - pl.aim; while (dd > Math.PI) dd -= Math.PI * 2; while (dd < -Math.PI) dd += Math.PI * 2;
      if (Math.abs(dd) > 1.0) continue;
      t.stunT = Math.max(t.stunT, 1.5);
      t.oaSlowT = Math.max(t.oaSlowT, 2);
      t.r *= 1.3; t._muteWiden = (t._muteWiden || 0) + 1;
    }
    addFx({ type: 'boom', x: pl.x, y: pl.y, r, color: '#9ad1ff', life: .3 });
    addFloat(pl.x, pl.y - 20, '麦克风已被管理员静音', '#9ad1ff', 8, 1);
    SFX.zone();
  } else if (id === 'linked_fate') {
    /* 花名册点对点连坐：锁链连接两个敌人，超距拉扯撞击；觉醒后按生命排序把全场敌人编织成完整锁链 */
    if (pl.mods.__evoDismissalChain) {
      const all = G.units.filter(t => isFoe(pl, t) && dist2(pl.x, pl.y, t.x, t.y) < 500 * 500)
        .sort((a, b) => a.hp - b.hp).slice(0, 6);
      for (let i = 0; i < all.length - 1; i++) {
        all[i].linkedTo = all[i + 1]; all[i].linkedT = 12;
        all[i + 1].linkedTo = all[i]; all[i + 1].linkedT = 12;
      }
      pl.buffs.spdT = Math.max(pl.buffs.spdT, 12); pl.buffs.spdM = Math.max(pl.buffs.spdM, 1.15);
      pl.buffs.dmgT = Math.max(pl.buffs.dmgT, 12); pl.buffs.dmgM = Math.max(pl.buffs.dmgM, 1.1);
      addFloat(pl.x, pl.y - 20, '永续裁员委员会：全场连坐！', '#ff6a6a', 10, 1.3);
      SFX.boss(); addShake(5);
    } else {
      const near = G.units.filter(t => isFoe(pl, t) && dist2(pl.x, pl.y, t.x, t.y) < 420 * 420)
        .sort((a, b) => dist2(pl.x, pl.y, a.x, a.y) - dist2(pl.x, pl.y, b.x, b.y)).slice(0, 2);
      if (near.length === 2) {
        const [a, b] = near;
        a.linkedTo = b; b.linkedTo = a; a.linkedT = 8; b.linkedT = 8;
        addFx({ type: 'beam', x1: a.x, y1: a.y, x2: b.x, y2: b.y, w: 4, color: '#ffcf33', life: .6 });
        addFloat(pl.x, pl.y - 20, '从今天起，你们两个互相负责', '#ffcf33', 8, 1.1);
        SFX.laser();
      } else {
        addFloat(pl.x, pl.y - 16, '附近人手不够，连坐不了', '#9aa4b5', 7, .8);
      }
    }
  } else if (id === 'temp_offline') {
    /* 临时下线：1秒完全隐身+无敌+移速×2+穿墙冲刺，逃生位移 vs 摸鱼瞬移的进攻位移 */
    let mx = Math.cos(pl.aim), my = Math.sin(pl.aim);
    if (keys.has('KeyW') || keys.has('ArrowUp')) my = -1, mx = 0;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my = 1, mx = 0;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx = -1, my = 0;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx = 1, my = 0;
    pl.invulnT = Math.max(pl.invulnT, def.dur[lv - 1]);
    pl.buffs.spdT = Math.max(pl.buffs.spdT, def.dur[lv - 1]);
    pl.buffs.spdM = Math.max(pl.buffs.spdM, 2);
    pl.x = clamp(pl.x + mx * 60, 10, TUNE.world - 10);
    pl.y = clamp(pl.y + my * 60, 12, TUNE.world - 8);
    addParts(pl.x, pl.y, '#d8e8ff', 12, 80, .5);
    addFloat(pl.x, pl.y - 20, '临时下线', '#d8e8ff', 8, 1);
    SFX.dash();
  } else if (id === 'slack_appeal') {
    /* 摸鱼申诉信：最近5秒没输出=真摸鱼，回大量血+下次致命伤害保留1血；有输出则效果减半 */
    const reallySlacking = G.t - (pl.lastDealT || -999) > 5;   // 真正5秒没对敌人造成过伤害，不是没被命中
    const heal = reallySlacking ? maxHp(pl) * .4 : maxHp(pl) * .2;
    pl.hp = Math.min(maxHp(pl), pl.hp + heal);
    pl.mods.revive = Math.max(pl.mods.revive, reallySlacking ? 1 : .5);
    addFloat(pl.x, pl.y - 20, reallySlacking ? '真摸鱼认证通过！' : '装忙没蒙混过去…', reallySlacking ? '#7ee08a' : '#9aa4b5', 8, 1.1);
    SFX.pickup();
  } else if (id === 'overtime_burst') {
    /* 加班狂暴：伤害×2+射速×2，结束后掉20%血 */
    const dur = def.dur[lv - 1];
    pl.buffs.dmgT = Math.max(pl.buffs.dmgT, dur); pl.buffs.dmgM = Math.max(pl.buffs.dmgM, 2);
    pl.buffs.fireT = Math.max(pl.buffs.fireT, dur); pl.buffs.fireM = Math.max(pl.buffs.fireM, 2);
    pl._overtimeRecoil = dur;  /* 记录结束时间，在 update 里扣血 */
    addFloat(pl.x, pl.y - 20, '今晚不睡了！', '#ff4f4f', 10, 1.2);
    addShake(3); SFX.boss();
  } else if (id === 'dept_merge') {
    /* 部门合并：全屏拉扯+碰撞爆炸 */
    const r = def.radius[lv - 1];
    addFx({ type: 'boom', x: pl.x, y: pl.y, r, color: '#6aa3ff', life: .5 });
    for (const t of G.units) {
      if (!isFoe(pl, t) || t.isBoss) continue;
      if (dist2(pl.x, pl.y, t.x, t.y) > r * r) continue;
      const a = Math.atan2(pl.y - t.y, pl.x - t.x);
      t.x += Math.cos(a) * 60; t.y += Math.sin(a) * 60;
      t.stunT = Math.max(t.stunT, 1);
      applyDamage(t, 15 * pl.mods.dmg, pl);
    }
    addFloat(pl.x, pl.y - 20, '两个部门合一个！', '#6aa3ff', 10, 1.2);
    addShake(6); SFX.explo();
  } else if (id === 'whisteblow') {
    /* 吹哨举报：全屏音波，固定伤害+目标当前血量百分比 */
    addFx({ type: 'boom', x: pl.x, y: pl.y, r: 600, color: '#ffcf33', life: .4 });
    for (const t of G.units) {
      if (!isFoe(pl, t)) continue;
      let d = (def.dmg[lv - 1] + t.hp * def.pct[lv - 1]) * pl.mods.dmg;
      if (t.isBoss) d = Math.min(d, 200);
      applyDamage(t, d, pl);
    }
    addFloat(pl.x, pl.y - 20, '匿名邮件已群发！', '#ffcf33', 10, 1.3);
    addShake(8); SFX.zone();
  } else if (id === 'ai_replace') {
    /* AI替代通知：全场敌人停止移动和攻击 */
    const dur = def.dur[lv - 1];
    for (const t of G.units) {
      if (!isFoe(pl, t)) continue;
      t.stunT = Math.max(t.stunT, t.isBoss ? dur * .5 : dur);
      t._aiReplaced = dur;
    }
    addFloat(pl.x, pl.y - 20, '你的岗位已被AI接管', '#4ec9a0', 10, 1.3);
    SFX.levelup();
  }
  bridge.notify();
}

/* ---------- 转正日：同事空降入场（按试用期长短补发育，不白白落后） ---------- */
function spawnLateBots() {
  unlockSubSlot();   // 转正里程碑：解锁副武器第4槽
  if (!G.latentBots) return;
  const wIds = Object.keys(WEAPONS);
  const months = G.trial.months;
  for (const lb of G.latentBots) {
    let bx = TUNE.world / 2, by = TUNE.world / 2;
    for (let tries = 0; tries < 30; tries++) {
      const p = randPosInZone(G, .85);
      if (dist2(p.x, p.y, G.player.x, G.player.y) > 380 * 380) { bx = p.x; by = p.y; break; }
    }
    const u = makeUnit(lb.name, bx, by, { weaponId: pick(wIds), bot: {
      pers: lb.pers, state: 'wander', wx: bx, wy: by, target: null, decideT: rand(0, .4),
      aimErr: lb.pers === 'juan' ? .07 : lb.pers === 'norm' ? .13 : .2,
      chargeHold: 0, provokedT: 0, strafe: 1,
    } });
    u.weapon.lvl = clamp(1 + Math.ceil(months * .7), 1, 5);
    G.units.push(u);
    /* 追赶发育锚定玩家实际收益的 60%：玩家刷得越狠，同事补得越多 */
    gainXp(u, Math.round((G.trialXpEarned || 30 * months) * .6) + randi(0, 20));
    for (let k = 0; k < Math.floor(months / 2); k++)
      applyTechPickup(u, pick(Object.keys(TECH).filter(t => !PLAYER_ONLY_TECH.includes(t) && !TECH[t].instant)), rollTier(false));
  }
  G.latentBots = null;
}

/* ---------- 试用期杂鱼（办公室琐事） ---------- */
let mobGroupSeq = 0;
function spawnMob(type, x, y, isChild = false, month = 1) {
  const m = MOBS[type];
  const k = 1 + .25 * (month - 1);   // 琐事随月份升级：血量/伤害/经验同步爬坡
  const u = makeUnit(m.name, x, y, { hp: Math.ceil((isChild ? m.hp / 2 : m.hp) * k), spd: m.spd, shirt: '#9aa4b5' });
  u.isMob = true; u.mobType = type; u.isSplitChild = isChild;
  u.mobMonth = month;
  u.mobTouch = m.touch * (1 + .08 * (month - 1));
  u.mobXp = m.xp + (month - 1);
  u.spr = SPR[m.spr];
  u.r = 3; u.level = 0; u.spdBase = m.spd * rand(.9, 1.1);
  if (m.shieldHp) { u.mobShieldHp = m.shieldHp * k; u.mobShieldBroken = false; u.mods.dmgTaken = .2; }
  if (m.dodgeOverride) u.mods.dodge = m.dodgeOverride;
  G.units.push(u);
  return u;
}
/* 临时工外包大军：6只一组刷出，共享一个存活计数对象，最后1只死亡额外结算奖励经验 */
function spawnMobGroup(type, x, y, month = 1) {
  const m = MOBS[type];
  const shared = { alive: m.groupSize };
  const out = [];
  for (let i = 0; i < m.groupSize; i++) {
    const a = rand(0, Math.PI * 2), rr = rand(0, 24);
    const u = spawnMob(type, x + Math.cos(a) * rr, y + Math.sin(a) * rr, false, month);
    u.mobGroup = shared;
    out.push(u);
  }
  return out;
}
function updateMob(u, dt) {
  const m = MOBS[u.mobType];
  /* 深夜加班灯：静止环境怪，不追击，只在玩家进入光照范围时持续刷新易伤（复用 vulnT） */
  if (m.lampR) {
    if (dist2(u.x, u.y, G.player.x, G.player.y) < m.lampR * m.lampR) G.player.vulnT = Math.max(G.player.vulnT, .3);
    return;
  }
  /* 需求评审会：据点型不移动，给附近其它杂鱼持续刷新"评审通过"加速标记（speedOf 里读取），
     怪死亡后标记自然到期，不需要手动复位，避免"评审会死了但杂鱼还留有加速buff"的残留状态 */
  if (m.reviewR) {
    for (const o of G.units) if (o !== u && o.isMob && o.alive && dist2(u.x, u.y, o.x, o.y) < m.reviewR * m.reviewR) o.reviewBoostT = .6;
    return;
  }
  /* 深夜返工提醒：受伤攒"返工值"，攒够触发0.8秒高频冲刺，随后2秒虚弱期更好打——
     逼玩家瞬间爆发而非持续磨血，真实hp条全程如实反映伤害，不绕开 applyDamage 假设 */
  if (m.reworkThreshold) {
    if (u._lastHp === undefined) u._lastHp = u.hp;
    if (u.hp < u._lastHp) u.reworkMeter = (u.reworkMeter || 0) + (u._lastHp - u.hp);
    u._lastHp = u.hp;
    if (!u.reworkPhase && u.reworkMeter >= m.reworkThreshold) {
      u.reworkMeter = 0; u.reworkPhase = 'sprint'; u.reworkPhaseT = .8;
    } else if (u.reworkPhase === 'sprint') {
      u.reworkPhaseT -= dt;
      if (u.reworkPhaseT <= 0) { u.reworkPhase = 'exhausted'; u.reworkPhaseT = 2; u.mods.dmgTaken = 1.4; }
    } else if (u.reworkPhase === 'exhausted') {
      u.reworkPhaseT -= dt;
      if (u.reworkPhaseT <= 0) { u.reworkPhase = null; u.mods.dmgTaken = 1; }
    }
  }
  /* 加急会议提醒：无接触伤害，靠自身位置周期推送小范围减速+dot区（复用 G.burns 燃烧区结算，
     speedOf()/updateUnit() 里已有的 isFoe+dist2 判定天然生效，不需要新的伤害管线） */
  if (m.auraR) {
    u.auraPushT = (u.auraPushT || 0) - dt;
    if (u.auraPushT <= 0) {
      u.auraPushT = .3;
      G.burns.push({ x: u.x, y: u.y, r: m.auraR, dps: m.auraDot, slow: m.auraSlowPct, life: .45, t: 0, owner: u, color: '#ff9440' });
    }
  }
  /* 会议邀请：周期性"改期"消失+短暂无敌+就近重新出现，逼玩家不能对单只挂机磨 */
  if (m.vanishEvery) {
    u.vanishCd = (u.vanishCd === undefined ? m.vanishEvery : u.vanishCd) - dt;
    if (u.invulnT <= 0 && u.vanishCd <= 0) {
      u.invulnT = m.vanishDur;
      u.vanishCd = m.vanishEvery;
      const va = rand(0, Math.PI * 2);
      u.x = clamp(u.x + Math.cos(va) * 40, 30, TUNE.world - 30);
      u.y = clamp(u.y + Math.sin(va) * 40, 30, TUNE.world - 30);
    }
  }
  u.mobHitT -= dt;
  if (!u.mobTarget || !u.mobTarget.alive || Math.random() < .008) {
    u.mobTarget = nearestUnit(u.x, u.y, 600, t => isWorker(t) && t.alive && !t.isSummon);
  }
  const t = u.mobTarget;
  if (!t) { moveWithCollide(u, 0, 0, dt); return; }
  const a = Math.atan2(t.y - u.y, t.x - u.x) + (m.jig ? Math.sin(G.t * 5 + u.x * .1) * .6 : 0);
  u.aim = a;
  moveWithCollide(u, Math.cos(a), Math.sin(a), dt);
  if (u.mobHitT <= 0 && u.mobTouch > 0 && dist(u.x, u.y, t.x, t.y) < u.r + t.r + 2) {
    u.mobHitT = u.reworkPhase === 'sprint' ? .33 : 1;   // 深夜返工提醒冲刺期：触碰频率×3
    applyDamage(t, u.mobTouch || m.touch, u);
  }
}

/* ---------- AI 替身：亲手击杀小 Boss 后蒸馏出的召唤物 ---------- */
function spawnSummon(owner, bossType) {
  /* 同时只养一个：新替身上岗，旧替身优化下岗 */
  const old = G.units.find(u => u.isSummon && u.alive && u.allyOwner === owner);
  if (old) {
    old.alive = false;
    addParts(old.x, old.y, '#d9b3ff', 10, 70, .5);
    addFeed(`旧替身 ${old.name} 已被优化下岗`, false);
  }
  const e = ELITES[bossType];
  /* 近战型替身（卷王实习生）要冲脸，多给点血 */
  const s = makeUnit(`AI·${e.name}替身`, owner.x + rand(12, 20), owner.y + rand(-8, 8),
    { hp: bossType === 'intern' ? 100 : 60, spd: 150, shirt: ELITE_SKINS[bossType] || '#d9b3ff' });
  s.isSummon = true; s.summonType = bossType;
  s.allyOwner = owner; s.allyUntil = Infinity;   // 替身不会离职（除非被打报废）
  s.r = 4; s.level = 3;
  G.units.push(s);
  addFeed(`你 部署了 ${s.name}（1 名同事已被 AI 替代）`, true);
  addParts(s.x, s.y, '#d9b3ff', 20, 100, .7);
  SFX.fuse();
}
function updateSummon(u, dt) {
  const owner = u.allyOwner;
  if (!owner || !owner.alive) { u.alive = false; return; }
  const dOwner = dist(u.x, u.y, owner.x, owner.y);
  const tgt = nearestUnit(u.x, u.y, 190, t => isFoe(u, t));
  let mvx = 0, mvy = 0;
  /* 跟随主人；卷王替身会主动扑向敌人 */
  if (u.summonType === 'intern' && tgt && dOwner < 220) {
    const a = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    mvx = Math.cos(a); mvy = Math.sin(a);
    u.aim = a;
  } else if (dOwner > 42) {
    const a = Math.atan2(owner.y - u.y, owner.x - u.x);
    mvx = Math.cos(a); mvy = Math.sin(a);
    u.aim = a;
  } else if (tgt) u.aim = Math.atan2(tgt.y - u.y, tgt.x - u.x);
  moveWithCollide(u, mvx, mvy, dt);

  u.sumT -= dt;
  if (u.sumT > 0) return;
  const T = u.summonType;
  const om = owner.mods.dmg;   // 替身伤害随主人成长
  if (T === 'ppt') {
    if (!tgt) { u.sumT = .5; return; }
    u.sumT = 3;
    spawnBullet(u, Math.atan2(tgt.y - u.y, tgt.x - u.x), { dmg: 7 * om, spd: 210, range: 200, shape: 'slide', r: 3, color: '#e8e4d8', _echo: true });
  } else if (T === 'meeting') {
    if (!tgt) { u.sumT = .5; return; }
    u.sumT = 7;
    G.burns.push({ x: tgt.x, y: tgt.y, r: 30, dps: 2 * om, slow: .3, life: 3, t: 0, owner: u, color: '#6aa3ff' });
  } else if (T === 'snitch') {
    if (!tgt || tgt.isElite || tgt.isBoss || tgt.isHR || !tgt.bot) { u.sumT = 1; return; }
    u.sumT = 10;
    tgt.reportedT = 4;
    addFloat(tgt.x, tgt.y - 20, '已被替身举报', '#ff4f4f', 7, 1);
  } else if (T === 'upman') {
    u.sumT = 6;
    owner.empowerT = 2;
    owner.hp = Math.min(maxHp(owner), owner.hp + 4);
    if (owner.isPlayer) addFloat(owner.x, owner.y - 16, '替身赋能 +4HP', '#c9a227', 6, .7);
  } else if (T === 'intern') {
    if (!tgt || dist(u.x, u.y, tgt.x, tgt.y) > u.r + tgt.r + 4) { u.sumT = .2; return; }
    u.sumT = 1;
    applyDamage(tgt, 6 * om, u);
  } else if (T === 'attendance') {
    u.sumT = 8;
    let hitAny = false;
    for (const t2 of G.units) {
      if (!isFoe(u, t2) || dist2(u.x, u.y, t2.x, t2.y) > 80 * 80) continue;
      if (t2.standT > .45) { applyDamage(t2, 8 * om, u); hitAny = true; }
    }
    if (hitAny) addFx({ type: 'boom', x: u.x, y: u.y, r: 80, color: '#ffcf33', life: .25 });
  } else u.sumT = 1;
}

/* ---------- 老板反向蒸馏：随机复制玩家的技能/模组（不夺走） ---------- */
const BOSS_STEAL_LINES = ['你的方案不错，现在是我的了。', '这个思路很好，下次开会我来讲。', '年轻人的东西，我学得很快。'];
function bossDistill(boss) {
  const pl = G.player;
  const A = boss.bossAI, bb = A.buff;
  const pool = [
    ...Object.keys(pl.skills).map(id => ({ kind: 'skill', id })),
    ...Object.keys(pl.tech).map(id => ({ kind: 'tech', id })),
  ].filter(p => !A.distilledIds.includes(p.id));   // 同一能力只偷一次
  if (!pool.length) {
    addFloat(boss.x, boss.y - 34, '“你身上没什么可学的。”', '#d9b3ff', 8, 2);
    return;
  }
  const picked = pick(pool);
  A.distilledIds.push(picked.id);
  /* 能走通用单位系统的直接走（闪避/复活/光环/炮台/护盾都是真的） */
  const EFFECTS = {
    juanwang: () => { bb.dmg *= 1.2; return '弹幕伤害+20%'; },
    moyu_master: () => { boss.spdBase *= 1.15; return '移速+15%'; },
    desk_fengshui: () => { boss.hpBase += 250; boss.hp += 250; return '+250 血'; },
    resume_gilding: () => { boss.hpBase += 200; boss.hp += 200; return '+200 血'; },
    pua_immunity: () => { boss.mods.dmgTaken *= .85; return '受伤-15%'; },
    fubao_996: () => { bb.rate *= 1.2; return '攻速+20%'; },
    blame_master: () => { boss.mods.dodge = 1 - (1 - boss.mods.dodge) * .8; return '20%闪避'; },
    n_plus_one: () => { boss.mods.revive = 1; return '获得一次复活'; },
    quit_threat: () => { boss.mods.lowHpSpd += .3; return '残血加速'; },
    huabing: () => { boss.mods.killHeal += 30; return '击杀回血'; },
    toxic_aura: () => { boss.mods.auraDmg += 3; return '获得毒瘤光环'; },
    paid_toilet: () => { boss.mods.standRegen += 5; return '站定回血'; },
    temp: () => { boss.mods.crit += .2; return '20%暴击'; },
    quant: () => { bb.rate *= 1.15; return '攻速+15%'; },
    kvcache: () => { bb.rate *= 1.15; return '攻速+15%'; },
    fewshot: () => { bb.pies += 4; return '环形大饼+4'; },
    attention: () => { bb.homing = 2.2; return '大饼追踪'; },
    ctxwin: () => { bb.range *= 1.25; return '弹幕射程+25%'; },
    sysprompt: () => { boss.shield = 120; boss.shieldT = 9999; return '+120 护盾'; },
    rag: () => { boss.mods.rag = 2; return '召唤知识库炮台'; },
  };
  const skillDef = SKILLS.find(s => s.id === picked.id);
  const label = picked.kind === 'skill' ? (skillDef ? skillDef.name : picked.id) : TECH[picked.id].name;
  const fx = EFFECTS[picked.id];
  const effectDesc = fx ? fx() : (bb.dmg *= 1.08, boss.spdBase *= 1.05, '学了个皮毛');
  A.distilled.push(label);
  /* DPS 镜像：不管玩家靠什么系统变强，Boss 弹幕按其综合火力指数加成 30% 级别 */
  const pw = pl.mods.dmg * Math.min(4, pl.mods.fireRate) * (1 + pl.mods.multishot * pl.mods.echoMult * .6);
  bb.dmg = Math.min(3, bb.dmg * (1 + Math.min(.4, .08 * pw)));
  addFx({ type: 'bolt', pts: [{ x: pl.x, y: pl.y - 6 }, { x: boss.x, y: boss.y - 10 }], color: '#b665ff', life: .5 });
  addFloat(boss.x, boss.y - 34, `“${pick(BOSS_STEAL_LINES)}”`, '#d9b3ff', 8, 2.2);
  addFeed(`老板 蒸馏了你的「${label}」（${effectDesc}）`, true);
  addShake(4);
  SFX.fuse();
}

function updateBoss(u, dt) {
  const A = u.bossAI, bb = A.buff;
  const tgt = nearestUnit(u.x, u.y, 99999, t => t.alive && !t.isBoss && !t.isHR && !t.isElite && !t.isMob);
  if (!tgt) return;
  const d = dist(u.x, u.y, tgt.x, tgt.y);
  const a = Math.atan2(tgt.y - u.y, tgt.x - u.x);
  u.aim = a;
  let mvx = 0, mvy = 0;
  if (d > 110) { mvx = Math.cos(a); mvy = Math.sin(a); }
  moveWithCollide(u, mvx, mvy, dt);
  u.walkT += dt * 6;

  /* 反向蒸馏：开场 5 秒后第一次，之后每 18 秒（狂暴后上限 +1） */
  A.distillT -= dt;
  if (A.distillT <= 0 && A.distillCount < A.distillCap && G.player.alive) {
    A.distillT = 18;
    A.distillCount++;
    bossDistill(u);
  }
  /* 半血狂暴：这季度谁都别想好过 */
  if (!A.enraged && u.hp < maxHp(u) * .5) {
    A.enraged = true;
    A.distillCap = 4; A.distillT = Math.min(A.distillT, 1);
    bb.rate *= 1.4; bb.pies += 6;
    warn('💢 老板进入狂暴："这季度谁都别想好过！"');
    addShake(6); SFX.boss();
    BGM.enrageBoss();
  }

  const r = bb.rate;
  A.pieT -= dt * r; A.burstT -= dt * r; A.summonT -= dt; A.shoutT -= dt; A.touchT -= dt;
  if (A.pieT <= 0) {
    A.pieT = 4;
    for (let i = 0; i < 12 + bb.pies; i++)
      spawnBullet(u, i / (12 + bb.pies) * Math.PI * 2 + rand(-.05, .05),
        { dmg: 12 * bb.dmg, spd: 135, range: 330 * bb.range, shape: 'pie', r: 4, color: '#ffcf33', pierce: 0 });
    if (nearPlayer(u.x, u.y)) SFX.explo();
  }
  if (A.burstT <= 0 && d < 330) {
    A.burstT = 2.2;
    for (let i = -1; i <= 1; i++)
      spawnBullet(u, a + i * .18, { dmg: 10 * bb.dmg, spd: 220, range: 350 * bb.range, shape: 'pie', r: 3, color: '#ffcf33', homing: bb.homing });
  }
  if (A.summonT <= 0) {
    A.summonT = 18;
    if (G.units.filter(t => t.isHR && t.alive).length < 4) {
      spawnHR(u.x - 24, u.y); spawnHR(u.x + 24, u.y);
      addFeed('老板 拉了两个 HR 进会', true);
    }
  }
  if (A.shoutT <= 0) {
    A.shoutT = 6;
    addFloat(u.x, u.y - 30, `“${pick(COPY.bossLines)}”`, '#d9b3ff', 8, 2.2);
    if (d < 140) {
      const push = Math.atan2(tgt.y - u.y, tgt.x - u.x);
      tgt.x += Math.cos(push) * 34; tgt.y += Math.sin(push) * 34;
      applyDamage(tgt, 5, u);
      addFx({ type: 'boom', x: u.x, y: u.y, r: 60, color: '#b665ff', life: .3 });
    }
  }
  if (A.touchT <= 0 && d < u.r + tgt.r + 4) {
    A.touchT = .8;
    applyDamage(tgt, 15 * bb.dmg, u);
    const push = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    tgt.x += Math.cos(push) * 22; tgt.y += Math.sin(push) * 22;
  }
}

/* ---------- 精英野怪 ---------- */
const ELITE_SKINS = {
  hallu: null,               // 用幽灵精灵
  overfit: '#c0392b',
  injector: '#5b2f8e',
  align: '#7f8c9a',
  ppt: '#e8e4d8',            // 白衬衫路演装
  upman: '#c9a227',          // 金色马甲
  snitch: '#556677',
};
function spawnElite(type, near, hpMult = 1) {
  const e = ELITES[type];
  let pos;
  if (near) {
    /* 定向投放（月度考核：冲着你来） */
    const a = rand(0, Math.PI * 2);
    pos = { x: clamp(near.x + Math.cos(a) * 320, 40, TUNE.world - 40),
            y: clamp(near.y + Math.sin(a) * 320, 40, TUNE.world - 40) };
  } else {
    /* 取 20 个候选点中离所有活人最远的——终圈半径极小时退化为刷最远点而非随机贴脸 */
    pos = randPosInZone(G, .8);
    let bestD = -1;
    for (let tries = 0; tries < 20; tries++) {
      const cand = randPosInZone(G, .8);
      let minD = Infinity;
      for (const u of G.units) if (u.alive) minD = Math.min(minD, dist2(u.x, u.y, cand.x, cand.y));
      if (minD > bestD) { bestD = minD; pos = cand; }
      if (bestD > 160 * 160) break;
    }
  }
  const u = makeUnit(e.name, pos.x, pos.y, { hp: Math.round(e.hp * hpMult), spd: e.spd, shirt: ELITE_SKINS[type] || '#c9a0f5' });
  u.isElite = true; u.eliteType = type; u.eliteTier = e.tier; u.level = e.level; u.spdBase = e.spd;
  u.spr = type === 'hallu' ? SPR.ghost : workerSprite(ELITE_SKINS[type]);
  if (type === 'overfit') u.r = 7;
  if (e.tier === 2) u.r = 6;
  G.units.push(u);
  if (e.tier === 2) { warn(e.intro); SFX.zone(); }   // 小 Boss 用全屏通告
  else addFeed(e.intro, false);
  return u;
}
function updateElite(u, dt) {
  const e = ELITES[u.eliteType];
  u.touchT -= dt;

  /* PPT 大师的光锥爆发（预警到期即结算，独立于索敌） */
  if (u.eliteType === 'ppt' && u.coneWarnT > 0) {
    u.coneWarnT -= dt;
    if (u.coneWarnT <= 0) {
      addFx({ type: 'coneflash', x: u.x, y: u.y, ang: u.coneAng, spread: .55, len: 150, color: '#ffffff', life: .25 });
      for (const t of G.units) {
        if (!isFoe(u, t)) continue;
        const d2 = dist(u.x, u.y, t.x, t.y);
        if (d2 > 150) continue;
        let da = Math.atan2(t.y - u.y, t.x - u.x) - u.coneAng;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        if (Math.abs(da) < .55) {
          applyDamage(t, 18, u, { stun: .8 });
          if (t.isPlayer) addFloat(t.x, t.y - 22, '被迫听完整场演示', '#e8e4d8', 7, 1);
        }
      }
      if (nearPlayer(u.x, u.y)) SFX.explo();
    }
  }

  const tgt = nearestUnit(u.x, u.y, 900, t => isFoe(u, t) && !t.isBoss && !t.isMob);
  if (!tgt) { moveWithCollide(u, 0, 0, dt); return; }
  const d = dist(u.x, u.y, tgt.x, tgt.y);
  const a = Math.atan2(tgt.y - u.y, tgt.x - u.x);
  if (!(u.eliteType === 'ppt' && u.coneWarnT > 0)) u.aim = a;   // 光锥预警期间锁定朝向
  let mvx = Math.cos(a), mvy = Math.sin(a);

  if (u.eliteType === 'hallu') {
    const ja = a + Math.sin(G.t * 7 + u.x * .1) * 1.2;
    mvx = Math.cos(ja); mvy = Math.sin(ja);
  } else if (u.eliteType === 'injector') {
    u.injT -= dt;
    if (d < 150) { mvx = -mvx; mvy = -mvy; }
    else if (d < 240) { const ta = a + Math.PI / 2; mvx = Math.cos(ta) * .7; mvy = Math.sin(ta) * .7; }
    if (u.injT <= 0 && d < 320) {
      u.injT = 1.6;
      spawnBullet(u, a + rand(-.06, .06),
        { dmg: 7, spd: 260, range: 340, shape: 'streak', color: '#c58fff',
          curse: { id: pick(['repeat', 'overflow']), dur: 5 } });
    }
  } else if (u.eliteType === 'ppt') {
    /* 保持中距离路演 */
    if (d < 120) { mvx = -mvx; mvy = -mvy; }
    else if (d < 220) { const ta = a + Math.PI / 2; mvx = Math.cos(ta) * .6; mvy = Math.sin(ta) * .6; }
    if (u.coneWarnT > 0) { mvx = 0; mvy = 0; }        // 演示中站定
    u.slideT -= dt;
    if (u.slideT <= 0 && d < 300 && u.coneWarnT <= 0) {
      u.slideT = 2.2;
      for (let i = -1; i <= 1; i++)
        spawnBullet(u, a + i * .25, { dmg: 9, spd: 200, range: 320, shape: 'slide', r: 3, color: '#e8e4d8' });
    }
    u.coneCd -= dt;
    if (u.coneCd <= 0 && d < 140 && u.coneWarnT <= 0) {
      u.coneCd = 8;
      u.coneWarnT = .8;                                 // 0.8 秒黄色预警
      u.coneAng = a;
      addFx({ type: 'cone', x: u.x, y: u.y, ang: a, spread: .55, len: 150, color: '#ffcf33', life: .8 });
      if (nearPlayer(u.x, u.y)) SFX.deny();
    }
  } else if (u.eliteType === 'upman') {
    /* 躲着人走，专心给牛马上 buff */
    if (d < 200) { mvx = -mvx; mvy = -mvy; }
    else { mvx *= .3; mvy *= .3; }
    u.auraTickT -= dt;
    if (u.auraTickT <= 0) {
      u.auraTickT = .5;
      for (const t of G.units) {
        if (!t.alive || !t.bot || t.isHR || t.allyOwner === G.player) continue;
        if (dist2(u.x, u.y, t.x, t.y) < 170 * 170) {
          t.empowerT = 1.0;                             // 攻速移速光环（见 wpnDmg/speedOf）
          if (t.hp < maxHp(t)) t.hp = Math.min(maxHp(t), t.hp + 1.5);
        }
      }
    }
    u.pokeT -= dt;
    if (u.pokeT <= 0 && d < 180) {
      u.pokeT = 1.8;
      spawnBullet(u, a, { dmg: 6, spd: 240, range: 200, shape: 'dot', color: '#c9a227' });
    }
  } else if (u.eliteType === 'snitch') {
    /* 远远放风筝，定期打小报告 */
    if (d < 200) { mvx = -mvx; mvy = -mvy; }
    else if (d < 300) { const ta = a + Math.PI / 2; mvx = Math.cos(ta) * .8; mvy = Math.sin(ta) * .8; }
    u.reportT -= dt;
    if (u.reportT <= 0) {
      u.reportT = 8;
      const victim = nearestUnit(u.x, u.y, 350, t => isFoe(u, t) && !t.isBoss && !t.isElite && !t.isHR);
      if (victim) {
        victim.reportedT = 6;
        addFloat(victim.x, victim.y - 24, victim.isPlayer ? '你被举报了！全场集火！' : '已被举报', '#ff4f4f', victim.isPlayer ? 9 : 7, 1.5);
        addFeed(`小报告专家 举报了 ${victim.name}`, victim.isPlayer);
        if (victim.isPlayer) { SFX.deny(); addShake(3); }
      }
    }
  } else if (u.eliteType === 'meeting') {
    /* 中距离风筝，扔"日历邀请"造会议圈 */
    if (d < 140) { mvx = -mvx; mvy = -mvy; }
    else if (d < 240) { const ta = a + Math.PI / 2; mvx = Math.cos(ta) * .6; mvy = Math.sin(ta) * .6; }
    if (u.invitePending) {
      u.invitePending.t -= dt;
      if (u.invitePending.t <= 0) {
        const ip = u.invitePending;
        u.invitePending = null;
        G.burns.push({ x: ip.x, y: ip.y, r: 45, dps: 3, slow: .4, life: 4, t: 0, owner: u, color: '#6aa3ff' });
        for (const t2 of G.units) {
          if (!isFoe(u, t2) || dist2(ip.x, ip.y, t2.x, t2.y) > 45 * 45) continue;
          applyDamage(t2, 6, u);
          if (t2.isPlayer) addFloat(t2.x, t2.y - 20, '被拉进会了', '#6aa3ff', 7, 1);
        }
      }
    } else {
      u.inviteT = (u.inviteT === undefined ? 3 : u.inviteT) - dt;
      if (u.inviteT <= 0 && d < 320) {
        u.inviteT = 6;
        u.invitePending = { x: tgt.x + rand(-20, 20), y: tgt.y + rand(-20, 20), t: .7 };
        addFx({ type: 'ringwarn', x: u.invitePending.x, y: u.invitePending.y, r: 45, color: '#6aa3ff', life: .7 });
      }
    }
  } else if (u.eliteType === 'intern') {
    /* 血越少越狼性：越跑越快（但封顶 145——必须留给玩家风筝空间） */
    const rage = 1 - u.hp / maxHp(u);
    const mult = Math.min(1 + rage * .9, 145 / u.spdBase);
    mvx *= mult; mvy *= mult;
  } else if (u.eliteType === 'attendance') {
    if (u.rollWarnT !== undefined) {
      /* 点名进行中：站定读秒，静止者按摸鱼处理 */
      u.rollWarnT -= dt;
      mvx = 0; mvy = 0;
      if (u.rollWarnT <= 0) {
        u.rollWarnT = undefined;
        addFx({ type: 'boom', x: u.x, y: u.y, r: 150, color: '#ffcf33', life: .3 });
        for (const t2 of G.units) {
          if (!isFoe(u, t2) || dist2(u.x, u.y, t2.x, t2.y) > 150 * 150) continue;
          if (t2.standT > .45) {
            applyDamage(t2, 15, u);
            addFloat(t2.x, t2.y - 20, '摸鱼被抓！', '#ffcf33', 7, 1);
          }
        }
      }
    } else {
      mvx *= .7; mvy *= .7;
      u.rollT = (u.rollT === undefined ? 4 : u.rollT) - dt;
      if (u.rollT <= 0 && d < 200) {
        u.rollT = 7;
        u.rollWarnT = .9;
        addFx({ type: 'ringwarn', x: u.x, y: u.y, r: 150, color: '#ffcf33', life: .9 });
        if (nearPlayer(u.x, u.y)) SFX.deny();
      }
    }
  }

  moveWithCollide(u, mvx, mvy, dt);
  u.walkT += dt * 6;
  if (e.touch && u.touchT <= 0 && d < u.r + tgt.r + 3) {
    u.touchT = u.eliteType === 'hallu' ? .9 : 1.1;
    const touchDmg = e.touch + (u.eliteType === 'intern' ? (1 - u.hp / maxHp(u)) * 14 : 0);   // 狼性成长
    applyDamage(tgt, touchDmg, u);
    if (e.curse) applyCurse(tgt, e.curse, e.curseDur);
    const push = Math.atan2(tgt.y - u.y, tgt.x - u.x);
    tgt.x += Math.cos(push) * 14; tgt.y += Math.sin(push) * 14;
  }
}

/* ---------- 子弹 ---------- */
function updateProjs(dt) {
  for (const p of G.projs) {
    if (p.dead) continue;
    if (p.homing) {
      const t = nearestUnit(p.x, p.y, 170, o => isFoe(p.owner, o));
      if (t) {
        const want = Math.atan2(t.y - p.y, t.x - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = clamp(diff, -p.homing * dt, p.homing * dt);
        const na = cur + turn;
        p.vx = Math.cos(na) * p.spd; p.vy = Math.sin(na) * p.spd;
      }
    }
    if (p.boomerang && p.boomerang.phase === 1) {
      const o = p.owner;
      if (!o.alive) { p.dead = true; continue; }
      const a = Math.atan2(o.y - p.y, o.x - p.x);
      p.vx = Math.cos(a) * p.spd; p.vy = Math.sin(a) * p.spd;
      if (dist2(p.x, p.y, o.x, o.y) < 100) { p.dead = true; continue; }
    }
    if (p.zap) {
      p.zapT -= dt;
      if (p.zapT <= 0) {
        p.zapT = p.zap.cd;
        const t = nearestUnit(p.x, p.y, 120, o => isFoe(p.owner, o));
        if (t) {
          const mult = p.boomerang && p.boomerang.phase === 1 ? 2 : 1;
          chainZap(p.owner, p.x, p.y, t, p.zap.chains, p.zap.dmg * mult, .85, mult === 2 ? .5 : 0);
        }
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.dist += p.spd * dt;

    for (const t of G.units) {
      if (!isFoe(p.owner, t) || p.hit.has(t)) continue;
      if (p.fromBoss && (t.isBoss || t.isHR)) continue;
      /* 试用期：同事的子弹直接穿过同事 */
      if (G.trial.active && isWorker(p.owner) && isWorker(t)) continue;
      const rr = p.r + t.r;
      if (dist2(p.x, p.y, t.x, t.y) < rr * rr) {
        /* 蒸馏被动「对齐立场·mini」：玩家 25% 概率挡下正面子弹 */
        if (t.isPlayer && t.distills && t.distills.align && Math.random() < .25) {
          const rel2 = Math.atan2(p.y - t.y, p.x - t.x);
          let dd2 = rel2 - t.aim;
          while (dd2 > Math.PI) dd2 -= Math.PI * 2;
          while (dd2 < -Math.PI) dd2 += Math.PI * 2;
          if (Math.abs(dd2) < 1.05) {
            addParts(p.x, p.y, '#c9d4e4', 3, 40, .3);
            addFloat(t.x, t.y - 18, '已对齐', '#9aa4b5', 6, .5);
            if (p.boom) { doBoom(p); break; }
            p.dead = true; break;
          }
        }
        /* 对齐守卫：正面挡下一切子弹 */
        if (t.eliteType === 'align') {
          const rel = Math.atan2(p.y - t.y, p.x - t.x);
          let dd = rel - t.aim;
          while (dd > Math.PI) dd -= Math.PI * 2;
          while (dd < -Math.PI) dd += Math.PI * 2;
          if (Math.abs(dd) < 1.2) {
            addParts(p.x, p.y, '#c9d4e4', 3, 40, .3);
            if (nearPlayer(p.x, p.y) && Math.random() < .35) addFloat(t.x, t.y - 18, '已对齐', '#9aa4b5', 6, .5);
            if (p.boom) { doBoom(p); break; }
            p.dead = true; break;
          }
        }
        p.hit.add(t);
        if (p.boom) { doBoom(p); break; }
        applyDamage(t, p.dmg, p.owner, { stun: p.stun });
        if (p.curse) applyCurse(t, p.curse.id, p.curse.dur);
        /* OA审批流公文包：命中后延迟引爆叠加伤害+减速 */
        if (p.onHitMark) {
          t.oaSlowT = p.onHitMark.slowT; t.oaBurstT = p.onHitMark.burstT;
          t.oaBurstDmg = p.onHitMark.burstDmg; t.oaBurstOwner = p.owner;
        }
        if (p.hit.size > p.pierce) { p.dead = true; break; }
      }
    }
    if (p.dead) continue;
    if (p.dist >= p.maxDist) {
      if (p.boom) { doBoom(p); continue; }
      if (p.boomerang && p.boomerang.phase === 0) {
        p.boomerang.phase = 1; p.hit.clear(); p.dist = 0; p.maxDist = Infinity;
        continue;
      }
      p.dead = true; continue;
    }
    if (p.x < 4 || p.y < 4 || p.x > TUNE.world - 4 || p.y > TUNE.world - 4) {
      if (p.boom) doBoom(p);
      else if (p.boomerang && p.boomerang.phase === 0) {
        p.boomerang.phase = 1; p.hit.clear(); p.dist = 0; p.maxDist = Infinity;
        continue;
      }
      else p.dead = true;
    }
  }
  G.projs = G.projs.filter(p => !p.dead);
}
function doBoom(p) {
  p.dead = true;
  explodeAt(p.x, p.y, p.boom.r, p.boom.dmg, p.owner, p.color, p.boom.burn || null);
}

/* ---------- 拾取 ---------- */
function updatePickups(dt) {
  const pl = G.player;
  G.hoverChip = null;
  let hoverBest = 18 * 18;
  for (const p of G.pickups) {
    if (p.dead) continue;   // 已被消耗的拾取物不得再次生效（换枪掉落的"幽灵芯片"曾借此刷级）
    p.bob += dt * 4;
    if ((p.type === 'xp' || p.type === 'heal') && pl.alive) {
      const d2 = dist2(p.x, p.y, pl.x, pl.y);
      if (d2 < 52 * 52 && (p.type === 'xp' || pl.hp < maxHp(pl))) {
        const a = Math.atan2(pl.y - p.y, pl.x - p.x);
        p.x += Math.cos(a) * 170 * dt; p.y += Math.sin(a) * 170 * dt;
      }
    }
    for (const u of G.units) {
      if (!u.alive || u.isBoss || u.isElite || u.isSummon || u.isMob) continue;   // 替身/杂鱼不抢补给
      const rr = u.r + 7;
      if (dist2(p.x, p.y, u.x, u.y) >= rr * rr) continue;
      if (p.type === 'sample') {
        if (!u.isPlayer) continue;   // AI 替身样本只有玩家能用
        p.dead = true;
        spawnSummon(u, p.boss);
        break;
      }
      if (p.type === 'tech') {
        if (u.isHR) continue;
        const t = TECH[p.id];
        if (!t.instant && (u.tech[p.id] || 0) >= t.max) continue;
        if (!u.isPlayer && PLAYER_ONLY_TECH.includes(p.id)) continue;
        p.dead = true;
        applyTechPickup(u, p.id, p.tier || 1);
        break;
      }
      if (p.type === 'xp') {
        if (u.isHR) continue;   // HR 不配吃期权
        p.dead = true;
        gainXp(u, p.amt);
        if (u.isPlayer) { addFloat(p.x, p.y - 8, `+${p.amt}`, '#ffe27a', 6, .5); SFX.pickup(); }
        break;
      }
      if (p.type === 'heal') {
        if (u.hp >= maxHp(u)) continue;   // 满血留给需要的人
        p.dead = true;
        u.hp = Math.min(maxHp(u), u.hp + p.amt);
        if (u.isPlayer) addFloat(p.x, p.y - 8, `+${p.amt}`, '#7ee08a', 6, .5);
        break;
      }
      if (p.type === 'item') {
        if (u.isHR) continue;
        p.dead = true;
        useItem(u, p.id);
        break;
      }
      /* chip */
      if (u.isHR) continue;
      if (u.isPlayer) {
        if (!u.weapon.leg && p.id === u.weapon.id) {
          p.dead = true;
          if (u.weapon.lvl < 5) {
            u.weapon.lvl++;
            addFloat(u.x, u.y - 18, `${WEAPONS[p.id].name} → Lv.${u.weapon.lvl}${u.weapon.lvl === 5 ? '（满级！）' : ''}`, '#ffcf33', 8, 1);
            SFX.chip();
          } else {
            gainXp(u, 15);
            addFloat(u.x, u.y - 18, '重复芯片 → +15 经验', '#9aa4b5', 7, .8);
            SFX.pickup();
          }
        }
      } else {
        botChip(u, p);
      }
      break;
    }
  }
  if (pl.alive) {
    for (const p of G.pickups) {
      if (p.dead || p.type !== 'chip') continue;
      if (p.id === pl.weapon.id && !pl.weapon.leg) continue;
      const d2 = dist2(p.x, p.y, pl.x, pl.y);
      if (d2 < hoverBest) { hoverBest = d2; G.hoverChip = p; }
    }
  }
  G.pickups = G.pickups.filter(p => !p.dead);
}
function botChip(u, p) {
  const w = u.weapon;
  if (w.leg) return;
  if (p.id === w.id) {
    if (w.lvl < 5) { w.lvl++; p.dead = true; }
    return;
  }
  if (w.lvl === 5) {
    const leg = findRecipe(w.id, p.id);
    if (leg) {
      p.dead = true;
      w.leg = leg;
      addFeed(`${u.name} 融合出了传说武器「${LEGENDS[leg].name}」！`, true);
      addParts(u.x, u.y, LEGENDS[leg].color, 24, 120, .8);
      if (nearPlayer(u.x, u.y)) SFX.fuse();
      return;
    }
  }
  if (p.lvl > w.lvl) {
    spawnChip(G, w.id, w.lvl, u.x, u.y);
    u.weapon = { ...w, id: p.id, lvl: p.lvl, leg: null, cd: 0, charge: 0, charging: false };
    p.dead = true;
  }
}

/* ---------- 玩家操作（供 React / 按键调用） ---------- */
export function playerSwap() {
  const p = G && G.hoverChip, pl = G && G.player;
  if (!p || !pl || !pl.alive) return;
  spawnChip(G, pl.weapon.id, pl.weapon.leg ? 5 : pl.weapon.lvl, pl.x + rand(-6, 6), pl.y + rand(-6, 6));
  pl.weapon = { id: p.id, lvl: p.lvl, leg: null, cd: 0, charge: 0, charging: false, pillarT: 3, droneAng: 0, droneCds: [0, 0, 0, 0] };
  p.dead = true;
  addFloat(pl.x, pl.y - 18, `换上 ${WEAPONS[p.id].name} Lv.${p.lvl}`, '#f2efe6', 8, .9);
  SFX.swap();
  bridge.notify();
}
export function playerFuse() {
  const p = G && G.hoverChip, pl = G && G.player;
  if (!p || !pl || !pl.alive || pl.weapon.leg || pl.weapon.lvl < 5) return SFX.deny();
  const leg = findRecipe(pl.weapon.id, p.id);
  if (!leg) return SFX.deny();
  p.dead = true;
  pl.weapon.leg = leg;
  pl.weapon.cd = 0;
  addFeed(`你 融合出了传说武器「${LEGENDS[leg].name}」！`, true);
  addFloat(pl.x, pl.y - 22, `「${LEGENDS[leg].name}」`, LEGENDS[leg].color, 10, 1.6);
  addParts(pl.x, pl.y, LEGENDS[leg].color, 34, 140, .9);
  addShake(5);
  SFX.fuse();
  bridge.notify();
}
export function playerDash() {
  const pl = G && G.player;
  if (!pl || !pl.alive || !pl.mods.dashCd || pl.dashT > 0) return;
  if (pl.curses.overfit > 0) { addFloat(pl.x, pl.y - 16, '陷入局部最优，动不了！', '#ff8f5a', 7, .7); return; }
  let mx = 0, my = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (touch.using && touch.active) { mx = touch.dx; my = touch.dy; }
  const m = Math.hypot(mx, my);
  if (!m) { mx = Math.cos(pl.aim); my = Math.sin(pl.aim); }
  else { mx /= m; my /= m; }
  pl.dashVx = mx * 330; pl.dashVy = my * 330;
  pl.dashDur = .16;
  pl.dashT = pl.mods.dashCd;
  /* 冲刺 = 进攻位移：落地 0.5 秒射速 +40%（与保命向的瞬移形成互补） */
  pl.buffs.fireT = Math.max(pl.buffs.fireT, .5);
  pl.buffs.fireM = Math.max(pl.buffs.fireM, 1.4);
  addParts(pl.x, pl.y, '#f2efe6', 8, 60, .4);
  SFX.dash();
}

/* ---------- 金币系统（localStorage 持久化） ---------- */
export function loadGold() {
  try { return parseInt(localStorage.getItem('niuma_gold') || '0', 10) || 0; } catch (e) { return 0; }
}
function saveGold(v) {
  try { localStorage.setItem('niuma_gold', String(v)); } catch (e) { /* ignore */ }
}
export function loadEndlessBest() {
  try { return parseInt(localStorage.getItem('niuma_endless_best') || '0', 10) || 0; } catch (e) { return 0; }
}
function saveEndlessBest(wave) {
  try {
    const best = loadEndlessBest();
    if (wave > best) { localStorage.setItem('niuma_endless_best', String(wave)); return true; }
  } catch (e) { /* ignore */ }
  return false;
}
/* 击杀获得金币 */
function earnGold(amount) {
  if (!G) return;
  G.goldEarned += amount;
}

/* ---------- 无尽模式波次生成 ---------- */
function updateEndless(dt) {
  if (G.mode !== 'endless') return;
  const g = G;
  /* 统计存活杂鱼数量 */
  g.endlessMobsAlive = g.units.filter(u => u.alive && u.isMob).length;
  /* 波次计时器 */
  g.endlessWaveT -= dt;
  if (g.endlessWaveT <= 0 && g.endlessMobsAlive < 20 + g.endlessWave * 2) {
    g.endlessWave++;
    const wc = waveComp(Math.min(7, 1 + Math.floor(g.endlessWave / 2)));
    const burst = wc.burst + Math.floor(g.endlessWave * 1.5);
    g.endlessBurstLeft = Math.min(burst, 40);
    g.endlessWaveT = Math.max(12, 30 - g.endlessWave * 0.5);
    warn(`第 ${g.endlessWave} 波来袭！`);
    SFX.zone();
    /* 每波奖励金币 */
    earnGold(5 + g.endlessWave);
    addFloat(g.player.x, g.player.y - 22, `+${5 + g.endlessWave} 金币`, '#ffcf33', 9, 1.2);
  }
  /* 分批涌入 */
  if (g.endlessBurstLeft > 0) {
    const wc = waveComp(Math.min(7, 1 + Math.floor(g.endlessWave / 2)));
    const types = wc.types;
    /* 无尽模式高波次时数值倍增 */
    const hpMul = 1 + g.endlessWave * 0.15;
    const dmgMul = 1 + g.endlessWave * 0.08;
    for (let i = 0; i < 3 && g.endlessBurstLeft > 0; i++) {
      const id = pick(types);
      const def = MOBS[id];
      if (!def) continue;
      const a = rand(0, Math.PI * 2);
      const rr = rand(200, 400);
      const mx = clamp(g.player.x + Math.cos(a) * rr, 30, TUNE.world - 30);
      const my = clamp(g.player.y + Math.sin(a) * rr, 30, TUNE.world - 30);
      spawnMob(id, mx, my, false, g.endlessWave);
      g.endlessBurstLeft--;
    }
  }
}

/* ---------- 终局判定 ---------- */
function endChecks(dt) {
  if (G.endT > 0) {
    G.endT -= dt;
    if (G.endT <= 0) {
      if (G.mode === 'endless') {
        G.newEndlessBest = saveEndlessBest(G.endlessWave);
        const gold = G.goldEarned;
        saveGold(loadGold() + gold);
        G.totalGold = loadGold();
      } else {
        G.newBest = saveBest(G.playerRank, G.kills);
        if (G.newBest) SFX.levelup();
      }
      setState('dead');
    }
    return;
  }
  if (!G.player.alive) return;
  if (G.mode === 'endless') return;  /* 无尽模式没有胜利条件 */
  /* Boss 双门槛：战斗时间 300s 或场上只剩 3 个牛马——保证多数对局都能见到老板 */
  if (!G.bossSpawned && !G.trial.active && (G.t - G.trialOffset >= 300 || aliveWorkers() <= 3)) spawnBoss();
  if (G.winT === undefined && aliveWorkers() === 1 && G.bossSpawned && G.bossDead) {
    G.winT = 1.2;
    G.winLine = pick(COPY.winLines);
    G.pendingLevels = 0;
  }
  if (G.winT !== undefined) {
    G.winT -= dt;
    if (G.winT <= 0) {
      G.newBest = saveBest(1, G.kills);
      setState('win');
    }
  }
}

/* ---------- 升级三选一（混合卡池：白卡技能 / 蓝卡副武器 / 紫卡主动 / 金卡精修） ---------- */
let levelChoices = [];
export const getLevelChoices = () => levelChoices;
/* ---------- 槽位容量修复：里程碑事件解锁副武器第4槽 ----------
 * 触发点：转正（spawnLateBots）或 0 个月试用期时 zone.phase>=2（两条路径互斥，各自覆盖对方
 * 无法触发的极端玩法，见设计文档 3.1 节）。解锁时弹出一次性"入职大礼包"：从未装备的副武器里
 * 保底抽 1 件，不占用常规三选一权重池。 */
function unlockSubSlot() {
  const pl = G.player;
  if (!pl || !pl.alive || pl.subSlotCount >= 4) return;   // 幂等：已解锁则不重复触发
  pl.subSlotCount = 4;
  warn('🎁 入职大礼包：副武器槽 +1，可以从没装备过的兵器里选一件了');
  const unowned = Object.keys(SUBS).filter(id => !pl.subs[id]);
  if (!unowned.length) return;   // 极端情况：已拥有全部副武器，无需额外弹窗
  levelChoices = shuffle(unowned).slice(0, 3).map(id => {
    const def = SUBS[id];
    return { kind: 'sub', id, name: `入职大礼包：${def.name}`, eff: def.eff[0], tag: def.tag, w: 1 };
  });
  G.pendingLevels = 1;
  setState('levelup');
}
function buildDraftPool(pl) {
  const cards = [];
  for (const s of SKILLS) {
    if ((pl.skills[s.id] || 0) < s.max && (!s.valid || s.valid(pl)))
      cards.push({ kind: 'skill', id: s.id, ref: s, name: s.name, eff: s.eff, tag: s.tag, max: s.max, w: 1 });
  }
  const ownedSubs = Object.keys(pl.subs);
  for (const id in SUBS) {
    const def = SUBS[id], cur = pl.subs[id];
    /* 决赛圈近战新卡打折（远程对枪环境近战难成型） */
    const meleeLate = ['keyboard', 'monitor', 'shredder'].includes(id) && G.zone.phase >= 2 ? .5 : 1;
    if (cur) {
      if (cur.lv < def.maxLv)
        cards.push({ kind: 'sub', id, name: `${def.name} Lv.${cur.lv + 1}`, eff: def.eff[cur.lv], tag: def.tag, w: 1.6 });   // 在养的优先出现
    } else if (ownedSubs.length < (pl.subSlotCount || MAX_SUB_SLOTS)) {
      cards.push({ kind: 'sub', id, name: `新装备：${def.name}`, eff: def.eff[0], tag: def.tag, w: .8 * meleeLate });
    }
  }
  if (!pl.active) {
    for (const id in ACTIVES)
      cards.push({ kind: 'active', id, name: `主动技能：${ACTIVES[id].name}`, eff: ACTIVES[id].eff[0], tag: ACTIVES[id].tag, w: .7 });
  } else if (pl.active.lv < 3) {
    const d = ACTIVES[pl.active.id];
    cards.push({ kind: 'active', id: pl.active.id, name: `${d.name} Lv.${pl.active.lv + 1}`, eff: d.eff[pl.active.lv], tag: d.tag, w: 1.3 });
  }
  return cards;
}
function openLevelup() {
  const pl = G.player;
  const cards = buildDraftPool(pl);
  /* 加权无放回抽 3 张 */
  const picked = [];
  while (picked.length < (G.extraCard ? 4 : 3) && cards.length) {
    const total = cards.reduce((a, c) => a + c.w, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < cards.length; idx++) { r -= cards[idx].w; if (r <= 0) break; }
    picked.push(cards.splice(Math.min(idx, cards.length - 1), 1)[0]);
  }
  /* 软保底：连续 3 次三选一没出蓝/紫卡，则强制塞一张（构筑不再全靠脸） */
  const hasGear = picked.some(c => c.kind !== 'skill');
  if (!hasGear) {
    G.dryDrafts = (G.dryDrafts || 0) + 1;
    if (G.dryDrafts >= 3) {
      const gear = cards.filter(c => c.kind !== 'skill').sort((a, b) => b.w - a.w)[0];
      if (gear && picked.length) { picked[picked.length - 1] = gear; G.dryDrafts = 0; }
    }
  } else G.dryDrafts = 0;
  while (picked.length < 3) picked.push({ kind: 'skill', id: '_coffee' + picked.length, name: '茶水间补给', eff: '回复 40 HP',
    tag: '没什么可学的了，喝口咖啡接着卷。', ref: null, w: 1 });
  /* 10% 概率金色「精修版」（仅普通技能卡） */
  levelChoices = picked.map(c => ({ ...c, rare: c.kind === 'skill' && !!c.ref && Math.random() < .1 }));
  setState('levelup');
}
/* 简历刷新卡：三选一免费重抽 */
export function rerollLevelup() {
  if (state !== 'levelup' || !G || !(G.rerollCredits > 0)) return;
  G.rerollCredits--;
  SFX.swap();
  openLevelup();
}
export function pickLevelChoice(i) {
  const s = levelChoices[i];
  if (!s || state !== 'levelup') return;
  const pl = G.player;
  if (s.kind === 'sub') {
    if (pl.subs[s.id]) pl.subs[s.id].lv++;
    else pl.subs[s.id] = { lv: 1, t: 0, ang: rand(0, 6) };
    addFloat(pl.x, pl.y - 22, `装备：${SUBS[s.id].name}`, '#6aa3ff', 8, 1);
  } else if (s.kind === 'active') {
    if (pl.active && pl.active.id === s.id) pl.active.lv++;
    else { pl.active = { id: s.id, lv: 1 }; pl.activeCd = 1; }
    addFloat(pl.x, pl.y - 22, `主动技能：${ACTIVES[s.id].name}（按 Q）`, '#b665ff', 8, 1.2);
  } else if (s.ref) {
    applySkill(pl, s.ref);
    if (s.rare && (pl.skills[s.id] || 0) < s.ref.max) {
      applySkill(pl, s.ref);
      addFloat(pl.x, pl.y - 24, '精修版：双倍生效！', '#c9a227', 9, 1.3);
      SFX.fuse();
    }
  } else pl.hp = Math.min(maxHp(pl), pl.hp + 40);
  G.pendingLevels--;
  SFX.pickup();
  checkEvolutions(pl);
  if (G.pendingLevels > 0) openLevelup();
  else setState('playing');
}
/* ---------- 觉醒系统：技能满级+搭档融合成质变效果，统一收敛在这里判定 ---------- */
function checkEvolutions(pl) {
  pl.evolved = pl.evolved || {};
  for (const e of EVOLUTIONS) {
    if (pl.evolved[e.id]) continue;
    if ((pl.skills[e.needSkillId] || 0) < e.needSkillLv) continue;
    let hasPartner = false;
    if (e.needPartnerType === 'skill') hasPartner = (pl.skills[e.needPartnerId] || 0) >= (e.needPartnerLv || 1);
    else if (e.needPartnerType === 'sub') hasPartner = !!pl.subs[e.needPartnerId];
    else if (e.needPartnerType === 'active') hasPartner = !!(pl.active && pl.active.id === e.needPartnerId);
    if (!hasPartner) continue;
    pl.evolved[e.id] = true;
    /* 每个觉醒的具体效果是专属 mods 标记位，运行时在对应技能/副武器/主动的逻辑里读取 */
    if (e.id === 'evo_blame_furnace') pl.mods.blameReflectPct = .8;
    else if (e.id === 'evo_dismissal_committee') pl.mods.__evoDismissalChain = true;
    else if (e.id === 'evo_online_offline') pl.mods.__evoOnlineOffline = true;
    else if (e.id === 'evo_pretend_not_seen') pl.mods.__evoFakeDiligenceUpgrade = true;
    warn(`✨ 觉醒：${e.name}！${e.desc}`);
    addFloat(pl.x, pl.y - 30, `觉醒：${e.name}`, '#ffcf33', 11, 1.6);
    SFX.fuse(); addShake(5);
  }
}

/* ---------- 状态机 / 全局操作 ---------- */
export function startGame(mode) {
  initAudio();
  BGM.init();
  cancelPendingSfx();
  bridge.emit('feed-clear');
  const gm = mode || (typeof localStorage !== 'undefined' && localStorage.getItem('niuma_mode')) || 'battle';
  const upgrades = computeUpgrades(loadShopUpgrades());
  if (gm === 'endless') {
    G = newGame(6, 'endless');   /* 6 个月试用期作为热身，之后无尽波 */
    G.trial.active = false; G.trialOffset = 0;  /* 直接到无尽模式 */
    setState('playing');
    warn('无尽模式：没有缩圈，没有终点，活到最后一波！');
    applyShopUpgrades(upgrades);
    return;
  }
  let months = 3;
  try { months = parseInt(localStorage.getItem('niuma_trial') ?? '3', 10); } catch (e) { /* ignore */ }
  months = clamp(isNaN(months) ? 3 : months, 0, 6);
  G = newGame(months, 'battle');
  setState('playing');
  warn(months > 0
    ? `HR：签到成功。试用期 ${months} 个月，期间同事互不伤害，先把琐事清了。`
    : 'HR：签到成功，欢迎参加本季度大逃杀。');
  applyShopUpgrades(upgrades);
}

/* 应用商城永久升级到当前游戏状态 */
function applyShopUpgrades(up) {
  if (!G || !G.player) return;
  const pl = G.player;
  if (up.hpBonus) { pl.hp += up.hpBonus; pl.hpBase += up.hpBonus; }
  if (up.spdBonus) { pl.spdBase *= (1 + up.spdBonus); }
  if (up.dmgBonus) { pl.mods.dmg *= (1 + up.dmgBonus); }
  if (up.fireRateBonus) { pl.mods.fireRate *= (1 + up.fireRateBonus); }
  if (up.startShield) { pl.shield = up.startShield; pl.shieldT = 10; }
  if (up.xpBonus) { G.xpBonus = up.xpBonus; } else { G.xpBonus = 0; }
  if (up.startLevel) {
    for (let i = 0; i < up.startLevel; i++) {
      pl.level++;
      G.pendingLevels++;
    }
  }
  if (up.startItems) {
    for (let i = 0; i < up.startItems; i++) {
      spawnItem(G, undefined, pl.x + rand(-20, 20), pl.y + rand(-20, 20));
    }
  }
  if (up.extraCard) { G.extraCard = true; }
  if (up.chooseWeapon) {
    try {
      const wId = localStorage.getItem('niuma_chosen_weapon');
      if (wId && WEAPONS[wId]) {
        G.player.weapon.id = wId;
        G.player.weapon.lvl = 1;
      }
    } catch (e) { /* ignore */ }
  }
}
export function backToMenu() { setState('menu'); }
export function togglePause() {
  if (state === 'playing') setState('paused');
  else if (state === 'paused') setState('playing');
}

export function handleKey(code) {
  if (code === 'KeyM') { bridge.emit('mute-toggle'); return; }
  if (state === 'playing') {
    if (code === 'KeyE') playerSwap();
    else if (code === 'KeyF') playerFuse();
    else if (code === 'KeyQ') castActive();
    else if (code === 'KeyT') cycleFireMode();
    else if (code === 'ShiftLeft' || code === 'ShiftRight' || code === 'Space') playerDash();
    else if (code === 'Escape' || code === 'KeyP') togglePause();
  } else if (state === 'paused') {
    if (code === 'Escape' || code === 'KeyP') togglePause();
  } else if (state === 'levelup') {
    if (code === 'Digit1') pickLevelChoice(0);
    else if (code === 'Digit2') pickLevelChoice(1);
    else if (code === 'Digit3') pickLevelChoice(2);
  } else if (state === 'menu' || state === 'dead' || state === 'win') {
    if (code === 'Enter' && Date.now() - loadedAt > 500) startGame();
  }
}
handlers.onKeyPress = handleKey;
handlers.getState = getState;

/* ---------- 历史最佳战绩 ---------- */
export function loadBest() {
  try { return JSON.parse(localStorage.getItem('niuma_best') || 'null'); } catch (e) { return null; }
}
function saveBest(rank, kills) {
  try {
    const b = loadBest();
    if (!b || rank < b.rank || (rank === b.rank && kills > b.kills)) {
      localStorage.setItem('niuma_best', JSON.stringify({ rank, kills }));
      return !!b;   // 首局不算破纪录
    }
  } catch (e) { /* 无痕模式等 */ }
  return false;
}

/* ---------- 开发调试钩子 ---------- */
if (typeof window !== 'undefined') {
  window.__niuma = {
    getG, getState, update, startGame, backToMenu, togglePause, pickLevelChoice,
    cycleFireMode, getFireMode, castActive, loadGold, loadEndlessBest,
    loadShopUpgrades, purchaseUpgrade, computeUpgrades, SHOP_ITEMS,
    playerSwap, playerFuse, playerDash,
    applyDamage, applyCurse, applyTechPickup, applySkill, gainXp, nearestUnit, isFoe,
    aliveWorkers, chipObtainable,
    keys, mouse, touch, cam,
  };
}
