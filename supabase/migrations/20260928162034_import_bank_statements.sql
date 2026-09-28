-- Keep a per-user statement fingerprint so re-importing the same rows is safe.
alter table public.transactions add column source_fingerprint text;
alter table public.transactions add constraint transactions_user_source_unique unique (user_id, source_fingerprint);
