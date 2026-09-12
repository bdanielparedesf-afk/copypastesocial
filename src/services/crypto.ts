import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface EncryptedPayload {
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH);
}

export function encrypt(text: string, key: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const derivedKey = deriveKey(key, salt);
  const cipher = createCipheriv(ALGORITHM, derivedKey, iv);
  let ciphertext = cipher.update(text, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  const payload: EncryptedPayload = {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag,
    ciphertext,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decrypt(encrypted: string, key: string): string {
  const payload: EncryptedPayload = JSON.parse(
    Buffer.from(encrypted, 'base64').toString('utf8')
  );
  const salt = Buffer.from(payload.salt, 'hex');
  const iv = Buffer.from(payload.iv, 'hex');
  const authTag = Buffer.from(payload.authTag, 'hex');
  const derivedKey = deriveKey(key, salt);
  const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);
  let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');
  return plaintext;
}