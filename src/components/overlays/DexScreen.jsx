import React, { useMemo, useState } from 'react';
import { DEX_SECTIONS, loadDex } from '../../game/data/dex.js';

export default function DexScreen({ onClose }) {
  const [secId, setSecId] = useState('weapons');
  const dex = useMemo(() => loadDex(), []);
  const sec = DEX_SECTIONS.find(s => s.id === secId) || DEX_SECTIONS[0];
  const gotMap = dex[sec.id] || {};
  const ids = Object.keys(sec.source);
  const got = ids.filter(id => gotMap[id]).length;
  return (
    <div className="overlay"><div className="overlay-body"><div className="paper" style={{ width:'min(760px,96vw)' }}>
      <div className="doc-no">公司资产盘点 · 图鉴收集</div><h2>📚 图鉴</h2>
      <div className="sub">遇到/使用/融合后自动点亮。当前：{sec.name} {got}/{ids.length}</div><hr />
      <div className="btn-row" style={{ marginTop: 4 }}>
        {DEX_SECTIONS.map(s => {
          const m = dex[s.id] || {}; const n = Object.keys(s.source).filter(id => m[id]).length;
          return <button key={s.id} className={s.id === secId ? 'btn' : 'btn ghost'} onClick={() => setSecId(s.id)}>{s.name} {n}/{Object.keys(s.source).length}</button>;
        })}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, maxHeight:'44vh', overflow:'auto', marginTop:8 }}>
        {ids.map(id => {
          const d = sec.source[id]; const ok = !!gotMap[id];
          return <div key={id} style={{ border:'2px solid #000', background:ok?'#fff':'#d8d3c4', color:'var(--ink)', padding:7, opacity:ok?1:.65 }}>
            <b style={{ fontSize:12 }}>{ok ? (d.name || id) : '???'}</b>
            <div style={{ fontSize:9, color:'#666', lineHeight:1.35 }}>{ok ? (d.pat || d.desc || d.tagline || `HP ${d.hp || '-'} / XP ${d.xp || '-'}`) : '尚未发现'}</div>
          </div>;
        })}
      </div>
      <div className="btn-row"><button className="btn ghost" onClick={onClose}>返回大厅</button></div>
    </div></div></div>
  );
}
