/** Erreur métier avec message affichable à l'utilisateur et code HTTP. */
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const notFound = (what = "Ressource") => new AppError(404, "not_found", `${what} introuvable`);
export const forbidden = (msg = "Action non autorisée") => new AppError(403, "forbidden", msg);
export const badRequest = (msg: string, details?: unknown) => new AppError(400, "bad_request", msg, details);
export const unauthorized = () => new AppError(401, "unauthorized", "Connexion requise");
export const conflict = (msg: string) => new AppError(409, "conflict", msg);
