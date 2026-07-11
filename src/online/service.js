import { ONLINE_ENABLED, supabase, defaultDailyChallenge, todayKey } from './client.js';
import { loadLocalSaveBundle, applyLocalSaveBundle, queuePendingScore, loadPendingScores, savePendingScores } from './localSave.js';

let onlineState = {
  ready: false,
  configured: ONLINE_ENABLED,
  online: false,
  profile: null,
  cloudSave: null,
  dailyChallenge: defaultDailyChallenge(),
  lastError: ONLINE_ENABLED ? '' : '未配置 Supabase，当前为本地离线模式',
  setupHints: ONLINE_ENABLED ? [] : ['填写 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后重新构建'],
};
const listeners = new Set();
const emit = () => listeners.forEach(fn => fn(onlineState));
const setState = patch => { onlineState = { ...onlineState, ...patch }; emit(); };

function friendlyError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || err?.error_code || '');
  const lower = msg.toLowerCase();
  if (code === 'anonymous_provider_disabled' || lower.includes('anonymous sign-ins are disabled') || lower.includes('anonymous_provider_disabled')) {
    return {
      message: '匿名登录未开启：请到 Supabase → Authentication → Providers → Anonymous 打开',
      hints: [
        '打开 Supabase 项目后台',
        'Authentication → Providers → Anonymous → Enable',
        '保存后回到游戏点“重新连接”',
      ],
    };
  }
  if (code === 'PGRST205' || lower.includes('could not find the table') || lower.includes('schema cache')) {
    return {
      message: '数据表未创建：请在 SQL Editor 执行 supabase-light-online.sql',
      hints: [
        '打开 Supabase → SQL Editor',
        '粘贴并运行 supabase-light-online.sql',
        '确认 profiles / cloud_saves / leaderboard_scores / daily_challenges 已创建',
      ],
    };
  }
  if (lower.includes('could not find a relationship') || lower.includes('relationship between')) {
    return {
      message: '排行榜关联查询失败，请更新到最新版客户端',
      hints: ['安装最新 APK 后重开排行榜', '旧版依赖表关系嵌入，新版已改为分步查询'],
    };
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('load failed')) {
    return {
      message: '网络连接失败，暂时使用本地模式',
      hints: ['检查手机网络', '确认 Supabase 项目未暂停', '稍后点“重新连接”'],
    };
  }
  if (lower.includes('jwt') || lower.includes('invalid api key') || lower.includes('apikey')) {
    return {
      message: 'Supabase Key 无效，请检查 VITE_SUPABASE_ANON_KEY',
      hints: ['到 Project Settings → API 复制 anon public key', '更新 .env.local 与 GitHub Secrets 后重新构建'],
    };
  }
  return { message: msg || '未知联机错误', hints: [] };
}

export function subscribeOnline(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function getOnlineState() { return onlineState; }

export async function initOnline() {
  if (!ONLINE_ENABLED) {
    setState({
      ready: true,
      online: false,
      lastError: '未配置 Supabase，当前为本地离线模式',
      setupHints: ['填写 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后重新构建'],
    });
    return onlineState;
  }
  try {
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const r = await supabase.auth.signInAnonymously();
      if (r.error) throw r.error;
      session = r.data.session;
    }
    const user = session?.user;
    if (!user) throw new Error('匿名登录失败');
    await ensureProfile(user.id);
    const [profile, cloudSave, dailyChallenge] = await Promise.all([
      fetchProfile(user.id), fetchCloudSave(user.id), fetchDailyChallenge(),
    ]);
    if (cloudSave?.data) {
      const cloudAt = Date.parse(cloudSave.server_updated_at || cloudSave.client_updated_at || 0);
      const localAt = Date.parse(localStorage.getItem('niuma_local_updated_at') || 0);
      if (cloudAt && cloudAt > localAt) applyLocalSaveBundle(cloudSave.data);
      else await uploadCloudSave();
    } else {
      await uploadCloudSave();
    }
    setState({ ready: true, online: true, profile, cloudSave, dailyChallenge, lastError: '', setupHints: [] });
    await flushPendingScores();
    return onlineState;
  } catch (e) {
    const f = friendlyError(e);
    setState({ ready: true, online: false, lastError: f.message, setupHints: f.hints });
    return onlineState;
  }
}

