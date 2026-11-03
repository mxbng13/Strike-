/**
 * Stockage des fichiers. Pilote « local » (dossier ./uploads, développement / auto-hébergement)
 * ou « s3 » (tout service compatible S3). Les fichiers ne sont jamais servis directement :
 * ils passent par /api/files/[key] qui vérifie les droits d'accès.
 */
import "server-only";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { badRequest } from "./errors";

const ROOT = path.resolve(process.cwd(), "uploads");

export const ALLOWED_MIME: Record<string, { kind: "image" | "video" | "audio" | "file"; maxMb: number; ext: string }> = {
  "image/jpeg": { kind: "image", maxMb: 8, ext: "jpg" },
  "image/png": { kind: "image", maxMb: 8, ext: "png" },
  "image/webp": { kind: "image", maxMb: 8, ext: "webp" },
  "image/gif": { kind: "image", maxMb: 8, ext: "gif" },
  "video/mp4": { kind: "video", maxMb: 40, ext: "mp4" },
  "video/webm": { kind: "video", maxMb: 40, ext: "webm" },
  "video/quicktime": { kind: "video", maxMb: 40, ext: "mov" },
  "audio/webm": { kind: "audio", maxMb: 8, ext: "webm" },
  "audio/ogg": { kind: "audio", maxMb: 8, ext: "ogg" },
  "audio/mp4": { kind: "audio", maxMb: 8, ext: "m4a" },
  "audio/mpeg": { kind: "audio", maxMb: 8, ext: "mp3" },
  "application/pdf": { kind: "file", maxMb: 15, ext: "pdf" },
  "text/plain": { kind: "file", maxMb: 2, ext: "txt" },
};

/** Vérifie la signature binaire (« magic bytes ») pour empêcher un fichier déguisé. */
export function sniffMime(buf: Buffer, declared: string): boolean {
  const b = (i: number) => buf[i];
  const ascii = (s: number, e: number) => buf.subarray(s, e).toString("ascii");
  switch (declared) {
    case "image/jpeg":
      return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
    case "image/png":
      return b(0) === 0x89 && ascii(1, 4) === "PNG";
    case "image/gif":
      return ascii(0, 3) === "GIF";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP";
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
      return ascii(4, 8) === "ftyp";
    case "video/webm":
    case "audio/webm":
      return b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3;
    case "audio/ogg":
      return ascii(0, 4) === "OggS";
    case "audio/mpeg":
      return ascii(0, 3) === "ID3" || (b(0) === 0xff && (b(1) & 0xe0) === 0xe0);
    case "text/plain":
      return !buf.subarray(0, 512).includes(0);
    default:
      return false;
  }
}

export function validateFile(buf: Buffer, mime: string) {
  const baseMime = mime.split(";")[0].trim();
  const rule = ALLOWED_MIME[baseMime];
  if (!rule) throw badRequest("Type de fichier non autorisé");
  if (buf.length > rule.maxMb * 1024 * 1024) throw badRequest(`Fichier trop volumineux (max ${rule.maxMb} Mo)`);
  if (buf.length === 0) throw badRequest("Fichier vide");
  if (!sniffMime(buf, baseMime)) throw badRequest("Le contenu du fichier ne correspond pas à son type");
  return { ...rule, mime: baseMime };
}

export async function putObject(buf: Buffer, ext: string): Promise<string> {
  const key = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
  if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
    const { s3Put } = await import("./storage-s3");
    await s3Put(key, buf);
    return key;
  }
  const full = path.join(ROOT, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, buf);
  return key;
}

export async function getObject(key: string): Promise<Buffer | null> {
  if (!/^[0-9]{4}-[0-9]{2}\/[0-9a-f-]{36}\.[a-z0-9]{2,4}$/.test(key)) return null;
  if ((process.env.STORAGE_DRIVER ?? "local") === "s3") {
    const { s3Get } = await import("./storage-s3");
    return s3Get(key);
  }
  try {
    return await fs.readFile(path.join(ROOT, key));
  } catch {
    return null;
  }
}

export const fileUrl = (key: string) => `/api/files/${key}`;
