import React, { useState, useMemo, useCallback } from 'react';
import { SHOP_ITEMS, loadShopUpgrades, getUpgradeLevel, purchaseUpgrade } from '../../game/data/shop.js';
import { loadGold } from '../../game/core.js';

export default function ShopScreen({ onClose }) {
  const [gold, setGold] = useState(() => loadGold());
  const [upgrades, setUpgrades] = useState(() => loadShopUpgrades());
  const [msg, setMsg] = useState('');

  const handleBuy = useCallback((itemId) => {
    const ups = loadShopUpgrades();
    const g = loadGold();
    const result = purchaseUpgrade(ups, g, itemId);
    if (result.success) {
      /* 扣金币 */
      try { localStorage.setItem('niuma_gold', String(result.goldLeft)); } catch (e) {}
      setGold(result.goldLeft);
      setUpgrades({ ...ups });
      const item = SHOP_ITEMS.find(i => i.id === itemId);
      setMsg(`✅ 购买成功：${item.name} → Lv.${getUpgradeLevel(ups, itemId)}`);
    } else {
      setMsg(`❌ ${result.error}`);
    }
    setTimeout(() => setMsg(''), 2500);
  }, []);

  return (
    <div className="overlay">
      <div className="overlay-body">
        <div className="paper" style={{ width: 'min(720px, 96vw)' }}>
          <div className="doc-no">员工福利商店 · 凭金币消费</div>
          <h2>💰 福利商店</h2>
          <div className="stamp" style={{ borderColor: '#ffcf33', color: '#ffcf33', fontSize: '11px' }}>
            余额<br /><b style={{ fontSize: '16px' }}>{gold}</b><br />金币
          </div>
          <div className="sub">永久升级，购买后每局自动生效。金币通过击杀敌人和无尽模式获得。</div>
          <hr />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
            {SHOP_ITEMS.map(item => {
              const lv = getUpgradeLevel(upgrades, item.id);
              const maxed = lv >= item.max;
              const cost = maxed ? 0 : item.cost[lv];
              const canAfford = gold >= cost && !maxed;
              return (
                <div key={item.id} style={{
                  border: '2px solid #000',
                  background: maxed ? 'rgba(78,201,160,.15)' : '#fff',
                  padding: '8px 10px',
                  position: 'relative',
                  boxShadow: '2px 2px 0 rgba(0,0,0,.25)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '18px' }}>{item.icon}</span>
                    <b style={{ fontSize: '13px', color: 'var(--ink)' }}>{item.name}</b>
                  </div>
                  <div style={{ fontSize: '10px', color: '#666', margin: '3px 0', lineHeight: 1.3 }}>
                    {item.desc}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                    <span style={{ fontSize: '9px', color: '#888' }}>
                      {Array.from({ length: item.max }, (_, i) =>
                        <span key={i} style={{ color: i < lv ? '#ffcf33' : '#ccc', fontSize: '12px' }}>★</span>
                      )}
                    </span>
                    {maxed ? (
                      <span style={{ fontSize: '11px', color: 'var(--cn)', fontWeight: 700 }}>已满级</span>
                    ) : (
                      <button
                        onClick={() => handleBuy(item.id)}
                        disabled={!canAfford}
                        style={{
                          fontSize: '11px', fontWeight: 700, cursor: canAfford ? 'pointer' : 'not-allowed',
                          padding: '3px 10px', border: '2px solid #000',
                          background: canAfford ? 'var(--badge)' : '#ddd',
                          color: canAfford ? 'var(--ink)' : '#999',
                          boxShadow: canAfford ? '2px 2px 0 rgba(0,0,0,.3)' : 'none',
                        }}
                      >
                        💰 {cost}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {msg && (
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '12px', fontWeight: 700, color: msg.startsWith('✅') ? 'var(--cn)' : 'var(--danger)' }}>
              {msg}
            </div>
          )}

          <div className="btn-row" style={{ marginTop: '10px' }}>
            <button className="btn ghost" onClick={onClose}>返回大厅</button>
          </div>
        </div>
      </div>
    </div>
  );
}
