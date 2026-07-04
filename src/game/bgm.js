/* =====================================================================
 * 背景音乐：FC/小霸王风格程序化合成配乐引擎
 * - 严格模拟 2A03 音源芯片的声道配置：脉冲波(可变占空比)主旋律 + 三角波贝斯
 *   + 噪声鼓机，不用 sine——sine 听起来像电梯音乐合成器，不是卡带机。
 * - 独立于 SFX：不复用 audio.js 的 beep()/MAX_VOICES/节流，只共享
 *   AudioContext 和 masterGain（同一个限幅器总线，避免和 SFX 叠加削波）。
 * - 双总线交叉淡化换轨；每首曲子是"度数音阶 + 步进谱面"的纯数据，
 *   调度器代码本身不因换曲而改变。
 * ===================================================================== */
import { getAC, getMasterGain, isMuted } from './audio.js';
import * as bridge from './bridge.js';

/* ---------- 音阶引擎：A 自然小调，全曲七态共用同一张表 ---------- */
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const BASE_FREQ = 220; // A3

function degreeToFreq(d) {
  if (!d) return null; // 0 = 休止
  const sign = d < 0 ? -1 : 1;
  const da = Math.abs(d);
  const octave = Math.floor((da - 1) / 7);
  const idx = (da - 1) % 7;
  const semitone = sign * (SCALE[idx] + octave * 12);
  return BASE_FREQ * Math.pow(2, semitone / 12);
}

/* ---------- 脉冲波占空比：模拟 NES 双脉冲声道的音色差异 ---------- */
const pulseCache = new Map();
function getPulseWave(duty) {
  const AC = getAC();
  if (!AC) return null;
  if (pulseCache.has(duty)) return pulseCache.get(duty);
  const N = 24;
  const real = new Float32Array(N), imag = new Float32Array(N);
  for (let n = 1; n < N; n++) real[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
  const wave = AC.createPeriodicWave(real, imag, { disableNormalization: false });
  pulseCache.set(duty, wave);
  return wave;
}
const PULSE_THIN = { wave: 'pulse', duty: .125 };   // 尖细压迫感：Boss
const PULSE_LEAD = { wave: 'pulse', duty: .25 };    // 经典 FC 主旋律音色
const PULSE_FULL = { wave: 'square', duty: .5 };    // 满占空比，动作场景更饱满
const TRI_BASS = { wave: 'triangle' };              // NES 贝斯永远是三角波

/* ---------- 噪声缓冲（鼓机复用同一段，避免每次重新生成） ---------- */
let noiseBuffer = null;
function getNoiseBuffer() {
  const AC = getAC();
  if (!AC) return null;
  if (noiseBuffer) return noiseBuffer;
  const buf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buf;
  return buf;
}

/* ---------- 单音符 / 单鼓点合成（按绝对 AudioContext 时间调度） ---------- */
function scheduleTone(dest, freq, t, dur, waveSpec, vol) {
  if (!freq || vol <= 0) return;
  const AC = getAC();
  try {
    const o = AC.createOscillator();
    if (waveSpec.wave === 'pulse') o.setPeriodicWave(getPulseWave(waveSpec.duty));
    else o.type = waveSpec.wave;
    o.frequency.setValueAtTime(freq, t);
    const g = AC.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + .008);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(dest);
    o.start(t); o.stop(t + dur + .02);
  } catch (e) { /* ignore */ }
}

function scheduleDrum(dest, kind, t, vol) {
  if (kind === 'rest' || !kind || vol <= 0) return;
  const AC = getAC();
  try {
    if (kind === 'kick') {
      const o = AC.createOscillator(); o.type = 'triangle';
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + .1);
      const g = AC.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(.0001, t + .13);
      o.connect(g); g.connect(dest);
      o.start(t); o.stop(t + .15);
      return;
    }
    const buf = getNoiseBuffer();
    const src = AC.createBufferSource();
    src.buffer = buf;
    const offset = Math.random() * (buf.duration - .05);
    const filt = AC.createBiquadFilter();
    const g = AC.createGain();
    const dur = kind === 'snare' ? .09 : .035;
    if (kind === 'snare') { filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 1.1; }
    else { filt.type = 'highpass'; filt.frequency.value = 6500; }
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(filt); filt.connect(g); g.connect(dest);
    src.start(t, offset, dur + .02);
  } catch (e) { /* ignore */ }
}

