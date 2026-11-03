/**
 * Pilote S3 minimal (signature AWS v4) sans SDK lourd.
 * ⚠️ Préparé mais non testé contre un vrai bucket dans cet environnement :
 * renseignez S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY puis validez.
 */
import "server-only";
import crypto from "node:crypto";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement ${name} manquante pour le stockage S3`);
  return v;
}

const hmac = (key: Buffer | string, data: string) => crypto.createHmac("sha256", key).update(data).digest();
const hash = (data: Buffer | string) => crypto.createHash("sha256").update(data).digest("hex");

function sign(method: "GET" | "PUT", key: string, body: Buffer) {
  const endpoint = new URL(env("S3_ENDPOINT"));
  const region = env("S3_REGION");
  const bucket = env("S3_BUCKET");
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const pathName = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const payloadHash = hash(body);
  const host = endpoint.host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = [method, pathName, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, hash(canonical)].join("\n");
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${env("S3_SECRET_ACCESS_KEY")}`, dateStamp), region), "s3"), "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(toSign).digest("hex");
  return {
    url: `${endpoint.origin}${pathName}`,
    headers: {
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env("S3_ACCESS_KEY_ID")}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

export async function s3Put(key: string, body: Buffer) {
  const { url, headers } = sign("PUT", key, body);
  const res = await fetch(url, { method: "PUT", headers, body: new Uint8Array(body) });
  if (!res.ok) throw new Error(`S3 PUT ${res.status}`);
}

export async function s3Get(key: string): Promise<Buffer | null> {
  const { url, headers } = sign("GET", key, Buffer.alloc(0));
  const res = await fetch(url, { headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`S3 GET ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
