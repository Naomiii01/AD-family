-- 三罐零用金: tables, privileges and row-level security.
-- Clients only SELECT through RLS; every write goes through SECURITY DEFINER functions (0002_functions.sql).
create extension if not exists pgcrypto with schema extensions;

create table public.families(
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  rate numeric(4,2) not null default 2 check (rate >= 0 and rate <= 10),
  bonus_pct int not null default 10 check (bonus_pct between 0 and 50),
  created_at timestamptz not null default now()
);

create table public.members(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 20),
  role text not null check (role in ('parent','kid')),
  allowance int not null default 0 check (allowance >= 0 and allowance <= 1000000),
  color text not null default 'long',
  is_owner boolean not null default false,
  archived boolean not null default false,
  pin_hash text,
  failed int not null default 0,
  locked_until timestamptz,
  quick_hash text unique,
  created_at timestamptz not null default now()
);
create index on public.members(family_id);

create table public.ledger(
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  jar text not null check (jar in ('free','dream','long')),
  amount int not null,
  note text not null default '',
  month text not null,
  kind text not null default 'other',
  created_at timestamptz not null default now()
);
create index on public.ledger(member_id, created_at desc);

create table public.months(
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  status text not null default 'active' check (status in ('active','closed')),
  income int not null default 0,
  extra int not null default 0,
  extra_note text not null default '',
  ratio jsonb not null,
  alloc jsonb not null,
  free_start int not null default 0,
  review jsonb not null default '{}'::jsonb,
  interest int not null default 0,
  moved int not null default 0,
  star boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(member_id, month)
);

create table public.expenses(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  month text not null,
  item text not null check (char_length(item) between 1 and 40),
  amount int not null check (amount > 0),
  type text not null check (type in ('need','want')),
  category text not null default '其他',
  source text not null default 'app',
  voided boolean not null default false,
  spent_on date not null default (now() at time zone 'Asia/Taipei')::date,
  created_at timestamptz not null default now()
);
create index on public.expenses(member_id, month);

create table public.goals(
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  price int not null check (price > 0),
  status text not null default 'active' check (status in ('active','achieved')),
  bonus_given boolean not null default false,
  pending_name text,
  pending_price int,
  pending_at timestamptz,
  created_at timestamptz not null default now(),
  achieved_at timestamptz
);
create unique index goals_one_active on public.goals(member_id) where status = 'active';

create table public.year_plans(
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  year int not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(member_id, year)
);

create table public.agreements(
  id bigint generated always as identity primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  member_id uuid not null unique references public.members(id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  kid_signed_at timestamptz,
  parent_signed_at timestamptz,
  parent_signer uuid references public.members(id) on delete set null,
  updated_at timestamptz not null default now()
);

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
grant select on public.families, public.ledger, public.months, public.expenses, public.goals, public.year_plans, public.agreements to authenticated;
-- PIN and shortcut-token hashes are never readable by clients
grant select (id, family_id, user_id, name, role, allowance, color, is_owner, archived, created_at) on public.members to authenticated;

alter table public.families enable row level security;
alter table public.members enable row level security;
alter table public.ledger enable row level security;
alter table public.months enable row level security;
alter table public.expenses enable row level security;
alter table public.goals enable row level security;
alter table public.year_plans enable row level security;
alter table public.agreements enable row level security;

create or replace function public.my_member_id() returns uuid
language sql stable security definer set search_path = public as
$$ select id from public.members where user_id = auth.uid() $$;

create or replace function public.my_family_id() returns uuid
language sql stable security definer set search_path = public as
$$ select family_id from public.members where user_id = auth.uid() $$;

create or replace function public.am_parent() returns boolean
language sql stable security definer set search_path = public as
$$ select coalesce((select role = 'parent' from public.members where user_id = auth.uid()), false) $$;

-- a kid can access only their own rows; a parent can access everyone in the family
create or replace function public.can_access(p_member uuid) returns boolean
language sql stable security definer set search_path = public as
$$ select exists(
  select 1 from public.members m
  where m.id = p_member
    and ((m.user_id = auth.uid()) or (m.family_id = public.my_family_id() and public.am_parent()))
) $$;

create policy fam_read on public.families for select to authenticated using (id = public.my_family_id());
create policy mem_read on public.members for select to authenticated
  using (user_id = auth.uid() or (family_id = public.my_family_id() and public.am_parent()));
create policy ledger_read on public.ledger for select to authenticated using (public.can_access(member_id));
create policy months_read on public.months for select to authenticated using (public.can_access(member_id));
create policy exp_read on public.expenses for select to authenticated using (public.can_access(member_id));
create policy goals_read on public.goals for select to authenticated using (public.can_access(member_id));
create policy yp_read on public.year_plans for select to authenticated using (public.can_access(member_id));
create policy agr_read on public.agreements for select to authenticated using (public.can_access(member_id));
