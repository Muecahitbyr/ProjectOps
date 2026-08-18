import bcrypt from "bcryptjs";

// bcrypt statt sha256/md5 - langsam mit Absicht (Cost-Faktor), macht
// Brute-Force gegen gestohlene Hashes unpraktikabel. Nie ein Klartext-
// Passwort in Logs/DB, siehe Migration 0024 (nur password_hash).
const SALT_ROUNDS = 12;

export async function hashPassword(plainPassword: string): Promise<string> {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export async function verifyPassword(plainPassword: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}
