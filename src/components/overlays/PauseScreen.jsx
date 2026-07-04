import React, { useMemo } from 'react';
import { COPY } from '../../game/data/copy.js';
import { shuffle } from '../../game/utils.js';
import { startGame, togglePause } from '../../game/core.js';
import { isMuted, toggleMuted } from '../../game/audio.js';
import * as bridge from '../../game/bridge.js';

export default function PauseScreen() {
  const tips = useMemo(() => shuffle(COPY.tips).slice(0, 3), []);

  return (
    <div className="overlay">
      <div className="overlay-body">
        <div className="paper">
          <div className="doc-no">带薪休息申请 · 审批中</div>
          <h2>带薪休息中</h2>
          <div className="sub">工位还在，人先缓缓。</div>
          <hr />
          {tips.map((t, i) => <div className="tip-line" key={i}>{t}</div>)}
          <div className="btn-row">
            <button className="btn" onClick={togglePause}>回去搬砖</button>
            <button className="btn ghost" onClick={startGame}>重开一局</button>
            <button className="btn ghost" onClick={() => { toggleMuted(); bridge.notify(); }}>
              {isMuted() ? '开声音' : '静音'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
