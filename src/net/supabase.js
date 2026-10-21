// Client Supabase partagé (comptes, sauvegarde en ligne, salles de combat amical). Null tant que le
// serveur n'est pas configuré (net/config.js).
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, cloudConfigured } from './config.js';

let client = null;
export function supabase() {
  if (window.__STRIKE_SUPABASE) return window.__STRIKE_SUPABASE;   // client de test injecté
  if (!cloudConfigured()) return null;
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'strike-auth' } });
  return client;
}
