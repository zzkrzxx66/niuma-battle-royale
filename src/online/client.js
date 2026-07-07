import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const ONLINE_ENABLED = !!(url && anon);
export const supabase = ONLINE_ENABLED ? createClient(url, anon, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
}) : null;

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function defaultDailyChallenge(date = todayKey()) {
  const n = [...date].reduce((a, c) => a + c.charCodeAt(0), 0);
  const templates = [
    {
      title: '国产大模型日',
      description: '只能从国产 AI 武器开局，敌人略快，金币更多。',
      rules: { weaponPool: ['deepseek', 'kimi', 'qwen', 'wenxin', 'doubao', 'glm'], modifiers: { enemySpeedMul: 1.15, goldMul: 1.2, bossTime: 360 } },
      reward_gold: 100,
    },
    {
      title: '强制加班日',
      description: 'Boss 提前巡查，敌人更快，但金币奖励更高。',
      rules: { weaponPool: null, modifiers: { enemySpeedMul: 1.2, goldMul: 1.3, bossTime: 300 } },
      reward_gold: 120,
    },
    {
      title: '价格屠夫日',
      description: '核心降本武器局，芯片更多但敌人更肉。',
      rules: { weaponPool: ['qwen', 'doubao', 'deepseek'], modifiers: { enemyHpMul: 1.2, chipSpawnMul: 1.25 } },
      reward_gold: 120,
    },
  ];
  const t = templates[n % templates.length];
  return { challenge_date: date, seed: `daily-${date}`, ...t };
}
