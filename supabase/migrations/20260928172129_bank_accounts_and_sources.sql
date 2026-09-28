create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 60),
  source text not null default 'csv' check (source in ('csv', 'account_aggregator')),
  created_at timestamptz not null default now(),
  unique (user_id, nickname)
);

create index bank_accounts_user_idx on public.bank_accounts(user_id);
alter table public.bank_accounts enable row level security;
create policy "Users can read their bank accounts" on public.bank_accounts for select to authenticated using (auth.uid() = user_id);
create policy "Users can add their bank accounts" on public.bank_accounts for insert to authenticated with check (auth.uid() = user_id and source = 'csv');
create policy "Users can update their bank accounts" on public.bank_accounts for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id and source = 'csv');
create policy "Users can remove their bank accounts" on public.bank_accounts for delete to authenticated using (auth.uid() = user_id and source = 'csv');

alter table public.transactions add column bank_account_id uuid references public.bank_accounts(id) on delete set null;
create index transactions_bank_account_idx on public.transactions(user_id, bank_account_id);
