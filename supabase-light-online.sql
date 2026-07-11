-- 牛马大逃杀 v4.2 轻联机 Supabase 初始化脚本
-- 在 Supabase SQL Editor 执行；客户端配置 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 后启用。

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null default '匿名牛马',
  avatar_key text default 'default',
  title text default null,
  total_games int not null default 0,
  total_kills int not null default 0,
  total_boss_kills int not null default 0,
  total_play_seconds int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cloud_saves (
  player_id uuid primary key references auth.users(id) on delete cascade,
  save_version int not null default 1,
  data jsonb not null default '{}'::jsonb,
  client_updated_at timestamptz,
  server_updated_at timestamptz not null default now()
);

create table if not exists public.leaderboard_scores (
  id bigserial primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  mode text not null,
  challenge_date date,
  score int not null,
  survive_time int not null,
  kills int not null,
  level int not null,
  boss_killed boolean not null default false,
  boss_kill_time int,
  gold_earned int not null default 0,
  character_id text,
  difficulty text not null default 'normal',
  weapon_ids text[] not null default '{}',
  legendary_ids text[] not null default '{}',
  client_version text,
  run_hash text,
  suspicious boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_challenges (
  challenge_date date primary key,
  seed text not null,
  title text not null,
  description text not null,
  rules jsonb not null,
  reward_gold int not null default 80,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_claims (
  id bigserial primary key,
  player_id uuid not null references auth.users(id) on delete cascade,
  challenge_date date not null,
  reward_gold int not null,
  claimed_at timestamptz not null default now(),
  unique(player_id, challenge_date)
);

create index if not exists idx_scores_mode_score on public.leaderboard_scores(mode, score desc) where suspicious = false;
create index if not exists idx_scores_daily on public.leaderboard_scores(mode, challenge_date, score desc) where suspicious = false;
create index if not exists idx_scores_player on public.leaderboard_scores(player_id, created_at desc);

-- 可选：补一条到 profiles 的外键，方便以后用 PostgREST embed 查昵称
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leaderboard_scores_player_id_profiles_fkey'
  ) then
    alter table public.leaderboard_scores
      add constraint leaderboard_scores_player_id_profiles_fkey
      foreign key (player_id) references public.profiles(id) on delete cascade;
  end if;
exception when others then
  -- 已有数据不一致时跳过，客户端已改为不依赖该关系
  null;
end $$;

alter table public.profiles enable row level security;
alter table public.cloud_saves enable row level security;
alter table public.leaderboard_scores enable row level security;
alter table public.daily_challenges enable row level security;
alter table public.daily_claims enable row level security;

drop policy if exists "Profiles are readable" on public.profiles;
create policy "Profiles are readable" on public.profiles for select using (true);
drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);

drop policy if exists "Users can read own cloud save" on public.cloud_saves;
create policy "Users can read own cloud save" on public.cloud_saves for select using (auth.uid() = player_id);
drop policy if exists "Users can insert own cloud save" on public.cloud_saves;
create policy "Users can insert own cloud save" on public.cloud_saves for insert with check (auth.uid() = player_id);
drop policy if exists "Users can update own cloud save" on public.cloud_saves;
create policy "Users can update own cloud save" on public.cloud_saves for update using (auth.uid() = player_id);

drop policy if exists "Leaderboard scores are readable" on public.leaderboard_scores;
create policy "Leaderboard scores are readable" on public.leaderboard_scores for select using (suspicious = false);
drop policy if exists "Users can insert own score" on public.leaderboard_scores;
create policy "Users can insert own score" on public.leaderboard_scores for insert with check (auth.uid() = player_id);

drop policy if exists "Daily challenges are readable" on public.daily_challenges;
create policy "Daily challenges are readable" on public.daily_challenges for select using (true);

drop policy if exists "Users can read own claims" on public.daily_claims;
create policy "Users can read own claims" on public.daily_claims for select using (auth.uid() = player_id);

-- 示例每日挑战，可按日期改写/插入
insert into public.daily_challenges(challenge_date, seed, title, description, rules, reward_gold)
values (
  current_date,
  'daily-' || current_date::text,
  '国产大模型日',
  '只能从国产 AI 武器开局，敌人略快，金币更多。',
  '{"weaponPool":["deepseek","kimi","qwen","wenxin","doubao","glm"],"modifiers":{"enemySpeedMul":1.15,"goldMul":1.2,"bossTime":360}}'::jsonb,
  100
)
on conflict (challenge_date) do nothing;
