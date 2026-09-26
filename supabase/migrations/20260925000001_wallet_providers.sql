-- Una wallet por proveedor y usuario: Freighter nunca sustituye a Cavos.
alter table public.wallet_accounts drop constraint wallet_accounts_pkey;
alter table public.wallet_accounts add primary key (user_id, provider);