/* ---------- 谱面数据：7 种游戏状态 x (旋律/贝斯/鼓点)，度数音阶+步进谱 ----------
 * 度数：1-7=音阶度数(A自然小调)，0=休止，负数=低八度，>7按八度顺延
 * 设计说明：menu/battle 共享核心动机 3-5-6-5-3 的变形，"平时摸鱼，一开打要命"——
 * 摸鱼段落也保持脉冲波+三角波的正统 FC 音色（不用 sine 电梯音乐音色），
 * 靠速度/休止符密度/占空比区分情绪，而不是切成另一种合成器音色。
 * ------------------------------------------------------------------------ */
const TRACKS = {
  menu: {
    tempoBpm: 100, bars: 4, stepsPerBar: 8, repeats: Infinity,
    lead: { wave: PULSE_LEAD, degrees: [3,0,5,0,6,0,5,0,3,0,2,0,1,0,2,0,5,0,6,0,8,0,6,0,5,0,3,0,2,0,1,0] },
    bass: { wave: TRI_BASS, degrees: [1,1,1,1,1,1,1,1,6,6,6,6,4,4,4,4,1,1,1,1,1,1,1,1,4,4,5,5,1,1,1,1] },
    drum: ['kick','rest','hat','rest','snare','rest','hat','hat','kick','rest','hat','rest','snare','rest','hat','rest','kick','rest','hat','rest','snare','rest','hat','hat','kick','rest','hat','rest','snare','rest','hat','rest'],
    gainLead: .5, gainBass: .45, gainDrum: .35,
  },
  trial: {
    tempoBpm: 116, bars: 4, stepsPerBar: 8, repeats: Infinity,
    lead: { wave: PULSE_LEAD, degrees: [3,0,5,6,5,0,3,0,2,0,1,2,1,0,2,0,5,0,6,5,6,0,8,0,6,5,3,0,2,1,2,0] },
    bass: { wave: TRI_BASS, degrees: [1,0,1,0,5,0,5,0,6,0,6,0,4,0,4,0,1,0,1,0,5,0,5,0,4,0,5,0,1,0,1,0] },
    drum: ['kick','hat','hat','rest','snare','hat','hat','rest','kick','hat','hat','rest','snare','hat','hat','rest','kick','hat','hat','hat','snare','hat','hat','rest','kick','hat','kick','hat','snare','hat','hat','rest'],
    gainLead: .52, gainBass: .48, gainDrum: .4,
  },
  battle: {
    tempoBpm: 152, bars: 2, stepsPerBar: 16, repeats: Infinity,
    lead: { wave: PULSE_FULL, degrees: [3,3,5,3,6,3,5,3,8,8,6,8,5,3,2,1,3,3,5,3,6,3,5,3,8,8,10,8,6,5,3,1] },
    bass: { wave: TRI_BASS, degrees: [1,1,1,1,1,1,1,1,6,6,6,6,6,6,6,6,1,1,1,1,1,1,1,1,4,4,4,4,5,5,5,5] },
    drum: ['kick','hat','snare','hat','kick','hat','snare','hat','kick','kick','snare','hat','kick','hat','snare','hat','kick','hat','snare','hat','kick','hat','snare','hat','kick','kick','snare','hat','kick','hat','snare','hat'],
    gainLead: .58, gainBass: .5, gainDrum: .56,
  },
  boss: {
    tempoBpm: 142, bars: 2, stepsPerBar: 16, repeats: Infinity, filterHz: 1800,
    lead: { wave: PULSE_THIN, degrees: [1,1,-6,1,2,1,-6,1,1,1,-6,1,3,2,1,0,1,1,-6,1,2,1,-6,7,1,1,-6,1,4,3,2,1] },
    bass: { wave: TRI_BASS, degrees: [-6,0,-6,0,-5,0,-5,0,-6,0,-6,0,-4,0,-4,0,-6,0,-6,0,-5,0,-5,0,-6,0,-6,0,-3,0,-3,0] },
    drum: ['kick','rest','kick','hat','snare','rest','kick','hat','kick','rest','kick','hat','snare','hat','kick','hat','kick','rest','kick','hat','snare','rest','kick','hat','kick','kick','kick','hat','snare','hat','kick','kick'],
    gainLead: .56, gainBass: .56, gainDrum: .56,
  },
  victory: {
    tempoBpm: 112, bars: 3, stepsPerBar: 8, repeats: 2,
    lead: { wave: PULSE_LEAD, degrees: [8,8,6,8,10,8,6,5,8,8,6,8,10,8,6,3,5,6,8,6,5,4,3,-3] },
    bass: { wave: TRI_BASS, degrees: [1,1,1,1,4,4,4,4,1,1,1,1,4,4,4,4,5,5,5,5,6,6,1,1] },
    drum: ['kick','hat','snare','hat','kick','hat','snare','hat','kick','hat','snare','hat','kick','hat','snare','hat','kick','hat','snare','hat','kick','hat','snare','rest'],
    gainLead: .52, gainBass: .48, gainDrum: .42,
  },
  defeat: {
    tempoBpm: 88, bars: 1, stepsPerBar: 8, repeats: 1,
    lead: { wave: PULSE_FULL, degrees: [5,4,3,2,1,0,-5,0] },
    bass: { wave: TRI_BASS, degrees: [1,1,6,6,4,4,5,5] },
    drum: ['kick','rest','snare','rest','kick','rest','snare','rest'],
    gainLead: .46, gainBass: .42, gainDrum: .38,
  },
  paused: {
    tempoBpm: 80, bars: 4, stepsPerBar: 8, repeats: Infinity,
    lead: { wave: PULSE_LEAD, degrees: [3,0,0,5,0,3,0,0,2,0,0,4,0,2,0,0,3,0,0,5,0,3,0,0,6,0,0,5,0,3,0,0] },
    bass: { wave: TRI_BASS, degrees: [1,0,5,0,6,0,4,0,1,0,5,0,3,0,2,0,1,0,5,0,6,0,4,0,5,0,1,0,1,0,1,0] },
    drum: ['rest','rest','hat','rest','rest','rest','hat','rest','rest','rest','hat','rest','rest','rest','hat','rest','rest','rest','hat','rest','rest','rest','hat','rest','rest','rest','hat','rest','rest','rest','hat','rest'],
    gainLead: .34, gainBass: .32, gainDrum: .22,
  },
};

