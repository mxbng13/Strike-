// Photos de profil (dessins vectoriels intégrés au jeu).
import { getAvatar } from '../data/profile.js';
import { save } from '../save/storage.js';

const SHAPES = {
  // silhouette humaine sombre (photo par défaut)
  person: '<circle cx="50" cy="38" r="17"/><path d="M16 96c2-22 16-34 34-34s32 12 34 34z"/>',
  fighter: '<circle cx="50" cy="26" r="11"/><path d="M36 40l14-4 14 4 12 6 6 18-8 3-7-12-3 16 6 25H58l-8-20-8 20H30l6-25-3-16-7 12-8-3 6-18z"/>',
  bolt: '<path d="M56 10 26 56h20l-6 34 32-48H52z"/>',
  flame: '<path d="M50 12c4 16 22 22 22 44a22 22 0 0 1-44 0c0-10 6-16 10-22 0 8 4 12 8 12-4-14 0-26 4-34z"/>',
  crown: '<path d="M18 70 14 32l20 16 16-26 16 26 20-16-4 38z"/><rect x="18" y="74" width="64" height="10" rx="3"/>',
  mask: '<path d="M14 46c10-12 28-12 36-4 8-8 26-8 36 4 0 14-10 24-22 24-6 0-10-4-14-8-4 4-8 8-14 8-12 0-22-10-22-24z"/><ellipse cx="33" cy="50" rx="8" ry="6" fill="#fff"/><ellipse cx="67" cy="50" rx="8" ry="6" fill="#fff"/>',
  target: '<circle cx="50" cy="50" r="32" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="50" cy="50" r="16" fill="none" stroke="currentColor" stroke-width="8"/><circle cx="50" cy="50" r="5"/>',
  star: '<path d="M50 12l11 24 26 3-19 18 5 26-23-13-23 13 5-26-19-18 26-3z"/>',
};

/** SVG carré de l'avatar (fond + motif). */
export function avatarSvg(id, friendPhoto = null) {
  // photo personnelle (photothèque) : image recadrée en carré ; `friendPhoto` : celle d'un ami
  const photo = id === 'photo' ? friendPhoto ?? save.get().avatarPhoto : null;
  if (photo) return `<svg viewBox="0 0 100 100" class="avatar-svg" aria-hidden="true"><image href="${photo}" width="100" height="100" preserveAspectRatio="xMidYMid slice"/></svg>`;
  const a = getAvatar(id);
  return `<svg viewBox="0 0 100 100" class="avatar-svg" aria-hidden="true">
    <rect width="100" height="100" fill="${a.bg}"/>
    <g fill="${a.fg}" color="${a.fg}">${SHAPES[a.shape] ?? SHAPES.person}</g>
  </svg>`;
}
