import React, { useEffect, useState } from 'react';
import { getLeaderboard } from '../../online/service.js';
import { todayKey } from '../../online/client.js';
import { fmtTime } from '../../game/utils.js';

export default function LeaderboardScreen({ onClose, initialMode = 'classic' }) {
  const [mode, setMode] = useState(initialMode);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true); setMsg('');
    const date = mode === 'daily' ? todayKey() : null;
    getLeaderboard(mode === 'daily' ? 'daily' : mode, date).then(r => {
      if (!alive) return;
      setItems(r.items || []);
      if (r.offline) setMsg('未配置/未连接服务器，暂时只能查看本地成绩。');
      if (r.error) setMsg(r.error.message || String(r.error));
    }).finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [mode]);
  return <div className="modal-back"><div className="modal paper small-modal">
    <button className="close" onClick={onClose}>×</button>
    <h2>全服排行榜</h2>
    <div className="btn-row" style={{ marginBottom: 8 }}>
      <button className={'trial-btn' + (mode === 'classic' ? ' on' : '')} onClick={() => setMode('classic')}>经典总榜</button>
      <button className={'trial-btn' + (mode === 'daily' ? ' on' : '')} onClick={() => setMode('daily')}>今日挑战</button>
      <button className={'trial-btn' + (mode === 'endless' ? ' on' : '')} onClick={() => setMode('endless')}>无尽总榜</button>
    </div>
    {loading && <div className="tip-line">正在拉取榜单……</div>}
    {msg && <div className="tip-line" style={{ color: '#c45' }}>{msg}</div>}
    <table className="stat-table"><tbody>
      <tr><td>#</td><td>昵称</td><td>分数</td><td>时间/击杀</td></tr>
      {items.map(x => <tr key={x.id}>
        <td>{x.rank}</td>
        <td>{x.profiles?.nickname || '匿名牛马'}</td>
        <td>{x.score}</td>
        <td>{fmtTime(x.survive_time || 0)} / {x.kills}</td>
      </tr>)}
    </tbody></table>
    {!loading && items.length === 0 && <div className="quote">暂无榜单数据。配置 Supabase 并完成一局后，就会出现在这里。</div>}
  </div></div>;
}
