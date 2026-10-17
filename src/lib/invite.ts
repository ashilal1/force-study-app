import "server-only";
import { createHash, randomInt } from "node:crypto";

// Invite codes (ADR-026): 10 characters from a 31-letter alphabet without look-alikes
// (0/O, 1/I/L), about 49.5 bits from the OS CSPRNG. Only the SHA-256 is stored.

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const LENGTH = 10;

export function generateInviteCode(): string {
  return Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

/** Uppercase and drop separators, so "k7qm-3xrp wd" and "K7QM3XRPWD" are the same code. */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** "K7QM3XRPWD" → "K7QM-3XRP-WD" for reading aloud and typing. */
export function formatInviteCode(code: string): string {
  return normalizeInviteCode(code).replace(/(.{4})(?=.)/g, "$1-");
}

export function hashInviteCode(input: string): string {
  return createHash("sha256").update(normalizeInviteCode(input)).digest("hex");
}