async function ensureProfile(userId) {
  const nickname = localStorage.getItem('niuma_nickname') || `匿名牛马${userId.slice(0, 4)}`;
  const { error } = await supabase.from('profiles').upsert({ id: userId, nickname, updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (error) throw error;
}
async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  if (data?.nickname) localStorage.setItem('niuma_nickname', data.nickname);
  return data;
}
async function fetchCloudSave(userId) {
  const { data, error } = await supabase.from('cloud_saves').select('*').eq('player_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
export async function uploadCloudSave() {
  if (!ONLINE_ENABLED) return { ok: false, offline: true };
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');
    const bundle = loadLocalSaveBundle();
    const row = { player_id: user.id, save_version: 1, data: bundle, client_updated_at: new Date().toISOString(), server_updated_at: new Date().toISOString() };
    const { error } = await supabase.from('cloud_saves').upsert(row, { onConflict: 'player_id' });
    if (error) throw error;
    setState({ cloudSave: row, online: true, lastError: '', setupHints: [] });
    return { ok: true };
  } catch (e) {
    const f = friendlyError(e);
    setState({ online: false, lastError: f.message, setupHints: f.hints });
    return { ok: false, error: e, message: f.message };
  }
}
export async function updateNickname(nickname) {
  const safe = String(nickname || '').trim().slice(0, 12) || '匿名牛马';
  localStorage.setItem('niuma_nickname', safe);
  if (!ONLINE_ENABLED) { setState({ profile: { ...(onlineState.profile || {}), nickname: safe } }); return { ok: true }; }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');
    const { data, error } = await supabase.from('profiles').update({ nickname: safe, updated_at: new Date().toISOString() }).eq('id', user.id).select('*').single();
    if (error) throw error;
    setState({ profile: data, online: true, lastError: '', setupHints: [] });
    return { ok: true, profile: data };
  } catch (e) {
    const f = friendlyError(e);
    setState({ lastError: f.message, setupHints: f.hints });
    return { ok: false, error: e, message: f.message };
  }
}
export async function fetchDailyChallenge(date = todayKey()) {
  if (!ONLINE_ENABLED) return defaultDailyChallenge(date);
  const { data, error } = await supabase.from('daily_challenges').select('*').eq('challenge_date', date).maybeSingle();
  if (error) throw error;
  return data || defaultDailyChallenge(date);
}
export async function getLeaderboard(mode = 'classic', challengeDate = null, limit = 50) {
  if (!ONLINE_ENABLED) return { items: [], offline: true };
  try {
    // 不依赖 PostgREST 表关系嵌入：先取成绩，再按 player_id 批量补昵称
    let q = supabase
      .from('leaderboard_scores')
      .select('id, player_id, mode, challenge_date, score, survive_time, kills, level, boss_killed, created_at')
      .eq('mode', mode)
      .eq('suspicious', false)
      .order('score', { ascending: false })
      .limit(limit);
    if (challengeDate) q = q.eq('challenge_date', challengeDate);
    else q = q.is('challenge_date', null);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    const ids = [...new Set(rows.map(x => x.player_id).filter(Boolean))];
    let profileMap = {};
    if (ids.length) {
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, nickname, avatar_key, title')
        .in('id', ids);
      if (pErr) throw pErr;
      profileMap = Object.fromEntries((profiles || []).map(p => [p.id, p]));
    }
    return {
      items: rows.map((x, i) => ({
        rank: i + 1,
        ...x,
        profiles: profileMap[x.player_id] || { nickname: '匿名牛马' },
      })),
      offline: false,
    };
  } catch (e) {
    const f = friendlyError(e);
    setState({ lastError: f.message, setupHints: f.hints });
    return { items: [], error: e, message: f.message };
  }
}
export function calcScore(run) {
  const boss = run.bossKilled ? 3000 : 0;
  const legends = (run.legendaryIds || []).length * 500;
  const endless = run.mode === 'endless' ? (run.endlessWave || 0) * 800 : 0;
  return Math.max(0, Math.round((run.surviveTime || 0) * 10 + (run.kills || 0) * 2 + (run.level || 1) * 50 + boss + legends + endless));
}
export function isSuspicious(run) {
  if ((run.surviveTime || 0) < 0 || (run.surviveTime || 0) > 5400) return true;
  if ((run.kills || 0) > Math.max(200, (run.surviveTime || 1) * 12)) return true;
  if ((run.level || 0) > 80) return true;
  if ((run.goldEarned || 0) > 5000) return true;
  if ((run.legendaryIds || []).length > 6) return true;
  return false;
}
export async function submitScore(run) {
  const payload = { ...run, score: calcScore(run), suspicious: isSuspicious(run), client_version: '4.2-light-online' };
  if (!ONLINE_ENABLED) { queuePendingScore(payload); return { ok: false, offline: true, queued: true, score: payload.score }; }
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('未登录');
    const row = {
      player_id: user.id, mode: payload.mode || 'classic', challenge_date: payload.challengeDate || null,
      score: payload.score, survive_time: payload.surviveTime || 0, kills: payload.kills || 0, level: payload.level || 1,
      boss_killed: !!payload.bossKilled, boss_kill_time: payload.bossKillTime || null, gold_earned: payload.goldEarned || 0,
      character_id: payload.characterId || null, difficulty: payload.difficulty || 'normal', weapon_ids: payload.weaponIds || [],
      legendary_ids: payload.legendaryIds || [], client_version: payload.client_version, run_hash: payload.runHash || null, suspicious: payload.suspicious,
    };
    const { error } = await supabase.from('leaderboard_scores').insert(row);
    if (error) throw error;
    await uploadCloudSave();
    return { ok: true, score: payload.score, suspicious: payload.suspicious };
  } catch (e) {
    const f = friendlyError(e);
    queuePendingScore(payload);
    setState({ online: false, lastError: f.message, setupHints: f.hints });
    return { ok: false, queued: true, error: e, score: payload.score, message: f.message };
  }
}
export async function flushPendingScores() {
  if (!ONLINE_ENABLED) return;
  const q = loadPendingScores();
  if (!q.length) return;
  const left = [];
  for (const s of q) {
    const r = await submitScore(s);
    if (!r.ok) left.push(s);
  }
  savePendingScores(left);
}
