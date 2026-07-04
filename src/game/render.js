/* =====================================================================
 * Canvas 渲染：世界 / 单位 / 子弹 / 特效 / 小地图
 * ===================================================================== */
import { VIEW_W, VIEW_H, TUNE } from './constants.js';
import { rand, dist, dist2, clamp } from './utils.js';
import { WEAPONS } from './data/weapons.js';
import { wdef } from './data/weapons.js';
import { CONSUMABLES } from './data/consumables.js';
import { TECH, TECH_TIERS } from './data/tech.js';
import { SPR, chipSprite, techSprite, FLOOR_TILES } from './sprites.js';
import { mouse, touch } from './input.js';
import { getG, getState, cam, maxHp, droneCount, getFireMode } from './core.js';
import { HIFI, workerFrames } from './hifi.js';

export function render(ctx) {
  const G = getG(), state = getState();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#12151c';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (!G) return;

  ctx.save();
  const shx = cam.shake ? rand(-cam.shake, cam.shake) : 0;
  const shy = cam.shake ? rand(-cam.shake, cam.shake) : 0;
  const ox = Math.round(cam.x + shx), oy = Math.round(cam.y + shy);
  ctx.translate(-ox, -oy);

  /* 地板 */
  const tx0 = Math.floor(ox / 32), ty0 = Math.floor(oy / 32);
  for (let ty = ty0; ty <= ty0 + Math.ceil(VIEW_H / 32); ty++) {
    for (let tx = tx0; tx <= tx0 + Math.ceil(VIEW_W / 32); tx++) {
      if (tx < 0 || ty < 0 || tx * 32 >= TUNE.world || ty * 32 >= TUNE.world) continue;
      ctx.drawImage(FLOOR_TILES[(tx * 7 + ty * 13) % 3], tx * 32, ty * 32);
    }
  }
  ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, TUNE.world - 6, TUNE.world - 6);

  /* 燃烧区 */
  for (const b of G.burns) {
    ctx.globalAlpha = .18 + .06 * Math.sin(b.t * 8);
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  /* 拾取物 */
  for (const p of G.pickups) {
    const by = Math.sin(p.bob) * 1.5;
    if (p.type === 'chip') {
      ctx.drawImage(chipSprite(WEAPONS[p.id].color), Math.round(p.x - 4), Math.round(p.y - 4 + by));
      if (p.lvl > 1) {
        ctx.font = '6px monospace'; ctx.fillStyle = '#ffcf33';
        ctx.fillText('Lv' + p.lvl, p.x - 5, p.y - 7 + by);
      }
      if (G.player.alive && dist2(p.x, p.y, G.player.x, G.player.y) < 70 * 70) {
        ctx.font = '7px monospace';
        const nm = WEAPONS[p.id].name;
        ctx.fillStyle = '#000'; ctx.fillText(nm, p.x - nm.length * 3.5 + 1, p.y + 13 + by);
        ctx.fillStyle = WEAPONS[p.id].color; ctx.fillText(nm, p.x - nm.length * 3.5, p.y + 12 + by);
      }
    } else if (p.type === 'tech') {
      const t = TECH[p.id];
      const tierInfo = TECH_TIERS[(p.tier || 1) - 1];
      ctx.drawImage(techSprite(t.color), Math.round(p.x - 4), Math.round(p.y - 4 + by));
      /* 高品级微光 */
      if ((p.tier || 1) >= 2) {
        ctx.globalAlpha = .35 + .2 * Math.sin(p.bob * 2);
        ctx.strokeStyle = tierInfo.color;
        ctx.beginPath(); ctx.arc(p.x, p.y + by, 7, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (G.player.alive && dist2(p.x, p.y, G.player.x, G.player.y) < 70 * 70) {
        const nm = tierInfo.label + t.name;
        ctx.font = '7px monospace';
        ctx.fillStyle = '#000'; ctx.fillText(nm, p.x - nm.length * 3.5 + 1, p.y + 13 + by);
        ctx.fillStyle = tierInfo.color || t.color; ctx.fillText(nm, p.x - nm.length * 3.5, p.y + 12 + by);
      }
    } else if (p.type === 'sample') {
      ctx.drawImage(SPR.flask, Math.round(p.x - 3), Math.round(p.y - 5 + by));
      if (G.player.alive && dist2(p.x, p.y, G.player.x, G.player.y) < 90 * 90) {
        const nm = 'AI替身样本';
        ctx.font = '7px monospace';
        ctx.fillStyle = '#000'; ctx.fillText(nm, p.x - nm.length * 3.5 + 1, p.y + 13 + by);
        ctx.fillStyle = '#d9b3ff'; ctx.fillText(nm, p.x - nm.length * 3.5, p.y + 12 + by);
      }
    } else if (p.type === 'heal') {
      /* 咖啡豆：小绿点 */
      ctx.fillStyle = '#14161d'; ctx.fillRect(Math.round(p.x - 2), Math.round(p.y - 2 + by), 5, 5);
      ctx.fillStyle = '#7ee08a'; ctx.fillRect(Math.round(p.x - 1), Math.round(p.y - 1 + by), 3, 3);
    } else if (p.type === 'item') {
      const c = CONSUMABLES[p.id];
      const hifiSwap = HIFI.ready && (c.spr === 'coffee' ? HIFI.coffee : c.spr === 'bing' ? HIFI.bing : null);
      ctx.drawImage(hifiSwap || SPR[c.spr], Math.round(p.x - 5), Math.round(p.y - 6 + by));
    } else {
      ctx.drawImage(SPR.xp, Math.round(p.x - 3), Math.round(p.y - 3 + by));
    }
  }

  /* 订书机炮台 */
  for (const tr of G.turrets) {
    const tx = Math.round(tr.x), ty = Math.round(tr.y);
    ctx.fillStyle = '#14161d'; ctx.fillRect(tx - 4, ty - 4, 9, 7);
    ctx.fillStyle = tr.life < 2 && Math.sin(G.t * 10) > 0 ? '#8d5a5a' : '#8d9dbb';
    ctx.fillRect(tx - 3, ty - 3, 7, 5);
    ctx.fillStyle = '#c9c4b4'; ctx.fillRect(tx + 3, ty - 2, 3, 2);   // 出钉口
  }

  /* 单位 + 家具（按 y 排序） */
  const drawables = [];
  for (const o of G.obstacles) drawables.push({ y: o.sy + 14, draw: () => ctx.drawImage(SPR[o.spr], o.sx, o.sy, 52, 32) });
  for (const d of G.decor) drawables.push({ y: d.y + 12, draw: () => ctx.drawImage(SPR[d.spr], d.x, d.y) });
  for (const u of G.units) if (u.alive) drawables.push({ y: u.y + 3, draw: () => drawUnit(ctx, G, u) });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  for (const p of G.projs) drawProj(ctx, G, p);
  for (const f of G.fx) drawFx(ctx, f);

  for (const p of G.parts) {
    ctx.globalAlpha = 1 - p.t / p.life;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;

  /* 裁员红线 */
  const z = G.zone;
  ctx.save();
  ctx.beginPath();
  ctx.rect(ox - 20, oy - 20, VIEW_W + 40, VIEW_H + 40);
  ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2, true);
  ctx.fillStyle = 'rgba(255, 60, 60, .13)';
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#ff4f4f';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.beginPath(); ctx.arc(z.cx, z.cy, z.r, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  if (z.shrinking) {
    ctx.strokeStyle = 'rgba(242,239,230,.4)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(z.toCx, z.toCy, z.toR, 0, Math.PI * 2); ctx.stroke();
  }

  /* 飘字 */
  for (const f of G.floats) {
    ctx.globalAlpha = Math.min(1, 2 - 2 * f.t / f.life);
    ctx.font = `bold ${f.size}px "PingFang SC", monospace`;
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, f.x - f.text.length * f.size * .28 + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x - f.text.length * f.size * .28, f.y);
  }
  ctx.globalAlpha = 1;

  /* 自动瞄准框（触屏 / 全托管模式） */
  if ((touch.using || getFireMode() === 2) && state === 'playing' && touch.aimTarget && touch.aimTarget.alive) {
    const t = touch.aimTarget;
    const bx = Math.round(t.x), by2 = Math.round(t.y - 6), r = 9;
    ctx.strokeStyle = '#ffcf33';
    ctx.lineWidth = 1;
    for (const [sx2, sy2] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.beginPath();
      ctx.moveTo(bx + sx2 * r, by2 + sy2 * r - sy2 * 4);
      ctx.lineTo(bx + sx2 * r, by2 + sy2 * r);
      ctx.lineTo(bx + sx2 * r - sx2 * 4, by2 + sy2 * r);
      ctx.stroke();
    }
  }
  ctx.restore();

  /* 屏幕边缘指示箭头：圈外指路 / Boss / 小Boss / 开局指芯片 */
  if (state === 'playing' && G.player.alive) {
    if (!G.trial.active && dist(G.player.x, G.player.y, z.cx, z.cy) > z.r) edgeArrow(ctx, G, z.cx, z.cy, '#ff4f4f');
    if (G.boss && G.boss.alive) edgeArrow(ctx, G, G.boss.x, G.boss.y, '#b665ff');
    for (const u of G.units) if (u.alive && u.eliteTier === 2) edgeArrow(ctx, G, u.x, u.y, '#ff9440');
    if (G.t < 25 && G.player.weapon.lvl === 1 && !G.player.weapon.leg) {
      let pc = null, pd = Infinity;
      for (const p of G.pickups) {
        if (p.type !== 'chip') continue;
        const d2 = dist2(p.x, p.y, G.player.x, G.player.y);
        if (d2 < pd) { pd = d2; pc = p; }
      }
      if (pc) edgeArrow(ctx, G, pc.x, pc.y, '#ffcf33');
    }
  }

  /* 准星（键鼠模式） */
  if (state === 'playing' && G.player.alive && !touch.using) {
    ctx.strokeStyle = 'rgba(255,207,51,.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mouse.x - 5, mouse.y); ctx.lineTo(mouse.x - 2, mouse.y);
    ctx.moveTo(mouse.x + 2, mouse.y); ctx.lineTo(mouse.x + 5, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - 5); ctx.lineTo(mouse.x, mouse.y - 2);
    ctx.moveTo(mouse.x, mouse.y + 2); ctx.lineTo(mouse.x, mouse.y + 5);
    ctx.stroke();
  }

  /* 受伤红晕 / 圈外警告 / 幻觉滤镜 */
  const pl = G.player;
  if (pl.alive) {
    const low = pl.hp < maxHp(pl) * .3;
    const outside = dist(pl.x, pl.y, z.cx, z.cy) > z.r;
    if (low || outside || pl.hurtT > 0) {
      const a = Math.max(low ? .22 : 0, outside ? .18 + .08 * Math.sin(G.t * 6) : 0, pl.hurtT > 0 ? .3 : 0);
      const grd = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * .42, VIEW_W / 2, VIEW_H / 2, VIEW_H * .72);
      grd.addColorStop(0, 'rgba(255,50,50,0)');
      grd.addColorStop(1, `rgba(255,50,50,${a})`);
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
    if (pl.curses.hallu > 0) {
      ctx.fillStyle = `rgba(182,101,255,${.06 + .04 * Math.sin(G.t * 5)})`;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }
}

function drawUnit(ctx, G, u) {
  const x = Math.round(u.x), y = Math.round(u.y);
  const bob = u.walkT ? Math.round(Math.sin(u.walkT) * 1) : 0;
  const face = Math.cos(u.aim) >= 0 ? 1 : -1;

  /* 高清帧（加载完成后启用）：走路循环 + 衬衫换色 */
  let spr = u.spr, scale = u.isBoss ? 2 : u.eliteType === 'overfit' ? 1.5 : u.isSummon ? .75 : 1;
  if (HIFI.ready) {
    if (u.isBoss) {
      spr = HIFI.bossFrames[Math.floor(G.t * 2) % 2];
      scale = 1.5;
    } else if (u.eliteType !== 'hallu' && !u.isMob) {
      const frames = workerFrames(u.shirt);
      if (frames) {
        spr = u.standT > .12 ? frames[0] : frames[1 + Math.floor(u.walkT * 1.6) % 4];
        scale = u.eliteType === 'overfit' ? 1.3 : u.eliteTier === 2 ? 1.12 : u.isSummon ? .7 : .9;
      }
    }
  }
  const w = spr.width, h = spr.height;

  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.fillRect(x - 4 * scale, y + 1, 8 * scale, 2);

  ctx.save();
  if (u.invulnT > 0) ctx.globalAlpha = .5 + .3 * Math.sin(G.t * 20);
  if (u.eliteType === 'hallu') ctx.globalAlpha = .55 + .35 * Math.sin(G.t * 17);
  ctx.translate(x, y + bob);
  ctx.scale(face, 1);
  ctx.drawImage(spr, Math.round(-w / 2 * scale), Math.round(-(h - 3) * scale), Math.round(w * scale), Math.round(h * scale));
  ctx.restore();

  /* 受击白闪 */
  if (u.hurtT > .06) {
    ctx.globalAlpha = .5;
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - w / 2 * scale, y - (h - 3) * scale + bob, w * scale, (h - 2) * scale);
    ctx.globalAlpha = 1;
  }
  /* 对齐守卫的正面护盾弧 */
  if (u.eliteType === 'align') {
    ctx.strokeStyle = '#c9d4e4'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 5, 10, u.aim - 1.1, u.aim + 1.1); ctx.stroke();
  }
  /* 被策反的盟友标记 */
  if (u.allyOwner) {
    ctx.fillStyle = '#ffcf33';
    ctx.fillRect(x - 1, y - 21 + bob, 3, 3);
    ctx.fillRect(x, y - 19 + bob, 1, 2);
  }
  /* 被举报标记：闪烁红色感叹号 */
  if (u.reportedT > 0 && Math.sin(G.t * 12) > -0.3) {
    ctx.fillStyle = '#ff4f4f';
    ctx.fillRect(x - 1, y - 26 + bob, 2, 5);
    ctx.fillRect(x - 1, y - 19 + bob, 2, 2);
  }
  /* 向上管理光环标记：金色上箭头 */
  if (u.empowerT > 0) {
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(x + 6, y - 16 + bob, 1, 3);
    ctx.fillRect(x + 5, y - 15 + bob, 3, 1);
  }
  /* 副武器可视化：显示器回旋盾 / 碎纸机光环 */
  if (u.isPlayer && u.subs.monitor) {
    const s = u.subs.monitor;
    const n = [1, 2, 2][s.lv - 1];
    for (let i = 0; i < n; i++) {
      const da = (s.ang || 0) + i * Math.PI * 2 / n;
      const mx = x + Math.cos(da) * 34, my = y - 4 + Math.sin(da) * 34;
      ctx.fillStyle = '#14161d'; ctx.fillRect(mx - 4, my - 3, 8, 7);
      ctx.fillStyle = '#38b6d9'; ctx.fillRect(mx - 3, my - 2, 6, 4);
    }
  }
  if (u.isPlayer && u.subs.shredder) {
    const r = [42, 48, 56][u.subs.shredder.lv - 1];
    ctx.globalAlpha = .12 + .05 * Math.sin(G.t * 6);
    ctx.strokeStyle = '#c9d4e4';
    ctx.setLineDash([4, 5]);
    ctx.beginPath(); ctx.arc(x, y - 4, r, G.t, G.t + Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
  /* RAG 知识库炮台 */
  if (u.mods.rag) {
    for (let i = 0; i < u.mods.rag; i++) {
      const da = u.ragAng + i * Math.PI;
      const dx = x + Math.cos(da) * 27, dy = y - 5 + Math.sin(da) * 27;
      ctx.fillStyle = '#14161d'; ctx.fillRect(dx - 2, dy - 2, 5, 5);
      ctx.fillStyle = '#67c98b'; ctx.fillRect(dx - 1, dy - 1, 3, 3);
    }
  }
  if (u.shield > 0) {
    ctx.strokeStyle = 'rgba(106,163,255,.7)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y - 5, 9 * scale, 0, Math.PI * 2); ctx.stroke();
  }
  /* 僚机 */
  const def = wdef(u);
  if (def.kind === 'drone' || def.kind === 'leg_drone') {
    const n = droneCount(u, def);
    for (let i = 0; i < n; i++) {
      const da = u.weapon.droneAng + i * Math.PI * 2 / n;
      const dx = x + Math.cos(da) * 20, dy = y - 6 + Math.sin(da) * 20;
      ctx.fillStyle = '#14161d'; ctx.fillRect(dx - 2, dy - 2, 5, 5);
      ctx.fillStyle = def.color; ctx.fillRect(dx - 1, dy - 1, 3, 3);
    }
  }
  /* 蓄力弧 */
  if (def.kind === 'charge' && u.weapon.charging) {
    const p = u.weapon.charge / def.chargeT;
    ctx.strokeStyle = p >= 1 ? '#ffcf33' : def.color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y - 5, 11, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2); ctx.stroke();
  }
  if (u.isMob) return;   // 杂鱼不画血条/名字/标记

  /* 血条（锚点随精灵实际高度自适应） */
  const mh = maxHp(u), pct = clamp(u.hp / mh, 0, 1);
  const bw = u.isBoss ? 26 : 14;
  const byy = y - Math.round((h - 3) * scale) - 3 + bob;
  ctx.fillStyle = '#000';
  ctx.fillRect(x - bw / 2 - 1, byy - 1, bw + 2, 4);
  ctx.fillStyle = u.isPlayer ? '#7ee08a' : u.isBoss ? '#b665ff' : u.isElite ? '#c58fff' : u.isHR ? '#9aa4b5' : u.allyOwner ? '#ffcf33' : '#ff7a5a';
  ctx.fillRect(x - bw / 2, byy, Math.round(bw * pct), 2);
  /* 名字 */
  if (!u.isPlayer && G.player.alive && dist2(u.x, u.y, G.player.x, G.player.y) < 150 * 150) {
    ctx.font = '7px "PingFang SC", monospace';
    const nm = u.name;
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillText(nm, x - nm.length * 3.2 + 1, byy - 3 + 1);
    ctx.fillStyle = u.isBoss ? '#d9b3ff' : '#c9c4b4';
    ctx.fillText(nm, x - nm.length * 3.2, byy - 3);
  }
  if (u.isPlayer && u.mods.dashCd && u.dashT <= 0) {
    ctx.fillStyle = '#ffcf33';
    ctx.fillRect(x - 3, y + 4, 6, 1);
  }
}

