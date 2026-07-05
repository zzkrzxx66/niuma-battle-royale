import React, { useRef, useEffect, useState } from 'react';
import { TUNE } from '../game/constants.js';
import { fmtTime, clamp } from '../game/utils.js';
import { WEAPONS, LEGENDS, findRecipe, recipePartner, wdef } from '../game/data/weapons.js';
import { TECH, CURSES, DISTILLS } from '../game/data/tech.js';
import { SUBS } from '../game/data/subweapons.js';
import { ACTIVES } from '../game/data/actives.js';
import { chipSprite } from '../game/sprites.js';
import { touch, IS_TOUCH } from '../game/input.js';
import { getG, maxHp, aliveWorkers, chipObtainable, getFireMode, FIRE_MODES } from '../game/core.js';
import { drawMinimap } from '../game/render.js';
import * as bridge from '../game/bridge.js';

/* 武器芯片图标 */
function WeaponIcon({ color }) {
  const ref = useRef(null);
  useEffect(() => {
    const g = ref.current.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 12, 12);
    g.drawImage(chipSprite(color), 1, 2);
  }, [color]);
  return <canvas ref={ref} width={12} height={12} />;
}

/* 击杀播报（按游戏时间过期：暂停/升级弹窗期间不消失，卸载零残留计时器） */
function KillFeed() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let seq = 0;
    const offFeed = bridge.on('feed', ({ text, hl }) => {
      const g = getG();
      setItems(prev => [{ id: ++seq, text, hl, at: g ? g.t : 0 }, ...prev].slice(0, 8));
    });
    const offClear = bridge.on('feed-clear', () => setItems([]));
    return () => { offFeed(); offClear(); };
  }, []);
  const g = getG();
  const now = g ? g.t : 0;
  const visible = items.filter(i => now >= i.at && now - i.at < 6.5).slice(0, 5);
  return (
    <div id="killfeed">
      {visible.map(i => <div key={i.id} className={i.hl ? 'me' : ''}>{i.text}</div>)}
    </div>
  );
}

/* 缩圈通告（游戏时间 5 秒） */
function ZoneWarn() {
  const [item, setItem] = useState(null);
  useEffect(() => bridge.on('warn', t => {
    const g = getG();
    setItem({ text: t, at: g ? g.t : 0 });
  }), []);
  const g = getG();
  const show = item && g && g.t >= item.at && g.t - item.at < 5;
  return show ? <div id="zone-warn">{item.text}</div> : null;
}

