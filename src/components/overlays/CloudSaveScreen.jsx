import React, { useEffect, useRef, useState } from 'react';
import { getOnlineState, updateNickname, uploadCloudSave, downloadCloudSave, initOnline } from '../../online/service.js';
import { useOnlineState } from '../../online/useOnlineState.js';

function fmtTime(iso) {
  if (!iso) return '无';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  } catch (_) {
    return String(iso);
  }
}

export default function CloudSaveScreen({ onClose }) {
  const online = useOnlineState();
  const seed = online.profile?.nickname || localStorage.getItem('niuma_nickname') || '匿名牛马';
  const [draft, setDraft] = useState(seed);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);
  const composingRef = useRef(false);

  useEffect(() => {
    // 仅在非输入中时同步服务端昵称到框内
    if (!composingRef.current && online.profile?.nickname && online.profile.nickname !== draft) {
      // 不强制覆盖用户正在编辑的内容：仅初始/空时同步
    }
  }, [online.profile?.nickname]);

  useEffect(() => {
    const t = setTimeout(() => {
      try { inputRef.current?.focus({ preventScroll: true }); } catch (_) { inputRef.current?.focus(); }
    }, 120);
    return () => clearTimeout(t);
  }, []);

  const saveName = async () => {
    const value = (inputRef.current?.value ?? draft).trim().slice(0, 12) || '匿名牛马';
    setDraft(value);
    if (inputRef.current) inputRef.current.value = value;
    setBusy(true);
    setMsg('保存昵称中……');
    const r = await updateNickname(value);
    setBusy(false);
    setMsg(r.ok ? `昵称已更新为「${value}」` : ('昵称更新失败：' + (r.message || r.error?.message || '')));
  };

  const doUpload = async () => {
    setBusy(true);
    setMsg('正在上传本地存档到云端……');
    const r = await uploadCloudSave();
    setBusy(false);
    setMsg(r.ok ? '上传成功：本地存档已覆盖云端。' : ('上传失败：' + (r.message || r.error?.message || '离线/未配置')));
  };

  const doDownload = async () => {
    setBusy(true);
    setMsg('正在从云端下载存档……');
    const r = await downloadCloudSave();
    setBusy(false);
    if (r.ok) {
      setMsg('下载成功：云端存档已写入本地。请返回主菜单刷新金币/图鉴。');
    } else {
      setMsg('下载失败：' + (r.message || r.error?.message || '云端暂无存档'));
    }
  };

  const reconnect = async () => {
    setBusy(true);
    setMsg('连接中……');
    await initOnline();
    const st = getOnlineState();
    setBusy(false);
    setMsg(st.online ? '已连接服务器。' : ('仍为离线：' + (st.lastError || '未知错误')));
  };

  const stopBubble = e => e.stopPropagation();
  const localAt = localStorage.getItem('niuma_local_updated_at');
  const cloudAt = online.cloudSave?.server_updated_at || online.cloudSave?.client_updated_at || null;

  return (
    <div className="modal-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal paper small-modal" onMouseDown={stopBubble} onTouchStart={stopBubble}>
        <button className="close" onClick={onClose}>×</button>
        <h2>云存档</h2>
        <div className="quote">
          状态：{online.configured ? (online.online ? '已连接' : '未连接') : '未配置 Supabase'}<br />
          玩家：{online.profile?.nickname || localStorage.getItem('niuma_nickname') || '匿名牛马'}<br />
          本地更新：{fmtTime(localAt)}<br />
          云端更新：{fmtTime(cloudAt)}<br />
          {online.lastError && <>提示：{online.lastError}<br /></>}
          {(online.setupHints || []).map((h, i) => <span key={i}>• {h}<br /></span>)}
        </div>

        <div className="trial-row nick-row" style={{ marginTop: 8 }}>
          <span className="trial-label">昵称（最多 12 字）：</span>
          {/*
            Android WebView + 中文输入法：受控 value 容易出现“能打字但不显示”。
            这里用 defaultValue + 非受控输入，保存时再读取 DOM 值。
          */}
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
            defaultValue={seed}
            maxLength={12}
            placeholder="输入昵称"
            onCompositionStart={() => { composingRef.current = true; }}
            onCompositionEnd={e => {
              composingRef.current = false;
              setDraft(e.currentTarget.value);
            }}
            onInput={e => {
              if (!composingRef.current) setDraft(e.currentTarget.value);
            }}
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
          <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} disabled={busy} onClick={saveName}>保存昵称</button>
        </div>
        <div className="tip-line" style={{ marginTop: 6 }}>
          预览：{draft || '（空）'}
        </div>

        <div className="btn-row" style={{ flexWrap: 'wrap' }}>
          <button className="btn" disabled={busy} onClick={doUpload}>上传到云端</button>
          <button className="btn ghost" disabled={busy} onClick={doDownload}>从云端下载</button>
          <button className="btn ghost" disabled={busy} onClick={reconnect}>重新连接</button>
        </div>
        {msg && <div className="tip-line">{msg}</div>}
        <div className="tip-line">
          上传 = 用本地覆盖云端；下载 = 用云端覆盖本地。启动时也会自动取较新的一方。
        </div>
      </div>
    </div>
  );
}