function drawProj(ctx, G, p) {
  const x = Math.round(p.x), y = Math.round(p.y);
  ctx.fillStyle = p.color;
  switch (p.shape) {
    case 'diamond':
      ctx.fillRect(x - 1, y - 2, 2, 4); ctx.fillRect(x - 2, y - 1, 4, 2);
      break;
    case 'streak': {
      const a = Math.atan2(p.vy, p.vx);
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * 10, y - Math.sin(a) * 10);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillRect(x - 1, y - 1, 3, 3);
      break;
    }
    case 'orb':
      ctx.beginPath(); ctx.arc(x, y, p.r + .5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 1, 1, 1);
      break;
    case 'star':
      ctx.fillRect(x - 2, y, 5, 1); ctx.fillRect(x, y - 2, 1, 5);
      ctx.fillRect(x - 1, y - 1, 3, 3);
      break;
    case 'pea':
      ctx.beginPath(); ctx.arc(x, y, p.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y - 1, 1, 1);
      break;
    case 'slide':   // PPT 幻灯片
      ctx.fillStyle = '#e8e4d8';
      ctx.fillRect(x - 3, y - 2, 6, 5);
      ctx.fillStyle = '#14161d';
      ctx.fillRect(x - 2, y - 1, 4, 1);
      ctx.fillRect(x - 2, y + 1, 3, 1);
      break;
    case 'mugp':
      ctx.drawImage(HIFI.ready && HIFI.coffee ? HIFI.coffee : SPR.coffee, x - 4, y - 5);
      break;
    case 'pie':
      ctx.drawImage(HIFI.ready ? HIFI.bing : SPR.bing, x - 5, y - 5);
      break;
    case 'bigpie':
      ctx.drawImage(HIFI.ready ? HIFI.bing : SPR.bing, x - 8, y - 8, 16, 16);
      break;
    case 'boomerang':
    case 'bigboom': {
      const s = p.shape === 'bigboom' ? 2 : 1;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(G.t * 12);
      ctx.fillStyle = p.shape === 'bigboom' ? '#7ac8ff' : p.color;
      ctx.fillRect(-4 * s, -1 * s, 8 * s, 2 * s);
      ctx.fillRect(-1 * s, -4 * s, 2 * s, 8 * s);
      ctx.restore();
      break;
    }
    default:
      ctx.fillRect(x - p.r, y - p.r, p.r * 2, p.r * 2);
  }
}

