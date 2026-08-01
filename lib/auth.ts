import crypto from "node:crypto";

import { cookies } from "next/headers";

const authCookieName = "portal-auth";
const sessionDurationSeconds = 60 * 60 * 12;
const loginWindowMs = 15 * 60 * 1000;
const maxLoginAttempts = 5;

type LoginAttemptRecord = {
  count: number;
  firstAttemptAt: number;
  lockUntil?: number;
};

const loginAttempts = new Map<string, LoginAttemptRecord>();

function getAdminUsername(): string {
  return process.env.ADMIN_USERNAME || "admin";
}

function getPassword(): string {
  return process.env.ADMIN_PASSWORD || "change-me";
}

function getSessionSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || `${getPassword()}::portal-session`;
}

function getTotpSecret(): string {
  return process.env.ADMIN_TOTP_SECRET?.trim() || "";
}

function base64UrlEncode(value: string | Buffer) {
  const buffer = typeof value === "string" ? Buffer.from(value, "utf8") : value;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function createSignature(value: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function timingSafeTextEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeBase32Secret(secret: string) {
  return secret.toUpperCase().replace(/[^A-Z2-7]/g, "");
}

function decodeBase32(secret: string) {
  const normalized = normalizeBase32Secret(secret);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";

  for (const character of normalized) {
    const index = alphabet.indexOf(character);
    if (index === -1) {
      continue;
    }

    bits += index.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  }

  return Buffer.from(bytes);
}

function generateTotp(secret: string, timestamp = Date.now()) {
  const decodedSecret = decodeBase32(secret);
  const counter = Math.floor(timestamp / 30_000);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const digest = crypto.createHmac("sha1", decodedSecret).update(counterBuffer).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binaryCode =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return String(binaryCode % 1_000_000).padStart(6, "0");
}

function verifyTotp(code: string, secret: string, window = 1) {
  const normalizedCode = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalizedCode)) {
    return false;
  }

  for (let offset = -window; offset <= window; offset += 1) {
    const generated = generateTotp(secret, Date.now() + offset * 30_000);
    if (timingSafeTextEqual(generated, normalizedCode)) {
      return true;
    }
  }

  return false;
}

function createSessionToken(username: string) {
  const payload = {
    sub: username,
    nonce: crypto.randomUUID(),
    exp: Math.floor(Date.now() / 1000) + sessionDurationSeconds,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = createSignature(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifySessionToken(token: string) {
  const [payloadPart, signaturePart] = token.split(".");
  if (!payloadPart || !signaturePart) {
    return false;
  }

  const expectedSignature = createSignature(payloadPart);
  if (!timingSafeTextEqual(signaturePart, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(payloadPart)) as {
      sub?: string;
      exp?: number;
    };

    if (payload.sub !== getAdminUsername()) {
      return false;
    }

    return typeof payload.exp === "number" && payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function getAttemptRecordKey(identifier: string) {
  return `${identifier}::${getAdminUsername().toLowerCase()}`;
}

export function getPortalSecurityState() {
  return {
    username: getAdminUsername(),
    totpEnabled: Boolean(getTotpSecret()),
    sessionSecretConfigured: Boolean(process.env.ADMIN_SESSION_SECRET),
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(authCookieName)?.value;
  return Boolean(token && verifySessionToken(token));
}

export async function createSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(authCookieName, createSessionToken(getAdminUsername()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionDurationSeconds,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(authCookieName);
}

export function usernameMatches(username: string): boolean {
  return timingSafeTextEqual(username.trim(), getAdminUsername());
}

export function passwordMatches(password: string): boolean {
  return timingSafeTextEqual(password, getPassword());
}

export function otpMatches(otp: string): boolean {
  const secret = getTotpSecret();
  if (!secret) {
    return true;
  }

  return verifyTotp(otp, secret);
}

export function isTotpEnabled() {
  return Boolean(getTotpSecret());
}

export function assertLoginAllowed(identifier: string) {
  const key = getAttemptRecordKey(identifier);
  const record = loginAttempts.get(key);
  const now = Date.now();

  if (!record) {
    return;
  }

  if (record.lockUntil && record.lockUntil > now) {
    const remainingMinutes = Math.ceil((record.lockUntil - now) / 60_000);
    throw new Error(
      `Too many login attempts. Please wait ${remainingMinutes} minute${remainingMinutes === 1 ? "" : "s"} and try again.`,
    );
  }

  if (record.firstAttemptAt + loginWindowMs <= now) {
    loginAttempts.delete(key);
  }
}

export function recordFailedLogin(identifier: string) {
  const key = getAttemptRecordKey(identifier);
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (!record || record.firstAttemptAt + loginWindowMs <= now) {
    loginAttempts.set(key, {
      count: 1,
      firstAttemptAt: now,
    });
    return;
  }

  const nextCount = record.count + 1;
  loginAttempts.set(key, {
    ...record,
    count: nextCount,
    lockUntil: nextCount >= maxLoginAttempts ? now + loginWindowMs : record.lockUntil,
  });
}

export function clearFailedLogins(identifier: string) {
  loginAttempts.delete(getAttemptRecordKey(identifier));
}