function stepSecFor(tr, speedMult = 1) {
  return (60 / (tr.tempoBpm * speedMult)) * 4 / tr.stepsPerBar;
}

/* ---------- 双总线：任意时刻只有一条在真正调度新音符，另一条要么静默要么在淡出 ---------- */
function createBus() {
  const AC = getAC();
  const busGain = AC.createGain(); busGain.gain.value = 0;
  const leadFilter = AC.createBiquadFilter(); leadFilter.type = 'lowpass'; leadFilter.frequency.value = 20000;
  const leadGain = AC.createGain();
  const bassGain = AC.createGain();
  const drumGain = AC.createGain();
  leadGain.connect(leadFilter); leadFilter.connect(busGain);
  bassGain.connect(busGain);
  drumGain.connect(busGain);
  busGain.connect(getMasterGain());
  return {
    busGain, leadGain, bassGain, drumGain, leadFilter,
    timerId: null, trackKey: null, track: null,
    beatIndex: 0, nextNoteTime: 0, stepSec: .3, playCount: 1,
    enraged: false, targetGain: 0,
  };
}

let buses = null;
let activeIdx = 0;
let currentKey = null;
let lastActiveKey = 'menu';

function ensureBuses() {
  if (buses) return true;
  if (!getAC()) return false;
  buses = [createBus(), createBus()];
  return true;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = .1;

function scheduleStep(bus, idx) {
  const AC = getAC();
  const t = bus.nextNoteTime;
  const tr = bus.track;
  if (isMuted()) return;
  const leadDeg = tr.lead.degrees[idx];
  const leadFreq = degreeToFreq(leadDeg);
  if (leadFreq) {
    scheduleTone(bus.leadGain, leadFreq, t, bus.stepSec * .92, tr.lead.wave, tr.gainLead);
    if (bus.enraged) {
      /* 狂暴：叠加一路轻微失谐的旋律副本制造"打架"般的紧张感，不换谱面 */
      scheduleTone(bus.leadGain, leadFreq * Math.pow(2, 15 / 1200), t, bus.stepSec * .92, tr.lead.wave, tr.gainLead * .45);
    }
  }
  const bassFreq = degreeToFreq(tr.bass.degrees[idx]);
  if (bassFreq) scheduleTone(bus.bassGain, bassFreq, t, bus.stepSec * .95, TRI_BASS, tr.gainBass);
  let drumHit = tr.drum[idx];
  if (bus.enraged && drumHit === 'rest' && idx % 2 === 0) drumHit = 'kick';
  scheduleDrum(bus.drumGain, drumHit, t, tr.gainDrum);
  void AC;
}

function schedulerTick(bus) {
  const AC = getAC();
  if (!AC || !bus.track) return;
  while (bus.nextNoteTime < AC.currentTime + SCHEDULE_AHEAD) {
    const total = bus.track.bars * bus.track.stepsPerBar;
    scheduleStep(bus, bus.beatIndex);
    bus.nextNoteTime += bus.stepSec;
    bus.beatIndex++;
    if (bus.beatIndex >= total) {
      bus.beatIndex = 0;
      bus.playCount++;
      if (bus.playCount > (bus.track.repeats || Infinity)) { stopBus(bus, 1.3); return; }
    }
  }
}

function startBus(bus, key, fadeSec) {
  const AC = getAC();
  const tr = TRACKS[key];
  bus.track = tr;
  bus.trackKey = key;
  bus.beatIndex = 0;
  bus.playCount = 1;
  bus.enraged = false;
  bus.stepSec = stepSecFor(tr);
  bus.nextNoteTime = AC.currentTime + .05;
  bus.leadFilter.frequency.cancelScheduledValues(AC.currentTime);
  bus.leadFilter.frequency.setValueAtTime(tr.filterHz || 20000, AC.currentTime);
  bus.leadGain.gain.value = 1;
  bus.bassGain.gain.value = 1;
  bus.drumGain.gain.value = 1;
  bus.targetGain = 1;
  bus.busGain.gain.cancelScheduledValues(AC.currentTime);
  bus.busGain.gain.setValueAtTime(bus.busGain.gain.value, AC.currentTime);
  bus.busGain.gain.linearRampToValueAtTime(isMuted() ? 0 : 1, AC.currentTime + fadeSec);
  if (bus.timerId) clearInterval(bus.timerId);
  bus.timerId = setInterval(() => schedulerTick(bus), LOOKAHEAD_MS);
  schedulerTick(bus);
}

function stopBus(bus, fadeSec = 0) {
  const AC = getAC();
  bus.targetGain = 0;
  if (!AC) { if (bus.timerId) clearInterval(bus.timerId); bus.timerId = null; return; }
  if (fadeSec > 0) {
    bus.busGain.gain.cancelScheduledValues(AC.currentTime);
    bus.busGain.gain.setValueAtTime(bus.busGain.gain.value, AC.currentTime);
    bus.busGain.gain.linearRampToValueAtTime(0, AC.currentTime + fadeSec);
    const id = bus.timerId;
    setTimeout(() => { if (bus.timerId === id) { clearInterval(bus.timerId); bus.timerId = null; bus.track = null; } }, fadeSec * 1000 + 40);
  } else {
    if (bus.timerId) clearInterval(bus.timerId);
    bus.timerId = null; bus.track = null;
    bus.busGain.gain.value = 0;
  }
}

function switchTrack(key, fadeSec = 1.2) {
  if (!ensureBuses()) return;
  if (key === currentKey) return;   // 幂等：防止同一状态被反复触发导致抖动
  const outBus = buses[activeIdx];
  const inIdx = 1 - activeIdx;
  const inBus = buses[inIdx];
  if (outBus.trackKey) stopBus(outBus, fadeSec);
  startBus(inBus, key, fadeSec);
  activeIdx = inIdx;
  currentKey = key;
  if (key !== 'paused') lastActiveKey = key;
}

function pickPlayingTrack(G) {
  if (G.bossSpawned && G.boss && G.boss.alive) return 'boss';
  if (G.trial.active) return 'trial';
  return 'battle';
}

function onStateChange(newState, prevState, G) {
  if (!getAC()) return;
  if (newState === 'menu') return switchTrack('menu');
  if (newState === 'dead') return switchTrack('defeat', .6);
  if (newState === 'win') return switchTrack('victory', .6);
  if (newState === 'paused') return switchTrack('paused');
  if (newState === 'levelup') return; // 三选一短暂弹层，不打断当前音乐
  if (newState === 'playing') {
    if (prevState === 'paused') return switchTrack(lastActiveKey, 1.2);
    const key = pickPlayingTrack(G);
    const fade = (currentKey === 'trial' && key === 'battle') ? .4 : 1.2;
    return switchTrack(key, fade);
  }
}

function refreshPlayingTrack(G) {
  if (!G || !currentKey) return;
  const key = pickPlayingTrack(G);
  if (key === currentKey) return;
  const fade = (currentKey === 'trial' && key === 'battle') ? .4 : 1.2;
  switchTrack(key, fade);
}

function enrageBoss() {
  if (currentKey !== 'boss' || !buses) return;
  const bus = buses[activeIdx];
  if (bus.enraged) return;
  bus.enraged = true;
  const AC = getAC();
  bus.leadFilter.frequency.cancelScheduledValues(AC.currentTime);
  bus.leadFilter.frequency.linearRampToValueAtTime(6000, AC.currentTime + .8);
  bus.stepSec = stepSecFor(bus.track, 1.12);
}

function deenrageBoss() {
  if (currentKey !== 'boss' || !buses) return;
  const bus = buses[activeIdx];
  if (!bus.enraged) return;
  bus.enraged = false;
  const AC = getAC();
  bus.leadFilter.frequency.cancelScheduledValues(AC.currentTime);
  bus.leadFilter.frequency.linearRampToValueAtTime(bus.track.filterHz || 20000, AC.currentTime + .5);
  bus.stepSec = stepSecFor(bus.track);
}

function applyMuteGain() {
  if (!buses) return;
  const AC = getAC();
  if (!AC) return;
  const m = isMuted();
  for (const b of buses) {
    b.busGain.gain.cancelScheduledValues(AC.currentTime);
    b.busGain.gain.setValueAtTime(b.busGain.gain.value, AC.currentTime);
    b.busGain.gain.linearRampToValueAtTime(m ? 0 : b.targetGain, AC.currentTime + .08);
  }
}

let inited = false;
export const BGM = {
  init() {
    if (inited) return;
    if (!ensureBuses()) return;
    inited = true;
    bridge.on('mute-toggle', applyMuteGain);
  },
  onStateChange,
  refreshPlayingTrack,
  enrageBoss,
  deenrageBoss,
  stopAll() {
    if (!buses) return;
    for (const b of buses) stopBus(b, 0);
    currentKey = null;
  },
  _debug: () => ({ currentKey, activeIdx, buses: buses && buses.map(b => ({ trackKey: b.trackKey, enraged: b.enraged, playCount: b.playCount, gain: b.busGain.gain.value })) }),
};
