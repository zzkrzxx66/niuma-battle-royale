/* WebAudio 合成音效 */
let AC = null;
let muted = false;
let masterGain = null;
let limiter = null;

export const isMuted = () => muted;
export function toggleMuted() { muted = !muted; return muted; }
export function setMuted(v) { muted = v; }

/* 供 bgm.js 接入同一条总线（复用限幅器），不新建 AudioContext */
export const getAC = () => AC;
export const getMasterGain = () => masterGain;

export function initAudio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      /* 主线限幅：割草流同帧多次命中/爆炸叠加时防止削波爆音 */
      limiter = AC.createDynamicsCompressor();
      limiter.threshold.setValueAtTime(-16, AC.currentTime);
      limiter.knee.setValueAtTime(18, AC.currentTime);
      limiter.ratio.setValueAtTime(14, AC.currentTime);
      limiter.attack.setValueAtTime(.001, AC.currentTime);
      limiter.release.setValueAtTime(.1, AC.currentTime);
      masterGain = AC.createGain();
      masterGain.gain.value = .85;
      masterGain.connect(limiter);
      limiter.connect(AC.destination);
    }
    catch (e) { /* 无声也能玩 */ }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}

/* 同时存在的音源数硬顶，防止连击/群体爆炸瞬间堆出电流声 */
const MAX_VOICES = 16;
let activeVoices = 0;

export function beep(f0, f1, dur, type = 'square', vol = .06) {
  if (!AC || muted || !masterGain || activeVoices >= MAX_VOICES) return;
  try {
    const t = AC.currentTime;
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(20, f0), t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    /* 极短线性淡入再进入指数衰减：避免方波/锯齿波从 0 瞬跳到满幅产生的"啪"声 */
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + .004);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(masterGain);
    activeVoices++;
    const release = () => { activeVoices = Math.max(0, activeVoices - 1); };
    o.onended = release;
    o.start(t); o.stop(t + dur + .02);
  } catch (e) { /* ignore */ }
}

/* 高频音效节流：多重连射/穿透/AOE 同帧可能触发数次同名音效，只留第一次 */
const lastPlay = {};
function throttled(name, minGapMs, fn) {
  return (...args) => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (now - (lastPlay[name] ?? -1e9) < minGapMs) return;
    lastPlay[name] = now;
    fn(...args);
  };
}

/* 可取消的延时音注册表：暂停/重开/死亡时残余音符不再继续播放 */
const pending = new Set();
export function later(fn, ms) {
  const id = setTimeout(() => { pending.delete(id); fn(); }, ms);
  pending.add(id);
}
export function cancelPendingSfx() {
  for (const id of pending) clearTimeout(id);
  pending.clear();
}

export const SFX = {
  /* 高射速/多重弹/AOE 群体命中最容易同帧堆叠触发，节流 + 换用较软的波形降低噪感 */
  shoot: throttled('shoot', 26, () => beep(700, 320, .06, 'square', .016)),
  laser: () => beep(1200, 200, .18, 'sawtooth', .045),
  hit: throttled('hit', 38, () => beep(320, 150, .06, 'triangle', .032)),
  /* 杂鱼群殴时同帧会有多个 touch 判定各自调 applyDamage，hurt 之前没节流是本体
     "被围殴时声音很爆"的根因——其它命中音效早就节流了，唯独漏了这个 */
  hurt: throttled('hurt', 48, () => beep(220, 60, .18, 'sawtooth', .065)),
  pickup: () => beep(520, 940, .09, 'triangle', .045),
  chip: () => { beep(420, 840, .1, 'triangle', .06); later(() => beep(640, 1280, .1, 'triangle', .05), 70); },
  swap: () => beep(300, 600, .08, 'triangle', .05),
  levelup: () => [440, 554, 659, 880].forEach((f, i) => later(() => beep(f, f, .12, 'square', .05), i * 85)),
  fuse: () => [220, 330, 494, 659, 988].forEach((f, i) => later(() => beep(f, f * 1.4, .16, 'sawtooth', .06), i * 75)),
  death: () => beep(400, 40, .55, 'sawtooth', .09),
  kill: throttled('kill', 18, () => beep(620, 160, .16, 'square', .05)),
  dash: () => beep(880, 1500, .08, 'sine', .045),
  zone: () => { beep(175, 175, .28, 'square', .05); later(() => beep(175, 175, .28, 'square', .05), 380); },
  boss: () => { beep(90, 45, .7, 'sawtooth', .1); later(() => beep(70, 40, .8, 'sawtooth', .1), 500); },
  explo: throttled('explo', 55, () => beep(160, 30, .3, 'sawtooth', .06)),
  deny: () => beep(200, 140, .12, 'square', .04),
};
