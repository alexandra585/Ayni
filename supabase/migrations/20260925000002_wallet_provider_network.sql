-- Una wallet por usuario, proveedor y red. Conserva las filas y las políticas RLS.
begin;

alter table public.wallet_accounts drop constraint wallet_accounts_pkey;
alter table public.wallet_accounts
  add constraint wallet_accounts_pkey primary key (user_id, provider, network);

commit;
