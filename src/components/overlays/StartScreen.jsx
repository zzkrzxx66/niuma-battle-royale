import React, { useRef, useEffect, useState, useMemo } from 'react';
import { WEAPONS, LEGENDS, RECIPES } from '../../game/data/weapons.js';
import { TECH, ELITES, DISTILLS } from '../../game/data/tech.js';
import { SUBS } from '../../game/data/subweapons.js';
import { ACTIVES } from '../../game/data/actives.js';
import { COPY } from '../../game/data/copy.js';
import { chipSprite } from '../../game/sprites.js';
import { IS_TOUCH } from '../../game/input.js';
import { startGame, loadBest, loadGold, loadEndlessBest } from '../../game/core.js';
import { loadShopUpgrades, getUpgradeLevel } from '../../game/data/shop.js';
import ShopScreen from './ShopScreen.jsx';
import { pick } from '../../game/utils.js';
import workerNative from '../../assets/worker_native.png';

function DexIcon({ color }) {
  const ref = useRef(null);
  useEffect(() => {
    const g = ref.current.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(chipSprite(color), 0, 0);
  }, [color]);
  return <canvas ref={ref} width={9} height={8} />;
}

export default function StartScreen() {
  const [dexOpen, setDexOpen] = useState(false);
  const [trial, setTrial] = useState(() => {
    try { const v = parseInt(localStorage.getItem('niuma_trial') ?? '3', 10); return isNaN(v) ? 3 : Math.min(6, Math.max(0, v)); }
    catch (e) { return 3; }
  });
  const pickTrial = m => {
    setTrial(m);
    try { localStorage.setItem('niuma_trial', String(m)); } catch (e) { /* ignore */ }
  };
  const tip = useMemo(() => pick(COPY.tips), []);
  const best = useMemo(() => loadBest(), []);
  const gold = useMemo(() => loadGold(), []);
  const endlessBest = useMemo(() => loadEndlessBest(), []);
  const wRows = country => Object.entries(WEAPONS).filter(([, d]) => d.country === country);
  const [shopOpen, setShopOpen] = useState(false);
  const hasChooseWeapon = getUpgradeLevel(loadShopUpgrades(), 'start_weapon') > 0;
  const [chosenWeapon, setChosenWeapon] = useState(() => {
    try { return localStorage.getItem('niuma_chosen_weapon') || ''; } catch (e) { return ''; }
  });
  const allWeapons = Object.entries(WEAPONS);

  return (
    <div className="overlay">
      <div className="overlay-body">
        <div className="paper">
          <div className="doc-no">牛马发〔2026〕07号 · 全员必读 · 阅后即卷</div>
          {!dexOpen && <div className="art-worker" style={{ backgroundImage: `url(${workerNative})` }} />}
          <h1>{COPY.title}</h1>
          <div className="sub">{COPY.subtitle}</div>
          <div className="stamp">人事部<br />特批</div>
          <hr />
          <p>{COPY.intro}</p>
          <hr />
          {IS_TOUCH ? (
            <div className="kbd-row">
              <span><kbd>左半屏拖动</kbd> 移动</span><span><kbd>自动</kbd> 瞄准并开火</span>
              <span><kbd>右下按钮</kbd> 换枪 / 融合 / 冲刺</span><span><kbd>⏸</kbd> 暂停</span>
            </div>
          ) : (
            <div className="kbd-row">
              <span><kbd>WASD</kbd> 移动</span><span><kbd>鼠标</kbd> 瞄准 / 按住开火</span>
              <span><kbd>T</kbd> 自动开火/全托管（触控板党救星）</span>
              <span><kbd>E</kbd> 换武器</span><span><kbd>F</kbd> 融合</span>
              <span><kbd>Shift</kbd> 冲刺（需技能）</span><span><kbd>ESC</kbd> 暂停</span>
            </div>
          )}
          {best && (
            <div className="tip-line" style={{ color: '#8a8271' }}>
              历史最佳：第 <b>{best.rank}</b> 名 · 优化 {best.kills} 人 —— 还能更卷。
            </div>
          )}
          {endlessBest > 0 && (
            <div className="tip-line" style={{ color: '#ff9440' }}>
              无尽模式最高记录：第 <b>{endlessBest}</b> 波
            </div>
          )}
          {gold > 0 && (
            <div className="tip-line" style={{ color: '#ffcf33' }}>
              💰 金币余额：<b>{gold}</b>
            </div>
          )}
          <div className="trial-row">
            <span className="trial-label">试用期（每月一波琐事 + 月度考核 Boss，期间同事互不伤害）：</span>
            {[0, 1, 2, 3, 4, 5, 6].map(m => (
              <button key={m} className={'trial-btn' + (trial === m ? ' on' : '')} onClick={() => pickTrial(m)}>
                {m === 0 ? '免' : m}
              </button>
            ))}
            <span className="trial-note">
              {trial === 0 ? '空降老兵，直接开卷（硬核）'
                : trial <= 2 ? `${trial} 个月发育期（快节奏）`
                : trial <= 4 ? `${trial} 个月发育期（标准）`
                : `${trial} 个月发育期（充分发育，后期琐事凶猛；缩圈相应提前）`}
            </span>
          </div>
          {hasChooseWeapon && (
            <div className="trial-row" style={{ flexWrap: 'wrap', marginTop: '6px' }}>
              <span className="trial-label">内推信 · 开局武器：</span>
              <select
                value={chosenWeapon}
                onChange={e => {
                  setChosenWeapon(e.target.value);
                  try { localStorage.setItem('niuma_chosen_weapon', e.target.value); } catch (err) {}
                }}
                style={{ fontSize: '11px', padding: '2px 6px', border: '2px solid #000', background: '#fff', color: 'var(--ink)', fontFamily: 'var(--mono)', maxWidth: '160px' }}
              >
                <option value="">随机</option>
                {allWeapons.map(([id, d]) => (
                  <option key={id} value={id}>{d.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="btn-row">
            <button className="btn" onClick={() => startGame('battle')}>大逃杀</button>
            <button className="btn" style={{ background: 'var(--us)', color: '#fff' }} onClick={() => startGame('endless')}>无尽模式</button>
            <button className="btn" style={{ background: 'var(--badge)' }} onClick={() => setShopOpen(true)}>💰 商城</button>
            <button className="btn ghost" onClick={() => setDexOpen(o => !o)}>图鉴 {dexOpen ? '▴' : '▾'}</button>
          </div>
          {shopOpen && <ShopScreen onClose={() => setShopOpen(false)} />}
          {dexOpen && (
            <div id="dex">
              <div className="dex-sec">— 国产队 —</div>
              {wRows('CN').map(([id, d]) => (
                <div className="dex-row" key={id}>
                  <DexIcon color={d.color} /><span className="d-name d-cn">{d.name}</span><span className="d-pat">{d.pat}</span>
                </div>
              ))}
              <div className="dex-sec">— 硅谷队 —</div>
              {wRows('US').map(([id, d]) => (
                <div className="dex-row" key={id}>
                  <DexIcon color={d.color} /><span className="d-name d-us">{d.name}</span><span className="d-pat">{d.pat}</span>
                </div>
              ))}
              <div className="dex-sec">— 国际队 —</div>
              {wRows('EU').concat(wRows('RU')).map(([id, d]) => (
                <div className="dex-row" key={id}>
                  <DexIcon color={d.color} /><span className="d-name" style={{ color: '#e8a020' }}>{d.name}</span><span className="d-pat">{d.pat}</span>
                </div>
              ))}
              <div className="dex-sec">— 传说融合 —</div>
              {RECIPES.map(([a, b, leg]) => (
                <div className="dex-row" key={leg}>
                  <DexIcon color={LEGENDS[leg].color} />
                  <span className="d-name" style={{ color: 'var(--stamp)' }}>{LEGENDS[leg].name}</span>
                  <span className="d-pat">{WEAPONS[a].name} 满级 + {WEAPONS[b].name} 芯片 · {LEGENDS[leg].pat}</span>
                </div>
              ))}
              <div className="dex-sec">— 技术模组（随机 标准/Pro/Ultra 品级，踩上自动装备）—</div>
              {Object.values(TECH).map(t => (
                <div className="dex-row" key={t.name}>
                  <span className="d-name" style={{ color: t.color === '#ffffff' || t.color === '#e8e4d8' ? '#6b6455' : t.color }}>{t.name}</span>
                  <span className="d-pat">{t.desc} —— {t.tag}</span>
                </div>
              ))}
              <div className="dex-sec">— 副武器·办公室兵器（升级抽蓝卡，最多 3 件，自动索敌）—</div>
              {Object.values(SUBS).map(s => (
                <div className="dex-row" key={s.name}>
                  <span className="d-name" style={{ color: '#2c6cd8' }}>{s.name}</span>
                  <span className="d-pat">{s.eff[0]} —— {s.tag}</span>
                </div>
              ))}
              <div className="dex-sec">— 主动技能（升级抽紫卡，Q 键释放，仅 1 槽）—</div>
              {Object.values(ACTIVES).map(a => (
                <div className="dex-row" key={a.name}>
                  <span className="d-name" style={{ color: '#8a3fd0' }}>{a.name}</span>
                  <span className="d-pat">{a.eff[0]} —— {a.tag}</span>
                </div>
              ))}
              <div className="dex-sec">— 蒸馏池（「大模型蒸馏」随机获得其一）—</div>
              {Object.values(DISTILLS).map(d => (
                <div className="dex-row" key={d.name}>
                  <span className="d-name" style={{ color: '#b665ff' }}>{d.name}</span>
                  <span className="d-pat">来自 {d.src} —— {d.desc}</span>
                </div>
              ))}
              <div className="dex-sec">— 精英野怪（击杀必掉模组）—</div>
              {Object.values(ELITES).filter(e => e.tier === 1).map(e => (
                <div className="dex-row" key={e.name}>
                  <span className="d-name" style={{ color: '#c58fff' }}>{e.name}</span>
                  <span className="d-pat">{e.dex}</span>
                </div>
              ))}
              <div className="dex-sec">— 职场怪物·小 Boss（稀有，掉双倍模组+补给）—</div>
              {Object.values(ELITES).filter(e => e.tier === 2).map(e => (
                <div className="dex-row" key={e.name}>
                  <span className="d-name" style={{ color: '#ff9440' }}>{e.name}</span>
                  <span className="d-pat">{e.dex}</span>
                </div>
              ))}
            </div>
          )}
          <div className="tip-line">{tip}</div>
        </div>
      </div>
    </div>
  );
}
