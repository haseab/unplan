import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type StoredGoogleTokens = {
  accessToken: string;
  expiresAt: number;
  refreshToken: string;
};

export const googleTokenEncryptionKey = (value: string | undefined) => {
  const key = Buffer.from(value ?? "", "base64");
  if (key.length !== 32 || key.toString("base64") !== value) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be a base64-encoded 32-byte key");
  }
  return key;
};

export const encryptGoogleTokens = (
  tokens: StoredGoogleTokens,
  key: Buffer,
  accountIdentity: string,
) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(accountIdentity));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(tokens), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
};

export const decryptGoogleTokens = (
  encrypted: string,
  key: Buffer,
  accountIdentity: string,
): StoredGoogleTokens => {
  const [version, iv, tag, ciphertext, extra] = encrypted.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext || extra) {
    throw new Error("Invalid encrypted Google credentials");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(accountIdentity));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  const decoded = JSON.parse(Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final(),
  ]).toString("utf8")) as Partial<StoredGoogleTokens>;
  if (typeof decoded.accessToken !== "string" || typeof decoded.refreshToken !== "string"
    || typeof decoded.expiresAt !== "number" || !Number.isFinite(decoded.expiresAt)) {
    throw new Error("Invalid stored Google credentials");
  }
  return decoded as StoredGoogleTokens;
};
