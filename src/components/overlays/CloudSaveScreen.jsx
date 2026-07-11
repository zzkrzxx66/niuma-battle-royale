import React, { useState } from 'react';
import { getOnlineState, updateNickname, uploadCloudSave, initOnline } from '../../online/service.js';
import { useOnlineState } from '../../online/useOnlineState.js';

export default function CloudSaveScreen({ onClose }) {
  const online = useOnlineState();
  const [name, setName] = useState(() => online.profile?.nickname || localStorage.getItem('niuma_nickname') || '匿名牛马');
  const [msg, setMsg] = useState('');
  const sync = async () => {
    setMsg('同步中……');
    const r = await uploadCloudSave();
    setMsg(r.ok ? '云存档已上传。' : ('同步失败：' + (r.message || r.error?.message || '离线/未配置')));
  };
  const saveName = async () => {
    const r = await updateNickname(name);
    setMsg(r.ok ? '昵称已更新。' : ('昵称更新失败：' + (r.message || r.error?.message || '')));
  };
  const reconnect = async () => {
    setMsg('连接中……');
    await initOnline();
    const st = getOnlineState();
    setMsg(st.online ? '已连接服务器。' : ('仍为离线：' + (st.lastError || '未知错误')));
  };
  return <div className="modal-back"><div className="modal paper small-modal">
    <button className="close" onClick={onClose}>×</button>
    <h2>云存档</h2>
    <div className="quote">
      状态：{online.configured ? (online.online ? '已连接' : '未连接') : '未配置 Supabase'}<br />
      玩家：{online.profile?.nickname || localStorage.getItem('niuma_nickname') || '匿名牛马'}<br />
      {online.lastError && <>提示：{online.lastError}<br /></>}
      {(online.setupHints || []).map((h, i) => <span key={i}>• {h}<br /></span>)}
    </div>
    <div className="trial-row" style={{ marginTop: 8 }}>
      <span className="trial-label">昵称：</span>
      <input value={name} maxLength={12} onChange={e => setName(e.target.value)} style={{ fontSize: 12, padding: '4px 6px', border: '2px solid #000', fontFamily: 'var(--mono)' }} />
      <button className="trial-btn on" onClick={saveName}>保存</button>
    </div>
    <div className="btn-row">
      <button className="btn" onClick={sync}>立即同步</button>
      <button className="btn ghost" onClick={reconnect}>重新连接</button>
    </div>
    {msg && <div className="tip-line">{msg}</div>}
    <div className="tip-line">没网也能玩；结算成绩会进入待上传队列。后台配置完成后点“重新连接”。</div>
  </div></div>;
}
