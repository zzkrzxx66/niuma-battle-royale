import React, { useRef, useEffect } from 'react';
import { touch, registerJoyEl } from '../game/input.js';
import { getG, getState, playerDash, playerSwap, playerFuse, togglePause, castActive } from '../game/core.js';
import { ACTIVES } from '../game/data/actives.js';
import { findRecipe } from '../game/data/weapons.js';

export default function TouchControls() {
  const joyRef = useRef(null);
  useEffect(() => { registerJoyEl(joyRef.current); }, []);

  const G = getG();
  const state = getState();
  const show = touch.using && state === 'playing' && G;
  const pl = G && G.player;
  const hc = G && G.hoverChip;
  const canFuse = show && hc && pl.alive && !pl.weapon.leg && pl.weapon.lvl >= 5 && findRecipe(pl.weapon.id, hc.id);

  const prevent = fn => e => { e.preventDefault(); fn(); };

  return (
    <>
      {show && (
        <div id="touch-ui">
          <div className="tbtn" id="btn-pause-m" onTouchStart={prevent(togglePause)}>⏸</div>
          {hc && pl.alive && (
            <div className={'tbtn' + (canFuse ? ' fuse' : '')} id="btn-interact-m"
              style={{ display: 'flex' }}
              onTouchStart={prevent(() => (canFuse ? playerFuse() : playerSwap()))}>
              {canFuse ? '融合!' : '换枪'}
            </div>
          )}
          {pl && pl.mods.dashCd > 0 && (
            <div className={'tbtn' + (pl.dashT > 0 ? ' cd' : '')} id="btn-dash-m"
              style={{ display: 'flex' }}
              onTouchStart={prevent(() => state === 'playing' && playerDash())}>
              {pl.dashT > 0 ? Math.ceil(pl.dashT) + 's' : '冲刺'}
            </div>
          )}
          {pl && pl.active && (
            <div className={'tbtn' + (pl.activeCd > 0 ? ' cd' : '')} id="btn-active-m"
              style={{ display: 'flex' }}
              onTouchStart={prevent(() => state === 'playing' && castActive())}>
              {pl.activeCd > 0 ? Math.ceil(pl.activeCd) + 's' : ACTIVES[pl.active.id].name.slice(0, 2)}
            </div>
          )}
        </div>
      )}
      <div id="joy" ref={joyRef}>
        <div className="base" />
        <div className="knob" />
      </div>
    </>
  );
}
