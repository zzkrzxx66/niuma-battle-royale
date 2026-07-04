import React, { useMemo } from 'react';
import { TUNE } from '../../game/constants.js';
import { fmtTime, randi, pick } from '../../game/utils.js';
import { COPY } from '../../game/data/copy.js';
import { getG, wpnName, startGame, backToMenu } from '../../game/core.js';
import bossNative from '../../assets/boss_native.png';

export default function EndScreen({ win }) {
  const G = getG();
  const pl = G.player;
  const docNo = useMemo(() => randi(10000, 99999), []);
  const techCount = Object.values(pl.tech).reduce((a, b) => a + b, 0);
  const quote = win ? (G.winLine || pick(COPY.winLines)) : G.deathLine;

  return (
    <div className="overlay">
      <div className="overlay-body">
        <div className="paper">
          {win ? (
            <>
              <div className="doc-no">表彰文件 · 抄送全体（已离职）成员</div>
              <h2>优秀员工证书</h2>
              <div className="stamp" style={{ borderColor: '#c9a227', color: '#c9a227' }}>年度<br />卷王</div>
              <div className="sub">在本季度大逃杀中表现"卓越"，特发此证，以资鼓励。</div>
            </>
          ) : (
            <>
              <div className="doc-no">编号 HR-{docNo} · 即日生效</div>
              <h2>离 职 证 明</h2>
              <div className="stamp">已优化</div>
              <div className="sub">兹证明该牛马已完成本轮大逃杀的全部流程。</div>
            </>
          )}
          <hr />
          <div className="rank-big">#{win ? 1 : G.playerRank}<small> / {TUNE.botCount + 1}</small></div>
          <table className="stat-table"><tbody>
            <tr><td>存活时间</td><td>{fmtTime(G.t)}</td></tr>
            <tr><td>优化同事</td><td>{G.kills} 人</td></tr>
            <tr><td>最终职级</td><td>LV.{pl.level}</td></tr>
            <tr><td>随身武器</td><td>{wpnName(pl)}</td></tr>
            <tr><td>装备模组</td><td>{techCount} 个</td></tr>
          </tbody></table>
          {!win && G.deathInfo && (
            <div className="quote" style={{ borderLeftColor: 'var(--danger)' }}>
              致命一击：被 {G.deathInfo.killer}{G.deathInfo.weapon ? ` 用 ${G.deathInfo.weapon}` : ''} 优化。
              {G.deathInfo.remaining > 0 && G.deathInfo.remaining <= 3 ? ` 距离吃鸡只差 ${G.deathInfo.remaining} 人！` : ''}
              {G.deathInfo.bossPct != null && G.deathInfo.bossPct <= 40 ? ` 老板只剩 ${G.deathInfo.bossPct}% 血了！` : ''}
            </div>
          )}
          <div className="quote">{quote}</div>
          {G.newBest && <div className="stamp newbest">新纪录<br />NEW</div>}
          {win && <div className="art-boss" style={{ backgroundImage: `url(${bossNative})` }} />}
          <div className="btn-row">
            <button className="btn" onClick={startGame}>{win ? '再上一天班' : '重新入职'}</button>
            <button className="btn ghost" onClick={backToMenu}>回到大厅</button>
          </div>
        </div>
      </div>
    </div>
  );
}
