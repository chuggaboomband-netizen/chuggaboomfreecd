import crypto from "node:crypto";

import { cookies } from "next/headers";

const authCookieName = "portal-auth";

function getPassword(): string {
  return process.env.ADMIN_PASSWORD || "change-me";
}

function getAuthToken(): string {
  return crypto.createHash("sha256").update(getPassword()).digest("hex");
}

export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(authCookieName)?.value === getAuthToken();
}

export async function createSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(authCookieName, getAuthToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export async function clearSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(authCookieName);
}

export function passwordMatches(password: string): boolean {
  return password === getPassword();
}
