/* =====================================================================
 * 高清素材（Codex imageGen 生成的精灵表）——渐进增强：
 * 异步加载，加载完成前 render 回退到字符画精灵
 *   worker_sheet.png  16x20 ×5 帧（0=站立，1-4=走路循环），衬衫为 #ff00ff 占位色
 *   boss_sheet.png    24x28 ×2 帧（站立呼吸）
 *   props.png         chip/floppy/coffee/bing 图标条
 * ===================================================================== */
import workerUrl from '../assets/worker_sheet.png';
import bossUrl from '../assets/boss_sheet.png';
import propsUrl from '../assets/props.png';

export const HIFI = { ready: false, bossFrames: [], coffee: null, bing: null };

const SHIRT_KEY = [255, 0, 255];   // 占位品红

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
function sliceFrame(img, x, y, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(img, x, y, w, h, 0, 0, w, h);
  return c;
}
function recolor(srcCanvas, toHex) {
  const c = document.createElement('canvas');
  c.width = srcCanvas.width; c.height = srcCanvas.height;
  const g = c.getContext('2d');
  g.drawImage(srcCanvas, 0, 0);
  const id = g.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const r = parseInt(toHex.slice(1, 3), 16), gg = parseInt(toHex.slice(3, 5), 16), b = parseInt(toHex.slice(5, 7), 16);
  for (let i = 0; i < d.length; i += 4) {
    /* 品红占位（容忍轻微色差） */
    if (d[i] > 200 && d[i + 1] < 80 && d[i + 2] > 200) {
      d[i] = r; d[i + 1] = gg; d[i + 2] = b;
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

let workerBase = [];               // 5 帧原始画布（含品红）
const shirtCache = {};             // 衬衫色 -> 5 帧画布

export function workerFrames(shirt) {
  if (!HIFI.ready) return null;
  if (!shirtCache[shirt]) shirtCache[shirt] = workerBase.map(f => recolor(f, shirt));
  return shirtCache[shirt];
}

export async function loadHiFi() {
  try {
    const [w, b, p] = await Promise.all([loadImage(workerUrl), loadImage(bossUrl), loadImage(propsUrl)]);
    workerBase = [0, 1, 2, 3, 4].map(i => sliceFrame(w, i * 16, 0, 16, 20));
    HIFI.bossFrames = [0, 1].map(i => sliceFrame(b, i * 24, 0, 24, 28));
    HIFI.coffee = sliceFrame(p, 24, 0, 10, 12);
    HIFI.bing = sliceFrame(p, 36, 0, 12, 12);
    HIFI.ready = true;
  } catch (e) {
    console.warn('高清素材加载失败，使用字符画精灵', e);
  }
}
