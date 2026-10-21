// STRIKE : création de compte (nom de joueur + mot de passe).
// Le jeu fabrique une adresse à partir du nom (jamais utilisée pour envoyer de mail) : on crée donc le compte
// déjà confirmé, côté serveur, pour qu'aucun e-mail de confirmation ne soit envoyé. Le jeu se connecte ensuite
// normalement avec le nom et le mot de passe. Déployée avec verify_jwt = false (appelée avant d'avoir un compte).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  let username = '', password = '';
  try { ({ username = '', password = '' } = await req.json()); } catch { return json({ error: 'invalid' }, 400); }
  username = String(username).trim();
  password = String(password);
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) return json({ error: 'username' }, 400);
  if (password.length < 6 || password.length > 72) return json({ error: 'password' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.createUser({
    email: `${username.toLowerCase()}@joueurs.strike.example.com`,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) {
    const taken = /already|exists|registered|duplicate|database error/i.test(error.message);
    return json({ error: taken ? 'taken' : 'server' }, taken ? 409 : 500);
  }
  return json({ ok: true });
});
