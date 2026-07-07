-- Saathi phone-number auth migration.
-- Run this after the username auth tables already exist.

alter table public.user_accounts add column if not exists phone_number text;

create unique index if not exists user_accounts_phone_number_key
  on public.user_accounts(phone_number)
  where phone_number is not null;
