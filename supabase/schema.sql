-- Research OS v1 云同步：每个账号只保存一条完整快照。
-- 适合当前个人科研规划器；以后如需多人协作/大数据量，再拆分规范化表结构。
--
-- 安全红线：
-- 1. RLS 必须开启，且所有读写都限定 auth.uid() = user_id；
-- 2. 真正的数据隔离由数据库 RLS 完成，不依赖前端「自觉」传入的 user_id；
-- 3. payload 是 jsonb，只允许保存白名单科研数据，严禁包含 AI API Key 等机密。

create table if not exists public.research_os_snapshots (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.research_os_snapshots enable row level security;

-- 匿名用户不能操作；登录用户可在 RLS 约束下访问。
-- 额外回收 public 默认权限作为防御，确保只有 authenticated 通过策略访问。
revoke all on table public.research_os_snapshots from public;
revoke all on table public.research_os_snapshots from anon;
grant select, insert, update, delete on table public.research_os_snapshots to authenticated;

drop policy if exists "research_os_select_own" on public.research_os_snapshots;
create policy "research_os_select_own"
on public.research_os_snapshots
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "research_os_insert_own" on public.research_os_snapshots;
create policy "research_os_insert_own"
on public.research_os_snapshots
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "research_os_update_own" on public.research_os_snapshots;
create policy "research_os_update_own"
on public.research_os_snapshots
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "research_os_delete_own" on public.research_os_snapshots;
create policy "research_os_delete_own"
on public.research_os_snapshots
for delete
to authenticated
using (auth.uid() = user_id);

comment on table public.research_os_snapshots is
  'Research OS per-user JSON snapshot. payload must never contain AI API keys or other secrets.';
