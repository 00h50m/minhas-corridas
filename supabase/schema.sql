-- Minhas Corridas — esquema do Supabase (fase 3: login e sincronização)
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query → Run.
-- Pode rodar de novo sem problema (é idempotente).

-- 1) Registros sincronizados: corridas, objetivos e metadados de anexos.
--    Cada linha guarda o objeto do app em `data` (jsonb). Exclusões viram `deleted = true`
--    para que os outros aparelhos fiquem sabendo.
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('race', 'goal', 'file')),
  id text not null check (char_length(id) between 1 and 80),
  data jsonb,
  deleted boolean not null default false,
  client_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, id)
);

create index if not exists records_user_updated_idx on public.records (user_id, updated_at);

-- 2) Isolamento por usuário: cada pessoa só lê e escreve as próprias linhas.
alter table public.records enable row level security;

drop policy if exists "records: dono lê" on public.records;
drop policy if exists "records: dono insere" on public.records;
drop policy if exists "records: dono altera" on public.records;
drop policy if exists "records: dono apaga" on public.records;

create policy "records: dono lê" on public.records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "records: dono insere" on public.records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "records: dono altera" on public.records
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "records: dono apaga" on public.records
  for delete to authenticated using (user_id = (select auth.uid()));

-- 3) Carimbo do servidor (cursor da sincronização) e "última alteração vence":
--    uma gravação mais antiga que a do banco é ignorada, em vez de sobrescrever.
create or replace function public.records_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.client_updated_at < old.client_updated_at then
    return null; -- mantém a versão mais nova
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists records_before_write on public.records;
create trigger records_before_write
  before insert or update on public.records
  for each row execute function public.records_before_write();

-- 4) Arquivos (anexos e fotos) em um bucket privado. Caminho: <user_id>/<id do arquivo>
insert into storage.buckets (id, name, public, file_size_limit)
values ('anexos', 'anexos', false, 15728640)
on conflict (id) do update set public = false, file_size_limit = 15728640;

drop policy if exists "anexos: dono lê" on storage.objects;
drop policy if exists "anexos: dono envia" on storage.objects;
drop policy if exists "anexos: dono altera" on storage.objects;
drop policy if exists "anexos: dono apaga" on storage.objects;

create policy "anexos: dono lê" on storage.objects
  for select to authenticated using (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "anexos: dono envia" on storage.objects
  for insert to authenticated with check (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "anexos: dono altera" on storage.objects
  for update to authenticated using (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "anexos: dono apaga" on storage.objects
  for delete to authenticated using (bucket_id = 'anexos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 5) Excluir a própria conta (Ajustes → Conta → Excluir minha conta).
--    O app apaga antes os anexos do bucket; esta função apaga os registros e o usuário.
-- dry_run = true só confirma que a função existe (o app checa antes de apagar os anexos).
drop function if exists public.delete_my_account();
create or replace function public.delete_my_account(dry_run boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'não autenticado';
  end if;
  if dry_run then
    return;
  end if;
  delete from public.records where user_id = uid;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account(boolean) from public, anon;
grant execute on function public.delete_my_account(boolean) to authenticated;
