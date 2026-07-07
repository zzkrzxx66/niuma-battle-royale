import React from 'react';
import { useOnlineState } from '../../online/useOnlineState.js';
import { startGame } from '../../game/core.js';

export default function DailyChallengeScreen({ onClose, onLeaderboard }) {
  const { dailyChallenge } = useOnlineState();
  const dc = dailyChallenge;
  const rules = dc?.rules || {};
  const mods = rules.modifiers || {};
  const begin = () => {
    try { localStorage.setItem('niuma_daily_challenge', JSON.stringify(dc)); } catch (e) {}
    startGame('daily');
  };
  return <div className="modal-back"><div className="modal paper small-modal">
    <button className="close" onClick={onClose}>×</button>
    <h2>每日挑战</h2>
    <div className="doc-no">{dc?.challenge_date || '今日'} · {dc?.seed || ''}</div>
    <div className="quote">
      <b>{dc?.title || '今日挑战'}</b><br />
      {dc?.description || '每天一套固定规则，和全服牛马一起卷。'}
    </div>
    <table className="stat-table"><tbody>
      <tr><td>武器池</td><td>{rules.weaponPool ? rules.weaponPool.join(' / ') : '不限'}</td></tr>
      <tr><td>敌人速度</td><td>{mods.enemySpeedMul ? `×${mods.enemySpeedMul}` : '×1.0'}</td></tr>
      <tr><td>敌人血量</td><td>{mods.enemyHpMul ? `×${mods.enemyHpMul}` : '×1.0'}</td></tr>
      <tr><td>金币收益</td><td>{mods.goldMul ? `×${mods.goldMul}` : '×1.0'}</td></tr>
      <tr><td>奖励</td><td>完成后 +{dc?.reward_gold || 80} 金币</td></tr>
    </tbody></table>
    <div className="btn-row">
      <button className="btn" onClick={begin}>开始今日挑战</button>
      <button className="btn ghost" onClick={onLeaderboard}>今日榜</button>
    </div>
  </div></div>;
}
