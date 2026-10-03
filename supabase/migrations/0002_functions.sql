-- 三罐零用金: all write operations. Each checks permission with can_access / am_parent.
create or replace function public.cur_month() returns text language sql stable set search_path = public as
$$ select to_char(now() at time zone 'Asia/Taipei', 'YYYY-MM') $$;

create or replace function public._bal(p_member uuid, p_jar text) returns int
language sql stable security definer set search_path = public as
$$ select coalesce(sum(amount), 0)::int from public.ledger where member_id = p_member and jar = p_jar $$;

create or replace function public._fam(p_member uuid) returns uuid
language sql stable security definer set search_path = public as
$$ select family_id from public.members where id = p_member $$;

create or replace function public._need_access(p_member uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p_member is null or not public.can_access(p_member) then raise exception '沒有權限' using errcode = '42501'; end if;
end $$;

create or replace function public._need_parent_of(p_member uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.am_parent() and public._fam(p_member) = public.my_family_id()) then
    raise exception '只有家長可以做這件事' using errcode = '42501';
  end if;
end $$;

create or replace function public._log(p_member uuid, p_jar text, p_amount int, p_note text, p_month text, p_kind text) returns void
language sql security definer set search_path = public as
$$ insert into public.ledger(family_id, member_id, jar, amount, note, month, kind)
   select family_id, p_member, p_jar, p_amount, left(p_note, 60), p_month, p_kind from public.members where id = p_member and p_amount <> 0 $$;

-- ---------- monthly cycle ----------
create or replace function public.plan_month(p_member uuid, p_month text, p_extra int, p_extra_note text, p_free int, p_dream int, p_long int)
returns void language plpgsql security definer set search_path = public as $$
declare v_inc int; v_total int; a_free int; a_dream int; a_long int; v_label text; v_open text;
begin
  perform public._need_access(p_member);
  if p_month !~ '^\d{4}-\d{2}$' then raise exception '月份格式錯誤'; end if;
  if p_month > to_char((now() at time zone 'Asia/Taipei') + interval '1 month', 'YYYY-MM') then raise exception '只能規劃本月或下個月'; end if;
  if p_free < 0 or p_dream < 0 or p_long < 0 or p_free + p_dream + p_long <> 100 then raise exception '三個罐子的比例加起來要是 100%%'; end if;
  if coalesce(p_extra, 0) < 0 or coalesce(p_extra, 0) > 1000000 then raise exception '額外收入金額不正確'; end if;
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  if exists(select 1 from public.months where member_id = p_member and month = p_month) then raise exception '這個月已經規劃過了'; end if;
  select month into v_open from public.months where member_id = p_member and status = 'active' and month < p_month order by month limit 1;
  if v_open is not null then
    raise exception '% 年 % 月還沒結算，請先完成上個月的檢討', split_part(v_open, '-', 1), split_part(v_open, '-', 2)::int;
  end if;
  select allowance into v_inc from public.members where id = p_member;
  v_total := v_inc + coalesce(p_extra, 0);
  a_free := round(v_total * p_free / 100.0);
  a_dream := round(v_total * p_dream / 100.0);
  a_long := greatest(0, v_total - a_free - a_dream);
  v_label := split_part(p_month, '-', 1) || ' 年 ' || split_part(p_month, '-', 2)::int || ' 月零用金';
  perform public._log(p_member, 'free', a_free, v_label, p_month, 'allowance');
  perform public._log(p_member, 'dream', a_dream, v_label, p_month, 'allowance');
  perform public._log(p_member, 'long', a_long, v_label, p_month, 'allowance');
  insert into public.months(family_id, member_id, month, income, extra, extra_note, ratio, alloc, free_start)
  values (public._fam(p_member), p_member, p_month, v_inc, coalesce(p_extra, 0), left(coalesce(p_extra_note, ''), 40),
          jsonb_build_object('free', p_free, 'dream', p_dream, 'long', p_long),
          jsonb_build_object('free', a_free, 'dream', a_dream, 'long', a_long),
          public._bal(p_member, 'free'));
end $$;

create or replace function public._add_expense(p_member uuid, p_item text, p_amount int, p_type text, p_category text, p_source text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_month text := public.cur_month(); v_free int; v_id uuid; v_status text;
begin
  if p_amount is null or p_amount <= 0 then raise exception '請輸入金額'; end if;
  if coalesce(trim(p_item), '') = '' then raise exception '請寫下買了什麼'; end if;
  if p_type not in ('need', 'want') then raise exception '請選「需要」或「想要」'; end if;
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  select status into v_status from public.months where member_id = p_member and month = v_month;
  if v_status is null then raise exception '這個月還沒做月初規劃，先到「本月」把零用金放進罐子'; end if;
  if v_status = 'closed' then raise exception '這個月已經結算了'; end if;
  v_free := public._bal(p_member, 'free');
  if p_amount > v_free then raise exception '自由罐只剩 % 元，這筆錢不夠付', v_free; end if;
  insert into public.expenses(family_id, member_id, month, item, amount, type, category, source)
  values (public._fam(p_member), p_member, v_month, left(trim(p_item), 40), p_amount, p_type, coalesce(nullif(trim(p_category), ''), '其他'), p_source)
  returning id into v_id;
  perform public._log(p_member, 'free', -p_amount, left(trim(p_item), 40), v_month, 'expense');
  return jsonb_build_object('id', v_id, 'left', v_free - p_amount);
end $$;

create or replace function public.add_expense(p_member uuid, p_item text, p_amount int, p_type text, p_category text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  return public._add_expense(p_member, p_item, p_amount, p_type, p_category, 'app');
end $$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select * into e from public.expenses where id = p_id and not voided;
  if not found then raise exception '找不到這筆花費'; end if;
  perform public._need_access(e.member_id);
  perform pg_advisory_xact_lock(hashtext(e.member_id::text));
  if not exists(select 1 from public.months where member_id = e.member_id and month = e.month and status = 'active') then
    raise exception '這個月已經結算，不能再修改';
  end if;
  update public.expenses set voided = true where id = p_id;
  perform public._log(e.member_id, 'free', e.amount, '刪除：' || e.item, e.month, 'refund');
end $$;

create or replace function public.save_review(p_member uuid, p_month text, p_review jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  update public.months set review = jsonb_build_object(
      'best', left(coalesce(p_review->>'best', ''), 300),
      'regret', left(coalesce(p_review->>'regret', ''), 300),
      'next', left(coalesce(p_review->>'next', ''), 300),
      'to', case when p_review->>'to' in ('keep', 'dream', 'long') then p_review->>'to' else 'keep' end)
  where member_id = p_member and month = p_month and status = 'active';
  if not found then raise exception '這個月不能再修改檢討'; end if;
end $$;

create or replace function public.close_month(p_member uuid, p_month text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m record; v_left int; v_to text; v_rate numeric; v_int int; v_star boolean;
begin
  perform public._need_access(p_member);
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  select * into m from public.months where member_id = p_member and month = p_month and status = 'active';
  if not found then raise exception '這個月不能結算'; end if;
  v_to := coalesce(m.review->>'to', 'keep');
  v_left := public._bal(p_member, 'free');
  if v_left > 0 and v_to in ('dream', 'long') then
    perform public._log(p_member, 'free', -v_left, '月底轉存', p_month, 'move');
    perform public._log(p_member, v_to, v_left, '自由罐結餘轉入', p_month, 'move');
  else
    v_left := 0;
  end if;
  select f.rate into v_rate from public.families f join public.members x on x.family_id = f.id where x.id = p_member;
  v_int := round(public._bal(p_member, 'long') * v_rate / 100.0);
  perform public._log(p_member, 'long', v_int, '家庭銀行利息 ' || v_rate::float8 || '%', p_month, 'interest');
  v_star := coalesce(trim(m.review->>'next'), '') <> ''
            and (coalesce(trim(m.review->>'best'), '') <> '' or coalesce(trim(m.review->>'regret'), '') <> '');
  update public.months set status = 'closed', interest = v_int, moved = v_left, star = v_star, closed_at = now() where id = m.id;
  return jsonb_build_object('star', v_star, 'interest', v_int, 'moved', v_left);
end $$;

-- ---------- dream goal ----------
create or replace function public.set_goal(p_member uuid, p_name text, p_price int) returns text
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  if coalesce(trim(p_name), '') = '' or char_length(trim(p_name)) > 30 then raise exception '夢想名稱要在 30 字以內'; end if;
  if p_price is null or p_price <= 0 or p_price > 10000000 then raise exception '請輸入正確的價格'; end if;
  if exists(select 1 from public.goals where member_id = p_member and status = 'active') then
    update public.goals set pending_name = trim(p_name), pending_price = p_price, pending_at = now() where member_id = p_member and status = 'active';
    return 'pending';
  end if;
  insert into public.goals(family_id, member_id, name, price) values (public._fam(p_member), p_member, trim(p_name), p_price);
  return 'set';
end $$;

create or replace function public.apply_goal_change(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  perform public._need_access(p_member);
  select * into g from public.goals where member_id = p_member and status = 'active';
  if not found or g.pending_at is null then raise exception '沒有等待中的更換'; end if;
  if g.pending_at > now() - interval '7 days' and not (public.am_parent() and public.my_member_id() <> p_member) then
    raise exception '冷靜期還沒結束';
  end if;
  update public.goals set name = g.pending_name, price = g.pending_price, bonus_given = false,
    pending_name = null, pending_price = null, pending_at = null where id = g.id;
end $$;

create or replace function public.cancel_goal_change(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  update public.goals set pending_name = null, pending_price = null, pending_at = null where member_id = p_member and status = 'active';
end $$;

create or replace function public.buy_goal(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g record;
begin
  perform public._need_access(p_member);
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  select * into g from public.goals where member_id = p_member and status = 'active';
  if not found then raise exception '還沒有設定夢想'; end if;
  if public._bal(p_member, 'dream') < g.price then raise exception '夢想罐還不夠'; end if;
  perform public._log(p_member, 'dream', -g.price, '買下：' || g.name, public.cur_month(), 'goal');
  update public.goals set status = 'achieved', achieved_at = now(), pending_name = null, pending_price = null, pending_at = null where id = g.id;
end $$;

create or replace function public.give_bonus(p_member uuid) returns int
language plpgsql security definer set search_path = public as $$
declare g record; v_pct int; v_amt int;
begin
  perform public._need_parent_of(p_member);
  perform pg_advisory_xact_lock(hashtext(p_member::text));
  select * into g from public.goals where member_id = p_member and status = 'active';
  if not found or g.bonus_given then raise exception '目前沒有可以發放的加碼'; end if;
  if public._bal(p_member, 'dream') * 2 < g.price then raise exception '夢想還沒存到一半'; end if;
  select f.bonus_pct into v_pct from public.families f where f.id = g.family_id;
  v_amt := round(g.price * v_pct / 100.0);
  perform public._log(p_member, 'dream', v_amt, '爸媽夢想加碼', public.cur_month(), 'bonus');
  update public.goals set bonus_given = true where id = g.id;
  return v_amt;
end $$;

create or replace function public.give_reward(p_member uuid, p_jar text, p_amount int, p_note text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_parent_of(p_member);
  if p_jar not in ('free', 'dream', 'long') then raise exception '罐子不正確'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception '請輸入正確的金額'; end if;
  perform public._log(p_member, p_jar, p_amount, coalesce(nullif(trim(p_note), ''), '獎勵'), public.cur_month(), 'reward');
end $$;

-- ---------- family & members ----------
create or replace function public.update_member(p_id uuid, p_name text, p_role text, p_allowance int, p_color text) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  perform public._need_parent_of(p_id);
  select * into m from public.members where id = p_id;
  if coalesce(trim(p_name), '') = '' or char_length(trim(p_name)) > 20 then raise exception '名字要在 20 字以內'; end if;
  if p_role not in ('parent', 'kid') then raise exception '身分不正確'; end if;
  if p_allowance is null or p_allowance < 0 or p_allowance > 1000000 then raise exception '零用金金額不正確'; end if;
  if m.role = 'parent' and p_role = 'kid' then
    if m.is_owner then raise exception '建立家庭的家長不能改成孩子'; end if;
    if (select count(*) from public.members where family_id = m.family_id and role = 'parent') <= 1 then raise exception '家裡至少要有一位家長'; end if;
  end if;
  update public.members set name = trim(p_name), role = p_role, allowance = p_allowance,
    color = case when p_color in ('free', 'dream', 'long', 'ink', 'sky') then p_color else color end
  where id = p_id;
end $$;

-- soft removal: the member can no longer log in, history is kept
create or replace function public.remove_member(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m record;
begin
  perform public._need_parent_of(p_id);
  select * into m from public.members where id = p_id;
  if p_id = public.my_member_id() then raise exception '不能移除自己'; end if;
  if m.is_owner then raise exception '不能移除建立家庭的家長'; end if;
  update public.members set archived = true, user_id = null, pin_hash = null, quick_hash = null where id = p_id;
end $$;

create or replace function public.update_family(p_name text, p_rate numeric, p_bonus int) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.am_parent() then raise exception '只有家長可以做這件事' using errcode = '42501'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception '請填家庭名稱'; end if;
  if p_rate is null or p_rate < 0 or p_rate > 10 then raise exception '月息要在 0 到 10%% 之間'; end if;
  if p_bonus is null or p_bonus < 0 or p_bonus > 50 then raise exception '加碼要在 0 到 50%% 之間'; end if;
  update public.families set name = left(trim(p_name), 30), rate = p_rate, bonus_pct = p_bonus where id = public.my_family_id();
end $$;

create or replace function public.set_member_pin(p_member uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_role text;
begin
  perform public._need_access(p_member);
  select role into v_role from public.members where id = p_member;
  if p_pin !~ '^\d{4,8}$' then raise exception '密碼要是 4 到 8 位數字'; end if;
  if v_role = 'parent' and length(p_pin) < 6 then raise exception '家長的密碼至少 6 位數字'; end if;
  update public.members set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')), failed = 0, locked_until = null where id = p_member;
end $$;

-- ---------- year plan, agreement, stats ----------
create or replace function public.save_year_plan(p_member uuid, p_year int, p_data jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  if p_year < 2020 or p_year > 2100 then raise exception '年份不正確'; end if;
  if jsonb_typeof(p_data) <> 'object' or pg_column_size(p_data) > 20000 then raise exception '內容太多了'; end if;
  insert into public.year_plans(family_id, member_id, year, data) values (public._fam(p_member), p_member, p_year, p_data)
  on conflict (member_id, year) do update set data = excluded.data, updated_at = now();
end $$;

create or replace function public.save_agreement(p_member uuid, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 20 or pg_column_size(p_items) > 10000 then raise exception '約定內容太多了'; end if;
  insert into public.agreements(family_id, member_id, items) values (public._fam(p_member), p_member, p_items)
  on conflict (member_id) do update set items = excluded.items, kid_signed_at = null, parent_signed_at = null, parent_signer = null, updated_at = now();
end $$;

create or replace function public.sign_agreement(p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  if not exists(select 1 from public.agreements where member_id = p_member) then raise exception '還沒有約定內容'; end if;
  if public.my_member_id() = p_member then
    update public.agreements set kid_signed_at = now() where member_id = p_member;
  else
    update public.agreements set parent_signed_at = now(), parent_signer = public.my_member_id() where member_id = p_member;
  end if;
end $$;

create or replace function public.balances(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  return jsonb_build_object('free', public._bal(p_member, 'free'), 'dream', public._bal(p_member, 'dream'), 'long', public._bal(p_member, 'long'),
    'last_expense', (select max(created_at) from public.expenses where member_id = p_member and not voided));
end $$;

create or replace function public.year_stats(p_member uuid, p_year int) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare y text := p_year::text || '-%'; r jsonb;
begin
  perform public._need_access(p_member);
  select jsonb_build_object(
    'long_net', coalesce((select sum(amount) from public.ledger where member_id = p_member and jar = 'long' and month like y), 0),
    'dream_net', coalesce((select sum(amount) from public.ledger where member_id = p_member and jar = 'dream' and month like y), 0),
    'interest', coalesce((select sum(amount) from public.ledger where member_id = p_member and kind = 'interest' and month like y), 0),
    'spent', coalesce((select sum(amount) from public.expenses where member_id = p_member and not voided and month like y), 0),
    'need', coalesce((select sum(amount) from public.expenses where member_id = p_member and not voided and type = 'need' and month like y), 0),
    'want', coalesce((select sum(amount) from public.expenses where member_id = p_member and not voided and type = 'want' and month like y), 0),
    'cats', coalesce((select jsonb_object_agg(category, s) from (select category, sum(amount) s from public.expenses
              where member_id = p_member and not voided and month like y group by category) c), '{}'::jsonb)
  ) into r;
  return r;
end $$;

-- ---------- Apple Shortcuts ----------
create or replace function public.rotate_quick_token(p_member uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  perform public._need_access(p_member);
  v := encode(extensions.gen_random_bytes(18), 'hex');
  update public.members set quick_hash = encode(extensions.digest(v, 'sha256'), 'hex') where id = p_member;
  return v;
end $$;

create or replace function public.quick_add(p_token text, p_item text, p_amount int, p_type text, p_category text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_member uuid; v_name text; r jsonb;
begin
  select id, name into v_member, v_name from public.members where quick_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex');
  if v_member is null then raise exception '記帳碼無效，請到 App 的「快速記帳」重新產生'; end if;
  r := public._add_expense(v_member, p_item, p_amount, coalesce(p_type, 'want'), p_category, 'shortcut');
  return r || jsonb_build_object('name', v_name);
end $$;

-- ---------- login & onboarding (used by edge functions with the service role) ----------
create or replace function public.family_roster(p_code text)
returns table(id uuid, name text, role text, color text, has_pin boolean, family_name text)
language sql stable security definer set search_path = public as $$
  select m.id, m.name, m.role, m.color, m.pin_hash is not null, f.name
  from public.members m join public.families f on f.id = m.family_id
  where upper(f.code) = upper(trim(p_code)) and length(trim(p_code)) = 6 and not m.archived
  order by (m.role = 'kid'), m.created_at
$$;

create or replace function public.verify_pin(p_code text, p_member uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare m record; v_fail int;
begin
  select x.* into m from public.members x join public.families f on f.id = x.family_id
  where x.id = p_member and upper(f.code) = upper(trim(p_code));
  if not found then return jsonb_build_object('ok', false, 'error', '找不到這位成員，請確認家庭代碼'); end if;
  if m.locked_until is not null and m.locked_until > now() then return jsonb_build_object('ok', false, 'error', '密碼錯太多次，請 15 分鐘後再試'); end if;
  if m.pin_hash is null then return jsonb_build_object('ok', false, 'error', '還沒設定密碼，請家長到「家長設定」幫你設定'); end if;
  if m.pin_hash <> extensions.crypt(coalesce(p_pin, ''), m.pin_hash) then
    v_fail := m.failed + 1;
    update public.members set failed = case when v_fail >= 5 then 0 else v_fail end,
      locked_until = case when v_fail >= 5 then now() + interval '15 minutes' else null end
    where id = m.id;
    return jsonb_build_object('ok', false, 'error',
      case when v_fail >= 5 then '密碼錯太多次，請 15 分鐘後再試' else '密碼不對，還可以再試 ' || (5 - v_fail) || ' 次' end);
  end if;
  update public.members set failed = 0, locked_until = null where id = m.id;
  if m.user_id is null then return jsonb_build_object('ok', false, 'error', '帳號還沒建立完成，請家長重新新增'); end if;
  return jsonb_build_object('ok', true, 'user_id', m.user_id);
end $$;

create or replace function public.create_family_for(p_user uuid, p_family text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_code text; v_fam uuid; v_mem uuid; chars text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int;
begin
  if exists(select 1 from public.members where user_id = p_user) then raise exception '這個帳號已經有家庭了'; end if;
  loop
    v_code := '';
    for i in 1..6 loop v_code := v_code || substr(chars, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % 32), 1); end loop;
    exit when not exists(select 1 from public.families where code = v_code);
  end loop;
  insert into public.families(name, code) values (left(coalesce(nullif(trim(p_family), ''), '我們家'), 30), v_code) returning id into v_fam;
  insert into public.members(family_id, user_id, name, role, allowance, color, is_owner)
  values (v_fam, p_user, left(coalesce(nullif(trim(p_name), ''), '家長'), 20), 'parent', 0, 'long', true) returning id into v_mem;
  return jsonb_build_object('family_id', v_fam, 'member_id', v_mem, 'code', v_code);
end $$;

create or replace function public.admin_add_member(p_caller uuid, p_name text, p_role text, p_allowance int, p_color text, p_pin text) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare c record; v_id uuid;
begin
  select * into c from public.members where user_id = p_caller;
  if not found or c.role <> 'parent' then raise exception '只有家長可以新增成員'; end if;
  if (select count(*) from public.members where family_id = c.family_id) >= 12 then raise exception '一個家庭最多 12 位成員'; end if;
  if coalesce(trim(p_name), '') = '' or char_length(trim(p_name)) > 20 then raise exception '名字要在 20 字以內'; end if;
  if p_role not in ('parent', 'kid') then raise exception '身分不正確'; end if;
  if p_pin !~ '^\d{4,8}$' then raise exception '密碼要是 4 到 8 位數字'; end if;
  if p_role = 'parent' and length(p_pin) < 6 then raise exception '家長的密碼至少 6 位數字'; end if;
  insert into public.members(family_id, name, role, allowance, color, pin_hash)
  values (c.family_id, trim(p_name), p_role, greatest(0, least(coalesce(p_allowance, 0), 1000000)),
          case when p_color in ('free', 'dream', 'long', 'ink', 'sky') then p_color else 'sky' end,
          extensions.crypt(p_pin, extensions.gen_salt('bf')))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_link_user(p_member uuid, p_user uuid) returns void
language sql security definer set search_path = public as
$$ update public.members set user_id = p_user where id = p_member $$;

-- ---------- grants ----------
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
grant execute on function public.my_member_id(), public.my_family_id(), public.am_parent(), public.can_access(uuid), public.cur_month() to authenticated;
grant execute on function
  public.plan_month(uuid, text, int, text, int, int, int), public.add_expense(uuid, text, int, text, text),
  public.delete_expense(uuid), public.save_review(uuid, text, jsonb), public.close_month(uuid, text),
  public.set_goal(uuid, text, int), public.apply_goal_change(uuid), public.cancel_goal_change(uuid),
  public.buy_goal(uuid), public.give_bonus(uuid), public.give_reward(uuid, text, int, text),
  public.update_member(uuid, text, text, int, text), public.remove_member(uuid), public.update_family(text, numeric, int),
  public.set_member_pin(uuid, text), public.save_year_plan(uuid, int, jsonb), public.save_agreement(uuid, jsonb),
  public.sign_agreement(uuid), public.rotate_quick_token(uuid), public.balances(uuid), public.year_stats(uuid, int)
to authenticated;
grant execute on function public.family_roster(text) to anon, authenticated;
grant execute on function public.verify_pin(text, uuid, text), public.create_family_for(uuid, text, text),
  public.admin_add_member(uuid, text, text, int, text, text), public.admin_link_user(uuid, uuid),
  public.quick_add(text, text, int, text, text) to service_role;

-- ---------- personal colour theme ----------
alter table public.members add column if not exists theme text not null default 'morandi'
  check (theme in ('morandi', 'court', 'kpop', 'earth'));
grant select (theme) on public.members to authenticated;
create or replace function public.set_theme(p_member uuid, p_theme text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public._need_access(p_member);
  if p_theme not in ('morandi', 'court', 'kpop', 'earth') then raise exception '主題不正確'; end if;
  update public.members set theme = p_theme where id = p_member;
end $$;
revoke execute on function public.set_theme(uuid, text) from public, anon;
grant execute on function public.set_theme(uuid, text) to authenticated;
