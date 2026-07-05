import React, { useMemo } from 'react';
import { ACHIEVEMENTS, loadAchievements, loadStats } from '../../game/data/achievements.js';

export default function AchievementScreen({ onClose }) {
  const got = useMemo(() => loadAchievements(), []);
  const stats = useMemo(() => loadStats(), []);
  const count = ACHIEVEMENTS.filter(a => got[a.id]).length;
  return (
    <div className="overlay"><div className="overlay-body"><div className="paper" style={{ width: 'min(720px,96vw)' }}>
      <div className="doc-no">职业履历 · 成就档案</div><h2>🏆 成就</h2>
      <div className="sub">已完成 {count}/{ACHIEVEMENTS.length} · 累计击杀 {stats.kills || 0} · 最高无尽 {stats.bestEndless || 0} 波</div><hr />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, maxHeight:'48vh', overflow:'auto' }}>
        {ACHIEVEMENTS.map(a => {
          const ok = !!got[a.id];
          return <div key={a.id} style={{ border:'2px solid #000', background: ok?'rgba(255,207,51,.18)':'#fff', color:'var(--ink)', padding:8, boxShadow:'2px 2px 0 rgba(0,0,0,.25)' }}>
            <b style={{ fontSize:13 }}>{ok ? '✅' : '⬜'} {a.name}</b>
            <div style={{ fontSize:10, color:'#666', marginTop:3 }}>{a.desc}</div>
            <div style={{ fontSize:10, color:'#c28b00', marginTop:4 }}>奖励：{a.reward} 金币 {ok ? '· 已领取' : ''}</div>
          </div>;
        })}
      </div>
      <div className="btn-row"><button className="btn ghost" onClick={onClose}>返回大厅</button></div>
    </div></div></div>
  );
}
