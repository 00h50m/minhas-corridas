-- Minhas Corridas — esquema do Supabase (fase 3: login e sincronização)
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query → Run.
-- Pode rodar de novo sem problema (é idempotente).

-- 1) Registros sincronizados: corridas, objetivos e metadados de anexos.
--    Cada linha guarda o objeto do app em `data` (jsonb). Exclusões viram `deleted = true`
--    para que os outros aparelhos fiquem sabendo.
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('race', 'goal', 'file', 'workout')),
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

-- 6) Agenda por assinatura (Ajustes → Agenda e avisos).
--    Um link secreto por pessoa. O calendário (Google, Apple, Outlook) busca /api/agenda com esse
--    token; a função calendar_feed devolve só os campos que vão para a agenda (nunca custos ou notas).
create table if not exists public.calendar_feeds (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique check (char_length(token) >= 48),
  created_at timestamptz not null default now()
);
alter table public.calendar_feeds enable row level security;
drop policy if exists "feeds: dono lê" on public.calendar_feeds;
drop policy if exists "feeds: dono apaga" on public.calendar_feeds;
create policy "feeds: dono lê" on public.calendar_feeds
  for select to authenticated using (user_id = (select auth.uid()));
create policy "feeds: dono apaga" on public.calendar_feeds
  for delete to authenticated using (user_id = (select auth.uid()));

-- Cria (ou troca) o link. O token é gerado no banco: 2 UUIDs aleatórios = 244 bits.
create or replace function public.rotate_calendar_feed()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  t text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
begin
  if uid is null then
    raise exception 'não autenticado';
  end if;
  insert into public.calendar_feeds (user_id, token) values (uid, t)
  on conflict (user_id) do update set token = excluded.token, created_at = now();
  return t;
end;
$$;
revoke all on function public.rotate_calendar_feed() from public, anon;
grant execute on function public.rotate_calendar_feed() to authenticated;

-- Devolve null quando o token não existe (link trocado/desativado) ou { races: [...] }.
drop function if exists public.calendar_feed(text);
create or replace function public.calendar_feed(feed_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when f.uid is null then null else jsonb_build_object('races', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id) || coalesce((
      select jsonb_object_agg(e.key, e.value)
      from jsonb_each(r.data) e
      where e.key = any (array['name', 'date', 'startTime', 'distanceKm', 'city', 'state', 'venueName', 'venueAddress', 'status',
        'bibNumber', 'kitPickupDate', 'kitPickupTime', 'kitPickupAddress', 'signupUrl', 'signupDeadline', 'lotChangeDate', 'scheduleFeed'])
    ), '{}'::jsonb))
    from public.records r
    where r.user_id = f.uid and r.kind = 'race' and not r.deleted and r.data is not null
  ), '[]'::jsonb)) end
  from (select (select c.user_id from public.calendar_feeds c where char_length(feed_token) >= 48 and c.token = feed_token) as uid) f;
$$;
revoke all on function public.calendar_feed(text) from public;
grant execute on function public.calendar_feed(text) to anon, authenticated;

-- 7) Notificações push de prazos (Ajustes → Agenda e avisos).
--    Cada aparelho que ativa as notificações vira uma linha. Quem envia é a função /api/push-cron
--    (Vercel Cron, 1x por dia) com a chave service_role, que fica só no servidor.
create table if not exists public.push_subscriptions (
  endpoint text primary key check (char_length(endpoint) between 10 and 1000),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  tz text not null default 'America/Sao_Paulo' check (char_length(tz) < 60),
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push: dono lê" on public.push_subscriptions;
create policy "push: dono lê" on public.push_subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

-- O mesmo navegador pode trocar de conta: a inscrição passa a ser de quem entrou por último.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_tz text)
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
  if p_endpoint !~ '^https://' then
    raise exception 'endpoint inválido';
  end if;
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth, tz)
  values (p_endpoint, uid, p_p256dh, p_auth, coalesce(nullif(p_tz, ''), 'America/Sao_Paulo'))
  on conflict (endpoint) do update set user_id = uid, p256dh = excluded.p256dh, auth = excluded.auth, tz = excluded.tz, created_at = now();
