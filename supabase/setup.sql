-- STRIKE : configuration du serveur Supabase (comptes, sauvegardes, amis).
-- À coller en entier dans Supabase > SQL Editor > New query, puis « Run ». Peut être relancé sans risque.

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

-- le nom de joueur ne peut pas être changé après coup (le nom affiché, lui, peut l'être)
create or replace function public.keep_username() returns trigger language plpgsql set search_path = '' as $$
begin new.username := old.username; return new; end; $$;
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
alter table public.friendships enable row level security;
drop policy if exists "voir ses amis" on public.friendships;
drop policy if exists "demander en ami" on public.friendships;
drop policy if exists "accepter une demande" on public.friendships;
drop policy if exists "retirer un ami" on public.friendships;
create policy "voir ses amis" on public.friendships for select using (auth.uid() in (requester, addressee));
create policy "demander en ami" on public.friendships for insert with check (auth.uid() = requester and status = 'pending');
create policy "accepter une demande" on public.friendships for update using (auth.uid() = addressee) with check (status = 'accepted');
create policy "retirer un ami" on public.friendships for delete using (auth.uid() in (requester, addressee));
