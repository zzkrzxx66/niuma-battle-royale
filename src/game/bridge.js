/* =====================================================================
 * 游戏引擎 <-> React 桥接
 * - 事件：feed / warn / feed-clear（引擎发，React 订阅）
 * - 版本号订阅：引擎状态变化或节流 tick 时 bump，React 用
 *   useSyncExternalStore 感知后直接读引擎数据渲染
 * ===================================================================== */
const listeners = new Map();   // event -> Set<fn>
const versionSubs = new Set();
let version = 0;

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) fn(payload);
}

export function subscribe(fn) {
  versionSubs.add(fn);
  return () => versionSubs.delete(fn);
}
export const getVersion = () => version;
export function notify() {
  version++;
  for (const fn of versionSubs) fn();
}