end;
$$;
revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- Registro do que já foi enviado (evita repetir a mesma notificação). Só o servidor acessa.
create table if not exists public.push_log (
  user_id uuid not null references auth.users (id) on delete cascade,
  key text not null check (char_length(key) < 200),
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.push_log enable row level security;

-- A exclusão de conta (trecho 5) já leva tudo isto junto: as tabelas acima apagam em cascata com o usuário.

-- 8) Preferências das notificações (quais avisos e com quanta antecedência; resumo da semana).
--    Uma linha por pessoa, valendo para todos os aparelhos. Sem linha = padrão do app.
create table if not exists public.push_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb check (pg_column_size(prefs) < 2000),
  updated_at timestamptz not null default now()
);
alter table public.push_prefs enable row level security;
drop policy if exists "prefs: dono lê" on public.push_prefs;
drop policy if exists "prefs: dono insere" on public.push_prefs;
drop policy if exists "prefs: dono altera" on public.push_prefs;
create policy "prefs: dono lê" on public.push_prefs
  for select to authenticated using (user_id = (select auth.uid()));
create policy "prefs: dono insere" on public.push_prefs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "prefs: dono altera" on public.push_prefs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- 9) Perfil opcional (nome, foto, dados para as provas, contato de emergência).
--    Uma linha por pessoa. A foto vai reduzida (~320 px, JPEG) em `avatar`, como data URL.
create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 8000),
  avatar text check (avatar is null or (char_length(avatar) < 300000 and avatar like 'data:image/%')),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "perfil: dono lê" on public.profiles;
drop policy if exists "perfil: dono insere" on public.profiles;
drop policy if exists "perfil: dono altera" on public.profiles;
drop policy if exists "perfil: dono apaga" on public.profiles;
create policy "perfil: dono lê" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "perfil: dono insere" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "perfil: dono altera" on public.profiles
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "perfil: dono apaga" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

-- 10) Mais espaço no perfil para "Pessoas e lugares" (até 30 lugares e 30 pessoas).
alter table public.profiles drop constraint if exists profiles_data_check;
alter table public.profiles add constraint profiles_data_check check (pg_column_size(data) < 32000);

-- 11) Treinos estruturados (criados por você ou pelo seu treinador) sincronizados como registros.
--     Enquanto este trecho não rodar, os treinos ficam guardados só no aparelho, sem se perder.
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check check (kind in ('race', 'goal', 'file', 'workout'));

-- 12) Ciclo menstrual e dados do Garmin (sono, body battery, relatório da importação) sincronizados
--     com a conta, um registro de cada (id 'main'), com as mesmas regras de acesso (só a dona lê e
--     escreve) e apagados junto com a conta. A chave pessoal do Garmin NÃO vai para o banco.
--     Enquanto este trecho não rodar, esses dados ficam só no aparelho, sem se perder.
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check check (kind in ('race', 'goal', 'file', 'workout', 'cycle', 'garmin'));

-- 13) Ficha da academia (Treino A, B, C… do treinador), um registro (id 'main'), com as mesmas regras
--     de acesso. Enquanto este trecho não rodar, a ficha fica só no aparelho, sem se perder.
alter table public.records drop constraint if exists records_kind_check;
alter table public.records add constraint records_kind_check check (kind in ('race', 'goal', 'file', 'workout', 'cycle', 'garmin', 'ficha'));

