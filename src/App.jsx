import React, { useSyncExternalStore, useEffect } from 'react';
import * as bridge from './game/bridge.js';
import { getG, getState } from './game/core.js';
import { toggleMuted } from './game/audio.js';
import GameCanvas from './components/GameCanvas.jsx';
import Hud from './components/Hud.jsx';
import TouchControls from './components/TouchControls.jsx';
import StartScreen from './components/overlays/StartScreen.jsx';
import LevelUpScreen from './components/overlays/LevelUpScreen.jsx';
import PauseScreen from './components/overlays/PauseScreen.jsx';
import EndScreen from './components/overlays/EndScreen.jsx';
import RotateHint from './components/overlays/RotateHint.jsx';

export default function App() {
  useSyncExternalStore(bridge.subscribe, bridge.getVersion);
  const state = getState();
  const G = getG();

  useEffect(() => bridge.on('mute-toggle', () => { toggleMuted(); bridge.notify(); }), []);

  return (
    <>
      <GameCanvas />
      {G && state !== 'menu' && <Hud />}
      <TouchControls />
      {state === 'menu' && <StartScreen />}
      {state === 'levelup' && <LevelUpScreen />}
      {state === 'paused' && <PauseScreen />}
      {(state === 'dead' || state === 'win') && <EndScreen win={state === 'win'} />}
      <RotateHint />
      <div id="mute-note">M 静音 · ESC 暂停</div>
    </>
  );
}
