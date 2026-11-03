import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = [
  "/accueil",
  "/carte",
  "/publier",
  "/messages",
  "/profil",
  "/parametres",
  "/mes-missions",
  "/calendrier",
  "/revenus",
  "/favoris",
  "/notifications",
  "/communaute",
  "/parrainage",
  "/premium",
  "/explorer",
  "/avis",
  "/onboarding",
  "/admin",
  "/paiement",
];

/** Redirection vers la connexion (vérification complète de la session côté serveur ensuite). */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) || /^\/missions\/[^/]+\/candidatures/.test(pathname)) {
    if (!req.cookies.get("entour_session")) {
      const url = req.nextUrl.clone();
      url.pathname = "/connexion";
      url.search = `?next=${encodeURIComponent(pathname + search)}`;
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!api|_next|.*\\..*).*)"] };