-- 14) Desafio com amigas: km de corrida, treinos feitos ou horas de treino num período, por convite.
--     Cada pessoa só envia o TOTAL dela no período (nunca as atividades). As tabelas ficam fechadas
--     (RLS sem políticas); tudo passa pelas funções abaixo, que conferem quem pode ver o quê.
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 60),
  metric text not null check (metric in ('km', 'treinos', 'horas')),
  start_date date not null,
  end_date date not null check (end_date >= start_date and end_date - start_date <= 92),
  code text not null unique check (char_length(code) between 8 and 16),
  created_at timestamptz not null default now()
);
create table if not exists public.challenge_members (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  value numeric not null default 0 check (value >= 0 and value < 100000),
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;

create or replace function public.create_challenge(p_title text, p_metric text, p_start date, p_end date, p_name text)
returns table (id uuid, code text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare uid uuid := auth.uid(); c text; cid uuid;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  if (select count(*) from public.challenges ch where ch.owner = uid and ch.end_date >= current_date) >= 10 then raise exception 'limite de desafios ativos'; end if;
  c := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.challenges (owner, title, metric, start_date, end_date, code)
    values (uid, left(trim(p_title), 60), p_metric, p_start, p_end, c) returning challenges.id into cid;
  insert into public.challenge_members (challenge_id, user_id, name) values (cid, uid, left(trim(p_name), 30));
  return query select cid, c;
end; $$;

create or replace function public.join_challenge(p_code text, p_name text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); cid uuid;
begin
  if uid is null then raise exception 'não autenticado'; end if;
  select ch.id into cid from public.challenges ch where ch.code = upper(trim(p_code)) and ch.end_date >= current_date - 7;
  if cid is null then raise exception 'convite inválido ou encerrado'; end if;
  if (select count(*) from public.challenge_members m where m.challenge_id = cid) >= 30 then raise exception 'desafio cheio'; end if;
  insert into public.challenge_members (challenge_id, user_id, name) values (cid, uid, left(trim(p_name), 30))
    on conflict (challenge_id, user_id) do update set name = excluded.name;
  return cid;
end; $$;

create or replace function public.my_challenges()
returns table (id uuid, title text, metric text, start_date date, end_date date, code text, is_owner boolean, members bigint)
language sql security definer set search_path = '' stable as $$
  select ch.id, ch.title, ch.metric, ch.start_date, ch.end_date, ch.code, ch.owner = auth.uid(),
    (select count(*) from public.challenge_members x where x.challenge_id = ch.id)
  from public.challenges ch
  join public.challenge_members m on m.challenge_id = ch.id and m.user_id = auth.uid()
  order by ch.end_date desc;
$$;

create or replace function public.challenge_board(p_id uuid)
returns table (name text, value numeric, updated_at timestamptz, is_me boolean)
language sql security definer set search_path = '' stable as $$
  select m.name, m.value, m.updated_at, m.user_id = auth.uid()
  from public.challenge_members m
  where m.challenge_id = p_id
    and exists (select 1 from public.challenge_members me where me.challenge_id = p_id and me.user_id = auth.uid())
  order by m.value desc, m.joined_at;
$$;

create or replace function public.set_challenge_value(p_id uuid, p_value numeric)
returns void
language sql security definer set search_path = '' as $$
  update public.challenge_members set value = greatest(0, least(p_value, 99999)), updated_at = now()
  where challenge_id = p_id and user_id = auth.uid();
$$;

create or replace function public.leave_challenge(p_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.challenge_members where challenge_id = p_id and user_id = auth.uid();
  delete from public.challenges ch where ch.id = p_id and not exists (select 1 from public.challenge_members m where m.challenge_id = p_id);
end; $$;

revoke all on function public.create_challenge(text, text, date, date, text), public.join_challenge(text, text), public.my_challenges(),
  public.challenge_board(uuid), public.set_challenge_value(uuid, numeric), public.leave_challenge(uuid) from public, anon;
grant execute on function public.create_challenge(text, text, date, date, text), public.join_challenge(text, text), public.my_challenges(),
  public.challenge_board(uuid), public.set_challenge_value(uuid, numeric), public.leave_challenge(uuid) to authenticated;
