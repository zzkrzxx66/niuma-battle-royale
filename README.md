# 牛马大逃杀 · NIUMA BATTLE ROYALE

像素风肉鸽大逃杀：牛马用中美各家 AI 当武器，升级、融合、跑毒，活到最后再上班。
桌面（键鼠）与移动端（虚拟摇杆 + 自动瞄准）均可游玩。

## 运行

```bash
npm install
npm run dev      # 开发服务器 http://localhost:5173
npm run build    # 生产构建到 dist/
```

## 架构

游戏引擎是**纯 JS 模块**（不依赖 React），React 只负责 UI 层，两边通过 `bridge.js` 通信
（事件：击杀播报/缩圈通告；版本号订阅：HUD 以 ~10Hz 节流刷新）。

```
src/
├── game/                  # 引擎（框架无关）
│   ├── constants.js       # 视口、平衡数值（TUNE：血量/缩圈/Boss 时间轴）
│   ├── data/              # ★ 内容数据表——扩展游戏主要改这里
│   │   ├── weapons.js     #   12 武器 + 6 传说 + 融合配方
│   │   ├── skills.js      #   升级三选一职场技能
│   │   ├── tech.js        #   技术模组 / 诅咒 / 精英野怪
│   │   ├── consumables.js #   地面消耗品
│   │   └── copy.js        #   全部文案（机器人名字/Boss台词/死亡语录…）
│   ├── sprites.js         # 字符画像素精灵
│   ├── audio.js           # WebAudio 合成音效
│   ├── input.js           # 键盘 / 鼠标 / 触屏摇杆
│   ├── core.js            # 对局状态机、战斗、AI、缩圈、Boss、野怪、拾取
│   ├── render.js          # Canvas 渲染 + 小地图
│   └── bridge.js          # 引擎 <-> React 桥
├── components/
│   ├── GameCanvas.jsx     # 画布挂载 + 主循环（RAF）
│   ├── Hud.jsx            # 血条/武器卡/击杀播报/小地图/诅咒栏
│   ├── TouchControls.jsx  # 虚拟摇杆 + 触屏按钮
│   └── overlays/          # 开始(红头文件)/晋升审批单/带薪休息/离职证明&优秀员工证书
└── App.jsx                # 按状态机组装
```

## 怎么扩展

- **加武器**：`data/weapons.js` 加一条，`kind` 决定弹道（mg/sniper/shotgun/lob/homing/chain/
  single/twin/gacha/boomerang/charge/drone），需要新弹道就在 `core.js` 的 `updateWeapon`
  switch 里加一个 case；想让它可融合就在 `RECIPES` 里配对。
- **加技能**：`data/skills.js` 加 `{ id, name, max, eff, tag, apply(mods) }`；
  数值类改 `mods`，行为类在 `core.js` 里消费对应 mods 字段。
- **加技术模组**：`data/tech.js` 的 `TECH` 加条目 + `core.js` 的 `applyTechPickup` 加 case。
- **加野怪 / 小 Boss**：`data/tech.js` 的 `ELITES` 加条目（`tier: 1`=普通野怪走 22s 刷新，
  `tier: 2`=职场怪物小 Boss 走 55s 刷新、全屏通告、双倍掉落）+ `core.js` 的 `updateElite`
  加行为分支。现有小 Boss：PPT 大师（光锥预警爆发）、向上管理大师（给敌人挂 `empowerT`
  光环+奶血）、小报告专家（`reportedT` 全场集火）。
- **调平衡**：`constants.js`（缩圈时间轴/Boss）+ `core.js` 里搜 `牛马内战伤害衰减`（机器人互伤系数）。

## 调试

开发模式下引擎挂在 `window.__niuma`（getG / update / startGame / applyDamage / …），
可在控制台直接快进对局：`for (let i=0;i<600;i++) __niuma.update(1/60)`。
