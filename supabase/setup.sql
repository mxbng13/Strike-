-- STRIKE : configuration du serveur Supabase (comptes, sauvegardes, amis).
-- À coller en entier dans Supabase > SQL Editor > New query, puis « Run ». Peut être relancé sans risque.
-- Les comptes sont créés par la fonction serveur supabase/functions/signup (déjà confirmés, sans e-mail).

-- 1) Sauvegardes : une ligne par compte, chacun ne voit que la sienne
create table if not exists public.saves (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.saves enable row level security;
drop policy if exists "lire sa sauvegarde" on public.saves;
drop policy if exists "creer sa sauvegarde" on public.saves;
drop policy if exists "modifier sa sauvegarde" on public.saves;
create policy "lire sa sauvegarde" on public.saves for select using (auth.uid() = user_id);
create policy "creer sa sauvegarde" on public.saves for insert with check (auth.uid() = user_id);
create policy "modifier sa sauvegarde" on public.saves for update using (auth.uid() = user_id);

-- 2) Profils publics : nom de joueur unique (sans tenir compte des majuscules), visible pour la recherche d'amis
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{3,16}$'),
  name text not null,
  avatar text not null default 'defaut',
  trophies integer not null default 0,
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_username_unique on public.profiles (lower(username));

-- ID joueur (STK-XXXXXX) donné par le serveur à chaque compte : sert à ajouter un ami
create or replace function public.new_player_code() returns text language plpgsql set search_path = '' as $$
declare c text;
begin
  loop
    select 'STK-' || string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '') into c from generate_series(1, 6);
    exit when not exists (select 1 from public.profiles where player_code = c);
  end loop;
  return c;
end; $$;
alter table public.profiles add column if not exists player_code text;
update public.profiles set player_code = public.new_player_code() where player_code is null;
alter table public.profiles alter column player_code set default public.new_player_code();
alter table public.profiles alter column player_code set not null;
create unique index if not exists profiles_player_code_unique on public.profiles (player_code);
alter table public.profiles enable row level security;
drop policy if exists "profils visibles" on public.profiles;
drop policy if exists "modifier son profil" on public.profiles;
create policy "profils visibles" on public.profiles for select using (auth.role() = 'authenticated');
create policy "modifier son profil" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- profil créé automatiquement à l'inscription, avec le nom de joueur choisi
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username, name)
  values (new.id, new.raw_user_meta_data ->> 'username', new.raw_user_meta_data ->> 'username');
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- appelée seulement par le déclencheur, jamais directement depuis le jeu
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- le nom de joueur et l'ID joueur ne peuvent pas être changés après coup (le nom affiché, lui, peut l'être)
create or replace function public.keep_username() returns trigger language plpgsql set search_path = '' as $$
begin new.username := old.username; new.player_code := old.player_code; return new; end; $$;
drop trigger if exists profiles_keep_username on public.profiles;
create trigger profiles_keep_username before update on public.profiles for each row execute function public.keep_username();

-- 3) Amis : demandes (pending) et amitiés (accepted)
create table if not exists public.friendships (
  requester uuid not null references public.profiles (id) on delete cascade,
  addressee uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  primary key (requester, addressee),
  check (requester <> addressee)
);
-- une seule ligne par paire de joueurs (deux demandes croisées au même moment : la 2e accepte la 1re)
create unique index if not exists friendships_pair_unique on public.friendships (least(requester, addressee), greatest(requester, addressee));
alter table public.friendships enable row level security;
drop policy if exists "voir ses amis" on public.friendships;
drop policy if exists "demander en ami" on public.friendships;
drop policy if exists "accepter une demande" on public.friendships;
drop policy if exists "retirer un ami" on public.friendships;
create policy "voir ses amis" on public.friendships for select using (auth.uid() in (requester, addressee));
create policy "demander en ami" on public.friendships for insert with check (auth.uid() = requester and status = 'pending');
create policy "accepter une demande" on public.friendships for update using (auth.uid() = addressee) with check (status = 'accepted');
create policy "retirer un ami" on public.friendships for delete using (auth.uid() in (requester, addressee));
