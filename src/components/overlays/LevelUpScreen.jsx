import React from 'react';
import { getG, getLevelChoices, pickLevelChoice, rerollLevelup } from '../../game/core.js';

import { IS_TOUCH } from '../../game/input.js';

export default function LevelUpScreen() {
  const G = getG();
  const pl = G.player;
  const choices = getLevelChoices();

  return (
    <div className="overlay">
      <div className="overlay-body">
        <div className="paper">
          <div className="doc-no">内部晋升 · 第 {pl.level} 级 · {choices.length}选一，过时不候</div>
          <h2>晋升审批单</h2>
          <div className="sub">恭喜升职！请选择一项"个人发展方向"（选错概不负责）</div>
          {G.rerollCredits > 0 && (
            <button className="btn ghost" style={{ marginTop: 10 }} onClick={rerollLevelup}>
              🔄 简历刷新：免费重抽（剩 {G.rerollCredits} 次）
            </button>
          )}
          <div id="levelup-cards">
            {choices.map((s, i) => (
              <div className={'skill-card' + (s.rare ? ' rare' : s.kind === 'sub' ? ' sub' : s.kind === 'active' ? ' act' : '')}
                key={s.kind + s.id} tabIndex={0}
                onClick={() => pickLevelChoice(i)}
                onKeyDown={e => e.key === 'Enter' && pickLevelChoice(i)}>
                <div className="k-no">{s.kind === 'sub' ? 'GEAR' : s.kind === 'active' ? 'ACTIVE' : 'SKILL'}-{String(s.id).toUpperCase().slice(0, 12)}</div>
                {s.kind === 'skill' && pl.skills[s.id] ? <div className="k-stack">已持有 {pl.skills[s.id]}/{s.max}</div> : null}
                <div className="k-name">{s.rare ? '✨ ' : s.kind === 'sub' ? '🔧 ' : s.kind === 'active' ? '⚡ ' : ''}{s.name}</div>
                <div className="k-eff">{s.eff}</div>
                {s.rare && <div className="k-eff" style={{ color: '#c9a227' }}>★ 精修版：效果双倍</div>}
                <div className="k-tag">{s.tag}</div>
                {!IS_TOUCH && <div className="k-key">{i + 1}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
