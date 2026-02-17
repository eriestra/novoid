import { GenericQueryCtx, GenericMutationCtx } from "convex/server";
import { DataModel } from "./_generated/dataModel";

export async function hashSecret(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifySecret(
  ctx: GenericQueryCtx<DataModel>,
  secret: string
) {
  const key = await ctx.db
    .query("keys")
    .withIndex("by_name", (q) => q.eq("name", "PUBLISH_SECRET"))
    .first();
  if (!key) throw new Error("Unauthorized");
  const hash = await hashSecret(secret);
  if (key.value !== hash) {
    throw new Error("Unauthorized");
  }
}

// ─── Auth Utilities ─────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000;

function generateSalt(length = 32): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

async function pbkdf2(password: string, salt: string, iterations: number): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: enc.encode(salt), iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(bits));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `${salt}:${PBKDF2_ITERATIONS}:${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, iterStr, storedHash] = stored.split(":");
  const iterations = parseInt(iterStr, 10);
  const hash = await pbkdf2(password, salt, iterations);
  return hash === storedHash;
}

export function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export async function hashToken(token: string): Promise<string> {
  return hashSecret(token); // SHA-256
}

export async function getAuthUser(
  ctx: GenericQueryCtx<DataModel>,
  token: string | undefined
) {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  const user = await ctx.db.get(session.userId);
  return user;
}

export async function requireAuth(
  ctx: GenericQueryCtx<DataModel>,
  token: string | undefined
) {
  const user = await getAuthUser(ctx, token);
  if (!user) throw new Error("Unauthorized");
  return user;
}

export const ROLE_LEVELS: Record<string, number> = {
  owner: 100,
  admin: 80,
  member: 20,
};

export async function requireOrgRole(
  ctx: GenericQueryCtx<DataModel>,
  orgId: string,
  userId: string,
  minRole: string
) {
  const membership = await ctx.db
    .query("orgMemberships")
    .withIndex("by_org_user", (q) =>
      q.eq("organizationId", orgId as any).eq("userId", userId as any)
    )
    .first();
  if (!membership || !membership.isActive) {
    throw new Error("Not a member of this organization");
  }
  const userLevel = ROLE_LEVELS[membership.role] || 0;
  const requiredLevel = ROLE_LEVELS[minRole] || 0;
  if (userLevel < requiredLevel) {
    throw new Error(`Requires ${minRole} role or higher`);
  }
  return membership;
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export { SESSION_DURATION_MS };
