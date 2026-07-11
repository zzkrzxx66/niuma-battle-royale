/* =====================================================================
 * 输入：键盘 / 鼠标 / 触屏（左半屏虚拟摇杆 + 自动瞄准状态）
 * ===================================================================== */
import { VIEW_W, VIEW_H } from './constants.js';
import { clamp } from './utils.js';
import { initAudio } from './audio.js';

export const keys = new Set();
export const mouse = { x: VIEW_W / 2, y: VIEW_H / 2, down: false };
export const IS_TOUCH = typeof matchMedia !== 'undefined' &&
  (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window);
export const touch = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, active: false, using: false, aimTarget: null };

/* 由 core 注册：全局按键路由 */
export const handlers = { onKeyPress: null, getState: () => 'menu' };

/* 摇杆 DOM（由 TouchControls 挂载时注册） */
let joyEl = null;
export function registerJoyEl(el) { joyEl = el; }
function positionJoy(bx, by, kx, ky) {
  if (!joyEl) return;
  joyEl.style.display = 'block';
  joyEl.children[0].style.left = bx + 'px'; joyEl.children[0].style.top = by + 'px';
  joyEl.children[1].style.left = kx + 'px'; joyEl.children[1].style.top = ky + 'px';
}
function hideJoy() { if (joyEl) joyEl.style.display = 'none'; }

let attached = false;
export function attachInput(canvas, stageEl) {
  if (attached) return;
  attached = true;

  addEventListener('keydown', e => {
    const t = e.target;
    const typing = t && (
      t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.isContentEditable ||
      (typeof t.closest === 'function' && t.closest('input, textarea, [contenteditable="true"]'))
    );
    if (typing) return; // 昵称等输入框里不要拦截按键
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys.add(e.code);
    if (handlers.onKeyPress) handlers.onKeyPress(e.code);
  });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.down = false; });

  addEventListener('mousemove', e => {
    touch.using = false;
    const r = canvas.getBoundingClientRect();
    mouse.x = clamp((e.clientX - r.left) / r.width * VIEW_W, 0, VIEW_W);
    mouse.y = clamp((e.clientY - r.top) / r.height * VIEW_H, 0, VIEW_H);
  });
  addEventListener('mousedown', e => {
    if (e.button === 0 && !e.target.closest('.overlay')) mouse.down = true;
  });
  addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /* 触屏：左半屏动态摇杆 */
  stageEl.addEventListener('touchstart', e => {
    touch.using = true;
    if (handlers.getState() !== 'playing') return;
    e.preventDefault();
    initAudio();
    for (const t of e.changedTouches) {
      if (touch.id === null && t.clientX < innerWidth * .55) {
        touch.id = t.identifier;
        touch.ox = t.clientX; touch.oy = t.clientY;
        touch.dx = 0; touch.dy = 0; touch.active = true;
        positionJoy(t.clientX, t.clientY, t.clientX, t.clientY);
      }
    }
  }, { passive: false });
  stageEl.addEventListener('touchmove', e => {
    if (!touch.active) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touch.id) {
        let dx = t.clientX - touch.ox, dy = t.clientY - touch.oy;
        const m = Math.hypot(dx, dy), R = 44;
        if (m > R) { dx = dx / m * R; dy = dy / m * R; }
        touch.dx = dx / R; touch.dy = dy / R;
        positionJoy(touch.ox, touch.oy, touch.ox + dx, touch.oy + dy);
      }
    }
  }, { passive: false });
  const endTouch = e => {
    for (const t of e.changedTouches) {
      if (t.identifier === touch.id) {
        touch.id = null; touch.active = false; touch.dx = touch.dy = 0;
        hideJoy();
      }
    }
  };
  stageEl.addEventListener('touchend', endTouch);
  stageEl.addEventListener('touchcancel', endTouch);
}