/* 小地图 */
function Minimap() {
  const ref = useRef(null);
  useEffect(() => {
    const ctx = ref.current.getContext('2d');
    let raf;
    const loop = () => { raf = requestAnimationFrame(loop); drawMinimap(ctx); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas id="minimap" ref={ref} width={54} height={54} />;
}

export default function Hud() {
  const G = getG();
  if (!G) return null;
  const pl = G.player;
  const mh = maxHp(pl);
  const w = pl.weapon;
  const def = wdef(pl);
  const z = G.zone;

  /* 武器提示 */
  let hint;
  if (w.leg) hint = def.pat;
  else {
    const rp = recipePartner(w.id);
    hint = w.lvl >= 5
      ? (chipObtainable(rp.partner)
        ? <>满级！找 <b>{WEAPONS[rp.partner].name}</b> 芯片{IS_TOUCH ? '点融合按钮' : '按 F 融合'} →「{LEGENDS[rp.leg].name}」</>
        : <>满级！搭档芯片已绝版——{IS_TOUCH ? '点换枪按钮' : '按 E'} 换装其他芯片再练</>)
      : <>捡同款芯片升级（{w.lvl}/5）· 融合搭档：{WEAPONS[rp.partner].name}</>;
    if (def.kind === 'charge') hint = <>{IS_TOUCH ? '长按蓄力，松开发射' : '按住鼠标蓄力，松开发射'} · {hint}</>;
  }

  /* 拾取提示 */
  const hc = G.hoverChip;
  const canFuse = hc && !w.leg && w.lvl >= 5 && findRecipe(w.id, hc.id);
  const techParts = Object.entries(pl.subs).map(([id, s]) => `${SUBS[id].name} Lv${s.lv}`);
  techParts.push(...Object.entries(pl.tech).map(([id, n]) => `${TECH[id].name}×${n}`));
  if (pl.distills) techParts.push(...Object.keys(pl.distills).map(k => `蒸馏·${DISTILLS[k].name}`));
  const techStr = techParts.join(' · ');
  const curses = Object.entries(pl.curses).filter(([, v]) => v > 0);

  const phases = G.zonePhases || TUNE.zonePhases;
  const nextZone = G.mode === 'endless'
    ? <span style={{ color: '#ff9440' }}>第 <b>{G.endlessWave}</b> 波 · 下一波 {Math.max(0, Math.ceil(G.endlessWaveT))}s</span>
    : G.trial.active
    ? <span style={{ color: '#7ee08a' }}>试用期 第 <b>{G.trial.wave}/{G.trial.months}</b> 月 · {Math.max(0, Math.ceil(G.trial.waveT))}s</span>
    : z.shrinking ? <b>红线收缩中！</b>
    : z.phase < phases.length
      ? <>下轮优化 <b>{fmtTime(Math.max(0, phases[z.phase].at - (G.t - G.trialOffset)))}</b></>
      : '最终红线';

  return (
    <div id="hud">
      <div className="hud-tl">
        <div className="bar hp">
          <i style={{ width: clamp(pl.hp / mh * 100, 0, 100) + '%' }} />
          <b>{Math.max(0, Math.ceil(pl.hp))}/{mh}{pl.shield > 0 ? ` +盾${Math.ceil(pl.shield)}` : ''}</b>
        </div>
        <div className="bar xp">
          <i style={{ width: clamp(pl.xp / TUNE.levelNeed(pl.level) * 100, 0, 100) + '%' }} />
        </div>
        <div className="tag">LV.<b>{pl.level}</b></div>
        {techStr && <div className="tag" id="tech-tag">{techStr}</div>}
        <div id="curse-row">
          {pl.reportedT > 0 && (
            <span className="curse-tag" style={{ background: '#40101a', borderColor: '#ff4f4f', color: '#ffc9c9' }}>
              已被举报 {Math.ceil(pl.reportedT)}s · 全场正在赶来集火
            </span>
          )}
          {curses.map(([id, v]) => (
            <span className="curse-tag" key={id}>{CURSES[id].name} {Math.ceil(v)}s · {CURSES[id].desc}</span>
          ))}
        </div>
      </div>

      <div className="hud-tc">
        <div className="tag">存活牛马 <b>{aliveWorkers() + (G.latentBots ? G.latentBots.length : 0)}</b>/{TUNE.botCount + 1}{G.latentBots ? '（同事未到岗）' : ''}</div>
        <div className="tag" id="next-tag" style={{ marginTop: 4 }}>{nextZone}</div>
        <ZoneWarn />
      </div>

      {G.bossSpawned && !G.bossDead && G.boss && (
        <div id="boss-bar-wrap">
          <span>老板</span>
          <div className="bar">
            <i style={{ width: clamp(G.boss.hp / maxHp(G.boss) * 100, 0, 100) + '%' }} />
          </div>
          {G.boss.bossAI && G.boss.bossAI.distilled.length > 0 && (
            <div style={{ fontFamily: 'var(--sans)', fontSize: 10, color: '#d9b3ff', marginTop: 3 }}>
              已蒸馏你的：{G.boss.bossAI.distilled.join('、')}
            </div>
          )}
        </div>
      )}

      <div className="hud-tr">
        <Minimap />
        <div className="tag">{fmtTime(G.t)}</div>
        <div className="tag">优化他人 <b>{G.kills}</b></div>
        {G.goldEarned > 0 && <div className="tag" style={{ color: '#ffcf33' }}>💰 {G.goldEarned}</div>}
        {!touch.using && (
          <div className="tag" style={{ opacity: .85 }}>开火 <b>{FIRE_MODES[getFireMode()]}</b> · T</div>
        )}
      </div>

      <KillFeed />

      {hc && pl.alive && !IS_TOUCH && !touch.using && (
        <div id="prompt-e" className={canFuse ? 'fuse' : w.leg ? 'warn' : ''}>
          {canFuse
            ? <><kbd>F</kbd> 融合 →「{LEGENDS[findRecipe(w.id, hc.id)].name}」 · <kbd>E</kbd> 换枪</>
            : w.leg
              ? <><kbd>E</kbd> 换成 {WEAPONS[hc.id].name} Lv.{hc.lvl}（将永久丢弃传说「{LEGENDS[w.leg].name}」！）</>
              : <><kbd>E</kbd> 换成 {WEAPONS[hc.id].name} Lv.{hc.lvl}</>}
        </div>
      )}

      <div className="hud-bc">
        {pl.active && (
          <div id="active-chip" className={pl.activeCd > 0 ? 'cd' : ''}>
            <b>{IS_TOUCH ? '⚡' : 'Q'}</b>
            <span>{ACTIVES[pl.active.id].name} Lv{pl.active.lv}</span>
            <i>{pl.activeCd > 0 ? Math.ceil(pl.activeCd) + 's' : '就绪'}</i>
          </div>
        )}
        <div id="wpn-card">
          <WeaponIcon color={def.color} />
          <div>
            <div id="wpn-name">
              {w.leg
                ? <><span className="leg-name">「{def.name}」</span><small>传说</small></>
                : <>{def.name}<small>{def.country === 'CN' ? '国产' : def.country === 'US' ? '硅谷' : '国际'}</small></>}
            </div>
            <div id="wpn-pips">
              {[0, 1, 2, 3, 4].map(i => (
                <i key={i} className={w.leg ? 'leg' : i < w.lvl ? 'on' : ''} />
              ))}
            </div>
            <div id="wpn-hint">{hint}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
