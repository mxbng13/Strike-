// Profil du joueur : nom (avec validation) et avatar.
import { NAME_RULES, BANNED_WORDS, AVATARS } from '../data/profile.js';
import { save } from '../save/storage.js';

const normalize = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Vérifie un nom. Renvoie { ok, value } ou { ok: false, error } (message lisible). */
export function validateName(raw) {
  const value = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (value.length < NAME_RULES.min) return { ok: false, error: `Le nom doit faire au moins ${NAME_RULES.min} caractères.` };
  if (value.length > NAME_RULES.max) return { ok: false, error: `Le nom doit faire au maximum ${NAME_RULES.max} caractères.` };
  if (!/^[\p{L}\p{N} _.-]+$/u.test(value)) return { ok: false, error: 'Utilise uniquement des lettres, des chiffres, des espaces, « _ », « - » ou « . ».' };
  const flat = normalize(value);
  if (BANNED_WORDS.some((w) => flat.includes(normalize(w)) && (w.length > 2 || flat === w))) return { ok: false, error: 'Ce nom n’est pas autorisé.' };
  return { ok: true, value };
}

export function setPlayerName(raw) {
  const v = validateName(raw);
  if (v.ok) save.update({ playerName: v.value });
  return v;
}

export function setAvatar(id) {
  if (id === 'photo') { if (!save.get().avatarPhoto) return { ok: false }; save.update({ avatar: 'photo' }); return { ok: true }; }
  if (!AVATARS.some((a) => a.id === id)) return { ok: false };
  save.update({ avatar: id });
  return { ok: true };
}

/** Photo personnelle : JPEG carré déjà recadré (data URL). Devient la photo de profil. */
export function setAvatarPhoto(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/') || dataUrl.length > 400000) return { ok: false };
  save.update({ avatarPhoto: dataUrl, avatar: 'photo' });
  return { ok: true };
}
