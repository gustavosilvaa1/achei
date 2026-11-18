-- Achei! - schema do MVP
-- Execute este arquivo no SQL Editor do projeto Supabase.

create extension if not exists pgcrypto;

create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 100),
  papel text not null default 'equipe'
    check (papel in ('equipe', 'administrador')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.achados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique default ('ACH-' || upper(substr(gen_random_uuid()::text, 1, 4))),
  nome text not null check (char_length(nome) between 3 and 120),
  descricao text not null check (char_length(descricao) between 10 and 2000),
  categoria text not null check (categoria in ('Eletrônicos', 'Acessórios', 'Material escolar', 'Outros')),
  local text not null check (char_length(local) between 2 and 160),
  complemento text,
  encontrado_em date not null,
  status text not null default 'disponivel'
    check (status in ('disponivel', 'devolvido')),
  foto_url text,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_achados_status on public.achados(status);
create index if not exists idx_achados_categoria on public.achados(categoria);
create index if not exists idx_achados_nome on public.achados using gin (to_tsvector('portuguese', nome));

create or replace function public.definir_atualizado_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists achados_atualizado_em on public.achados;
create trigger achados_atualizado_em
before update on public.achados
for each row execute function public.definir_atualizado_em();

alter table public.perfis enable row level security;
alter table public.achados enable row level security;

drop policy if exists "achados_leitura_publica" on public.achados;
create policy "achados_leitura_publica"
on public.achados for select
to anon, authenticated
using (true);

drop policy if exists "achados_insert_equipe" on public.achados;
create policy "achados_insert_equipe"
on public.achados for insert
to authenticated
with check (
  auth.uid() = criado_por
  and exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel in ('equipe', 'administrador')
  )
);

drop policy if exists "achados_update_equipe" on public.achados;
create policy "achados_update_equipe"
on public.achados for update
to authenticated
using (
  exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel in ('equipe', 'administrador')
  )
)
with check (
  exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel in ('equipe', 'administrador')
  )
);

drop policy if exists "achados_delete_administrador" on public.achados;
create policy "achados_delete_administrador"
on public.achados for delete
to authenticated
using (
  exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel = 'administrador'
  )
);

drop policy if exists "perfis_usuario_proprio" on public.perfis;
create policy "perfis_usuario_proprio"
on public.perfis for select
to authenticated
using (auth.uid() = id);

-- Perfis e papéis só podem ser provisionados pelo administrador no painel.
drop policy if exists "perfis_insert_proprio" on public.perfis;
drop policy if exists "perfis_update_proprio" on public.perfis;
drop policy if exists "perfis_delete_proprio" on public.perfis;

revoke all on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;

revoke all on public.achados from anon, authenticated;
grant select (
  id, codigo, nome, descricao, categoria, local, complemento,
  encontrado_em, status, foto_url, criado_em, atualizado_em
) on public.achados to anon, authenticated;
grant insert (
  nome, descricao, categoria, local, complemento, encontrado_em,
  status, foto_url, criado_por
) on public.achados to authenticated;
grant update (
  nome, descricao, categoria, local, complemento, encontrado_em,
  status, foto_url
) on public.achados to authenticated;
grant delete on public.achados to authenticated;

-- Fotos públicas para consulta, com gravação restrita à equipe autenticada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('achados-fotos', 'achados-fotos', true, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "fotos_leitura_publica" on storage.objects;
create policy "fotos_leitura_publica"
on storage.objects for select
to anon, authenticated
using (bucket_id = 'achados-fotos');

drop policy if exists "fotos_upload_equipe" on storage.objects;
create policy "fotos_upload_equipe"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'achados-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel in ('equipe', 'administrador')
  )
);

drop policy if exists "fotos_update_equipe" on storage.objects;
create policy "fotos_update_equipe"
on storage.objects for update
to authenticated
using (
  bucket_id = 'achados-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel in ('equipe', 'administrador')
  )
)
with check (
  bucket_id = 'achados-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel in ('equipe', 'administrador')
  )
);

drop policy if exists "fotos_delete_equipe" on storage.objects;
create policy "fotos_delete_equipe"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'achados-fotos'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (
    select 1 from public.perfis p
    where p.id = auth.uid()
      and p.papel in ('equipe', 'administrador')
  )
);

-- Dados iniciais para testar o CRUD no Table Editor.
insert into public.achados (
  nome, descricao, categoria, local, complemento, encontrado_em, status
)
select seed.nome, seed.descricao, seed.categoria, seed.local, seed.complemento, seed.encontrado_em::date, seed.status
from (values
  ('Mochila azul-marinho', 'Mochila média, azul-marinho, com dois compartimentos e um pequeno chaveiro amarelo.', 'Material escolar', 'Biblioteca central', '1º andar, área de estudos', '2026-11-13', 'disponivel'),
  ('Fone de ouvido branco', 'Fone intra-auricular branco com estojo pequeno e cabo USB-C.', 'Eletrônicos', 'Bloco de aulas B', 'Perto da sala 204', '2026-11-13', 'disponivel'),
  ('Chaveiro com duas chaves', 'Chaveiro de tecido azul escuro com duas chaves pequenas.', 'Acessórios', 'Cantina', 'Próximo às mesas externas', '2026-11-12', 'disponivel')
) as seed(nome, descricao, categoria, local, complemento, encontrado_em, status)
where not exists (
  select 1 from public.achados existing
  where existing.nome = seed.nome
    and existing.encontrado_em = seed.encontrado_em::date
);