/* 屏幕边缘方向箭头 */
function edgeArrow(ctx, G, wx, wy, color) {
  const sx = wx - cam.x, sy = wy - cam.y;
  if (sx > 12 && sx < VIEW_W - 12 && sy > 12 && sy < VIEW_H - 12) return;
  const cx = VIEW_W / 2, cy = VIEW_H / 2;
  let dx = sx - cx, dy = sy - cy;
  const m = Math.hypot(dx, dy);
  if (!m) return;
  dx /= m; dy /= m;
  let k = Infinity;
  if (dx) k = Math.min(k, ((dx > 0 ? VIEW_W - 16 : 16) - cx) / dx);
  if (dy) k = Math.min(k, ((dy > 0 ? VIEW_H - 16 : 16) - cy) / dy);
  const px = cx + dx * k, py = cy + dy * k;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.globalAlpha = .6 + .35 * Math.sin(G.t * 6);
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.moveTo(9, 1); ctx.lineTo(-4, -5); ctx.lineTo(-4, 7); ctx.closePath(); ctx.fill();
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFx(ctx, f) {
  const k = 1 - f.t / f.life;
  ctx.globalAlpha = k;
  if (f.type === 'beam') {
    ctx.strokeStyle = f.color; ctx.lineWidth = f.w;
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, f.w / 3);
    ctx.beginPath(); ctx.moveTo(f.x1, f.y1); ctx.lineTo(f.x2, f.y2); ctx.stroke();
  } else if (f.type === 'bolt') {
    ctx.strokeStyle = f.color; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(f.pts[0].x, f.pts[0].y);
    for (let i = 1; i < f.pts.length; i++) {
      const a = f.pts[i - 1], b = f.pts[i];
      ctx.lineTo((a.x + b.x) / 2 + rand(-4, 4), (a.y + b.y) / 2 + rand(-4, 4));
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  } else if (f.type === 'boom') {
    ctx.strokeStyle = f.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * .6), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = k * .25;
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (1 - k * .6), 0, Math.PI * 2); ctx.fill();
  } else if (f.type === 'slash') {
    /* 键盘刀光：弧形斩击 */
    ctx.globalAlpha = k * .9;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 6 * k + 1;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.75 + (1 - k) * .3), f.ang - f.spread, f.ang + f.spread); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2 * k;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r * (0.75 + (1 - k) * .3), f.ang - f.spread * .6, f.ang + f.spread * .6); ctx.stroke();
  } else if (f.type === 'ringwarn') {
    /* 预警圈：考勤点名 / 会议邀请 */
    ctx.globalAlpha = .45 + .3 * Math.sin(f.t * 22);
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = k * .12;
    ctx.fillStyle = f.color;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
  } else if (f.type === 'cone' || f.type === 'coneflash') {
    /* PPT 全屏演示：扇形预警 / 爆发闪光 */
    ctx.globalAlpha = f.type === 'cone' ? k * .3 + .1 * Math.sin(f.t * 25) : k * .6;
    ctx.fillStyle = f.color;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.arc(f.x, f.y, f.len, f.ang - f.spread, f.ang + f.spread);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = k * .8;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (f.type === 'pillar') {
    ctx.fillStyle = f.color;
    ctx.globalAlpha = k * .8;
    ctx.fillRect(f.x - f.r * .25, f.y - 400, f.r * .5, 400);
    ctx.globalAlpha = k * .4;
    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/* 小地图 */
export function drawMinimap(mmCtx) {
  const G = getG();
  if (!G) return;
  const s = 54 / TUNE.world;
  mmCtx.fillStyle = '#0c0e13';
  mmCtx.fillRect(0, 0, 54, 54);
  const z = G.zone;
  mmCtx.strokeStyle = '#ff4f4f';
  mmCtx.lineWidth = 1;
  mmCtx.beginPath(); mmCtx.arc(z.cx * s, z.cy * s, z.r * s, 0, Math.PI * 2); mmCtx.stroke();
  if (z.shrinking) {
    mmCtx.strokeStyle = 'rgba(242,239,230,.5)';
    mmCtx.beginPath(); mmCtx.arc(z.toCx * s, z.toCy * s, z.toR * s, 0, Math.PI * 2); mmCtx.stroke();
  }
  const pl = G.player;
  for (const u of G.units) {
    if (!u.alive || u.isPlayer) continue;
    const big = u.isBoss || u.eliteTier === 2;
    mmCtx.fillStyle = u.isBoss ? '#b665ff' : u.eliteTier === 2 ? '#ff9440' : u.isElite ? '#c58fff' : u.allyOwner === pl ? '#ffcf33' : 'rgba(200,120,120,.8)';
    mmCtx.fillRect(u.x * s - (big ? 1.5 : .5), u.y * s - (big ? 1.5 : .5), big ? 3 : 1.5, big ? 3 : 1.5);
  }
  if (pl.alive) {
    mmCtx.fillStyle = '#ffcf33';
    mmCtx.fillRect(pl.x * s - 1, pl.y * s - 1, 2.5, 2.5);
  }
}
