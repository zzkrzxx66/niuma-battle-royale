import React, { useRef, useEffect } from 'react';
import { VIEW_W, VIEW_H } from '../game/constants.js';
import { attachInput } from '../game/input.js';
import { getState, update } from '../game/core.js';
import { render } from '../game/render.js';
import { loadHiFi } from '../game/hifi.js';
import * as bridge from '../game/bridge.js';

export default function GameCanvas() {
  const cvRef = useRef(null);
  const stageRef = useRef(null);

  useEffect(() => {
    const cv = cvRef.current, stage = stageRef.current;
    const ctx = cv.getContext('2d');
    attachInput(cv, stage);
    loadHiFi();   // 高清素材异步加载，完成前自动回退字符画

    const fit = () => {
      const scale = Math.min(innerWidth / VIEW_W, innerHeight / VIEW_H);
      cv.style.width = Math.floor(VIEW_W * scale) + 'px';
      cv.style.height = Math.floor(VIEW_H * scale) + 'px';
    };
    fit();
    addEventListener('resize', fit);

    let raf, lastT = 0, notifyT = 0;
    const loop = t => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(.033, (t - lastT) / 1000 || .016);
      lastT = t;
      if (getState() === 'playing') update(dt);
      render(ctx);
      notifyT += dt;
      if (notifyT > .1) { notifyT = 0; bridge.notify(); }   // HUD 节流刷新
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', fit); };
  }, []);

  return (
    <div id="stage" ref={stageRef}>
      <canvas id="cv" ref={cvRef} width={VIEW_W} height={VIEW_H} />
    </div>
  );
}
