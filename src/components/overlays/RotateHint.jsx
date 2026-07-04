import React, { useState } from 'react';

export default function RotateHint() {
  const [off, setOff] = useState(false);
  return (
    <div id="rotate-hint" className={off ? 'off' : ''}>
      <div>
        <div className="r-ico">📱↻</div>
        横屏体验更佳<br />
        <button className="btn ghost" style={{ marginTop: 12 }} onClick={() => setOff(true)}>竖屏硬玩</button>
      </div>
    </div>
  );
}
