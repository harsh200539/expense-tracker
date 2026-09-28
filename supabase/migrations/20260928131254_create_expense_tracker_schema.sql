-- Expense Tracker schema. Apply to a dedicated Supabase project.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR', 'GBP'))
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 100),
  amount numeric(15,2) not null check (amount > 0 and amount <= 1000000000000),
  type text not null check (type in ('income', 'expense')),
  category text not null check (char_length(category) between 1 and 40),
  date date not null,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc, id desc);

alter table public.profiles enable row level security;
alter table public.transactions enable row level security;

create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "edit own profile" on public.profiles for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "read own transactions" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "create own transactions" on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "edit own transactions" on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "delete own transactions" on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
