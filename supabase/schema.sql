-- PWA Gastos: esquema completo. Ejecutar una vez en Supabase > SQL Editor.
-- Es idempotente: se puede volver a ejecutar sin perder datos.

-- ============ Tablas ============

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  monthly_budget integer check (monthly_budget is null or monthly_budget between 1 and 100000000),
  created_at timestamptz not null default now(),
  unique (user_id, name),
  -- Necesario para la FK compuesta de expenses (impide usar categorías de otro usuario).
  unique (id, user_id)
);

-- Emoji de la categoría. Con add column para que también llegue a instalaciones ya existentes.
alter table public.categories
  add column if not exists icon text check (icon is null or char_length(icon) <= 8);

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(), -- el cliente lo genera para soportar offline
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  amount integer not null check (amount between 1 and 100000000),
  spent_on date not null check (spent_on between date '2000-01-01' and date '2100-12-31'),
  note text check (note is null or char_length(note) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Las FK ignoran RLS: la compuesta garantiza que la categoría es del mismo usuario.
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete restrict
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, spent_on);

-- ============ Timestamps controlados por el servidor ============
-- created_at define la ventana de edición de 12 h: el cliente no puede fijarlo ni cambiarlo.

drop trigger if exists expenses_set_updated_at on public.expenses;
drop function if exists public.set_updated_at();

create or replace function public.expenses_set_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists expenses_set_timestamps on public.expenses;
create trigger expenses_set_timestamps
  before insert or update on public.expenses
  for each row execute function public.expenses_set_timestamps();

-- ============ Row Level Security ============

alter table public.categories enable row level security;
alter table public.expenses enable row level security;

drop policy if exists categories_select on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists categories_delete on public.categories;
create policy categories_select on public.categories for select to authenticated
  using ((select auth.uid()) = user_id);
create policy categories_insert on public.categories for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy categories_update on public.categories for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy categories_delete on public.categories for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists expenses_select on public.expenses;
drop policy if exists expenses_insert on public.expenses;
drop policy if exists expenses_update on public.expenses;
drop policy if exists expenses_delete on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using ((select auth.uid()) = user_id);
create policy expenses_insert on public.expenses for insert to authenticated
  with check ((select auth.uid()) = user_id);
-- Un gasto solo se puede editar o eliminar durante las 12 horas siguientes a su creación.
create policy expenses_update on public.expenses for update to authenticated
  using ((select auth.uid()) = user_id and created_at > now() - interval '12 hours')
  with check ((select auth.uid()) = user_id);
create policy expenses_delete on public.expenses for delete to authenticated
  using ((select auth.uid()) = user_id and created_at > now() - interval '12 hours');

-- Usuarios no autenticados no tienen nada que hacer aquí.
revoke all on public.categories, public.expenses from anon;

-- ============ Totales mensuales (gráfico de 12 meses) ============
-- security invoker: respeta RLS, cada usuario solo suma sus gastos.

create or replace function public.monthly_totals(p_from date, p_to date)
returns table (month date, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('month', e.spent_on)::date as month, sum(e.amount)::bigint as total
  from public.expenses e
  where e.spent_on >= p_from and e.spent_on < p_to
  group by 1
  order by 1;
$$;

revoke execute on function public.monthly_totals(date, date) from public, anon;
grant execute on function public.monthly_totals(date, date) to authenticated;

-- ============ Eliminar categoría moviendo sus gastos ============
-- security definer porque los gastos de más de 12 h no se pueden editar por RLS; la función
-- valida que ambas categorías sean del usuario y solo cambia la categoría de sus gastos.

create or replace function public.delete_category(p_category uuid, p_move_to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '42501';
  end if;
  if not exists (select 1 from public.categories where id = p_category and user_id = uid) then
    raise exception 'La categoría no existe' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.expenses where category_id = p_category and user_id = uid) then
    if p_move_to is null or p_move_to = p_category
       or not exists (select 1 from public.categories where id = p_move_to and user_id = uid) then
      raise exception 'Elige otra categoría para mover los gastos' using errcode = '22023';
    end if;
    update public.expenses set category_id = p_move_to where category_id = p_category and user_id = uid;
  end if;
  delete from public.categories where id = p_category and user_id = uid;
end;
$$;

revoke execute on function public.delete_category(uuid, uuid) from public, anon;
grant execute on function public.delete_category(uuid, uuid) to authenticated;
