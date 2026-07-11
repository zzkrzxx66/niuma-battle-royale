import React, { useEffect, useRef, useState } from 'react';
import { getOnlineState, updateNickname, uploadCloudSave, initOnline } from '../../online/service.js';
import { useOnlineState } from '../../online/useOnlineState.js';

export default function CloudSaveScreen({ onClose }) {
  const online = useOnlineState();
  const [name, setName] = useState(() => online.profile?.nickname || localStorage.getItem('niuma_nickname') || '匿名牛马');
  const [msg, setMsg] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    // 打开弹窗后主动聚焦，Android WebView 更容易弹出键盘
    const t = setTimeout(() => {
      try { inputRef.current?.focus({ preventScroll: true }); } catch (_) { inputRef.current?.focus(); }
    }, 80);
    return () => clearTimeout(t);
  }, []);

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
  const stopBubble = e => e.stopPropagation();
  return <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal paper small-modal" onMouseDown={stopBubble} onTouchStart={stopBubble}>
    <button className="close" onClick={onClose}>×</button>
    <h2>云存档</h2>
    <div className="quote">
      状态：{online.configured ? (online.online ? '已连接' : '未连接') : '未配置 Supabase'}<br />
      玩家：{online.profile?.nickname || localStorage.getItem('niuma_nickname') || '匿名牛马'}<br />
      {online.lastError && <>提示：{online.lastError}<br /></>}
      {(online.setupHints || []).map((h, i) => <span key={i}>• {h}<br /></span>)}
    </div>
    <div className="trial-row nick-row" style={{ marginTop: 8 }}>
      <span className="trial-label">昵称：</span>
      <input
        ref={inputRef}
        className="nick-input"
        type="text"
        inputMode="text"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        value={name}
        maxLength={12}
        placeholder="输入昵称"
        onChange={e => setName(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            saveName();
          }
        }}
        onKeyUp={e => e.stopPropagation()}
        onPointerDown={e => e.stopPropagation()}
        onTouchStart={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation();
          try { e.currentTarget.focus({ preventScroll: true }); } catch (_) { e.currentTarget.focus(); }
        }}
      />
      <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={saveName}>保存</button>
    </div>
    <div className="btn-row">
      <button className="btn" onClick={sync}>立即同步</button>
      <button className="btn ghost" onClick={reconnect}>重新连接</button>
    </div>
    {msg && <div className="tip-line">{msg}</div>}
    <div className="tip-line">点昵称框弹出键盘后修改，再点保存。没网也能玩；成绩会进入待上传队列。</div>
  </div></div>;
}
