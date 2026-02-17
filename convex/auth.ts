import { mutation, query, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import {
  hashPassword,
  verifyPassword,
  generateToken,
  hashToken,
  getAuthUser,
  requireAuth,
  SESSION_DURATION_MS,
} from "./lib";

// ─── Register ───────────────────────────────────────────
export const register = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.string(),
  },
  handler: async (ctx, { email, password, name }) => {
    const normalizedEmail = email.toLowerCase().trim();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      throw new Error("Invalid email address");
    }
    if (password.length < 8) {
      throw new Error("Password must be at least 8 characters");
    }
    if (!name.trim()) {
      throw new Error("Name is required");
    }

    // Check if email already exists
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();
    if (existing) {
      throw new Error("Email already registered");
    }

    // First user becomes superadmin
    const allUsers = await ctx.db.query("users").take(1);
    const globalRole = allUsers.length === 0 ? "superadmin" : "user";

    const passwordHash = await hashPassword(password);
    const now = Date.now();

    const userId = await ctx.db.insert("users", {
      email: normalizedEmail,
      passwordHash,
      name: name.trim(),
      globalRole,
      emailVerified: false,
      createdAt: now,
      updatedAt: now,
    });

    // Create session
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);

    await ctx.db.insert("sessions", {
      userId,
      tokenHash,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
    });

    return {
      token: rawToken,
      user: {
        _id: userId,
        email: normalizedEmail,
        name: name.trim(),
        globalRole,
      },
    };
  },
});

// ─── Login ──────────────────────────────────────────────
export const login = mutation({
  args: {
    email: v.string(),
    password: v.string(),
  },
  handler: async (ctx, { email, password }) => {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();
    if (!user) {
      throw new Error("Invalid email or password");
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new Error("Invalid email or password");
    }

    const now = Date.now();
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);

    await ctx.db.insert("sessions", {
      userId: user._id,
      tokenHash,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
    });

    return {
      token: rawToken,
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        globalRole: user.globalRole,
      },
    };
  },
});

// ─── Logout ─────────────────────────────────────────────
export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await hashToken(token);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (session) {
      await ctx.db.delete(session._id);
    }
  },
});

// ─── Me (reactive user lookup) ──────────────────────────
export const me = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    const user = await getAuthUser(ctx, token);
    if (!user) return null;
    return {
      _id: user._id,
      email: user.email,
      name: user.name,
      globalRole: user.globalRole,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    };
  },
});

// ─── Verify Token (internal, backend-to-backend) ────────
export const verifyToken = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const tokenHash = await hashToken(token);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (!session || session.expiresAt < Date.now()) return null;
    return { userId: session.userId };
  },
});

// ─── Update Profile ─────────────────────────────────────
export const updateProfile = mutation({
  args: {
    token: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, { token, name }) => {
    const user = await requireAuth(ctx, token);
    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (name !== undefined) {
      if (!name.trim()) throw new Error("Name cannot be empty");
      updates.name = name.trim();
    }
    await ctx.db.patch(user._id, updates);
    return { success: true };
  },
});

// ─── Change Password ────────────────────────────────────
export const changePassword = mutation({
  args: {
    token: v.string(),
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, { token, currentPassword, newPassword }) => {
    const user = await requireAuth(ctx, token);

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      throw new Error("Current password is incorrect");
    }
    if (newPassword.length < 8) {
      throw new Error("New password must be at least 8 characters");
    }

    const newHash = await hashPassword(newPassword);
    await ctx.db.patch(user._id, {
      passwordHash: newHash,
      updatedAt: Date.now(),
    });

    // Invalidate all other sessions (keep current)
    const tokenHash = await hashToken(token);
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const session of sessions) {
      if (session.tokenHash !== tokenHash) {
        await ctx.db.delete(session._id);
      }
    }

    return { success: true };
  },
});

// ─── Cleanup Expired Sessions ───────────────────────────
export const cleanupExpiredSessions = internalMutation({
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("sessions")
      .withIndex("by_expires")
      .filter((q) => q.lt(q.field("expiresAt"), now))
      .take(500);
    for (const session of expired) {
      await ctx.db.delete(session._id);
    }
    return { deleted: expired.length };
  },
});
