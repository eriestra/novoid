import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  requireAuth,
  requireOrgRole,
  generateToken,
  hashToken,
  ROLE_LEVELS,
} from "./lib";

// ─── Create Organization ────────────────────────────────
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    slug: v.string(),
  },
  handler: async (ctx, { token, name, slug }) => {
    const user = await requireAuth(ctx, token);

    if (!name.trim()) throw new Error("Organization name is required");
    const normalizedSlug = slug.toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]*$/.test(normalizedSlug)) {
      throw new Error("Slug must be lowercase alphanumeric with hyphens");
    }

    // Check slug uniqueness
    const existing = await ctx.db
      .query("organizations")
      .withIndex("by_slug", (q) => q.eq("slug", normalizedSlug))
      .first();
    if (existing) {
      throw new Error("Organization slug already taken");
    }

    const now = Date.now();
    const orgId = await ctx.db.insert("organizations", {
      name: name.trim(),
      slug: normalizedSlug,
      ownerId: user._id,
      settings: {
        allowSelfRegistration: false,
        defaultRole: "member",
        sessionTimeoutMinutes: 10080, // 7 days
      },
      plan: "free",
      createdAt: now,
      updatedAt: now,
    });

    // Create owner membership
    await ctx.db.insert("orgMemberships", {
      organizationId: orgId,
      userId: user._id,
      role: "owner",
      isActive: true,
      joinedAt: now,
    });

    return { _id: orgId, slug: normalizedSlug };
  },
});

// ─── List Orgs for User ─────────────────────────────────
export const listForUser = query({
  args: { token: v.optional(v.string()) },
  handler: async (ctx, { token }) => {
    if (!token) return [];
    const user = await requireAuth(ctx, token);

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const orgs = [];
    for (const m of memberships) {
      if (!m.isActive) continue;
      const org = await ctx.db.get(m.organizationId);
      if (org) {
        orgs.push({
          _id: org._id,
          name: org.name,
          slug: org.slug,
          plan: org.plan,
          role: m.role,
        });
      }
    }
    return orgs;
  },
});

// ─── Get Org Details ────────────────────────────────────
export const get = query({
  args: {
    token: v.string(),
    orgId: v.string(),
  },
  handler: async (ctx, { token, orgId }) => {
    const user = await requireAuth(ctx, token);
    const org = await ctx.db.get(orgId as any);
    if (!org) throw new Error("Organization not found");

    await requireOrgRole(ctx, orgId, user._id, "member");

    const membership = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_user", (q) =>
        q.eq("organizationId", orgId as any).eq("userId", user._id)
      )
      .first();

    return {
      _id: org._id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      settings: org.settings,
      callerRole: membership?.role,
      createdAt: org.createdAt,
    };
  },
});

// ─── Get Members ────────────────────────────────────────
export const getMembers = query({
  args: {
    token: v.string(),
    orgId: v.string(),
  },
  handler: async (ctx, { token, orgId }) => {
    const user = await requireAuth(ctx, token);
    await requireOrgRole(ctx, orgId, user._id, "member");

    const memberships = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org", (q) => q.eq("organizationId", orgId as any))
      .collect();

    const members = [];
    for (const m of memberships) {
      const u = await ctx.db.get(m.userId);
      if (u) {
        members.push({
          _id: m._id,
          userId: m.userId,
          email: u.email,
          name: u.name,
          role: m.role,
          isActive: m.isActive,
          joinedAt: m.joinedAt,
        });
      }
    }
    return members;
  },
});

// ─── Invite ─────────────────────────────────────────────
export const invite = mutation({
  args: {
    token: v.string(),
    orgId: v.string(),
    email: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, { token, orgId, email, role }) => {
    const user = await requireAuth(ctx, token);
    await requireOrgRole(ctx, orgId, user._id, "admin");

    const normalizedEmail = email.toLowerCase().trim();
    const assignedRole = role || "member";

    // Validate role (can't invite as owner)
    if (assignedRole === "owner") {
      throw new Error("Cannot invite as owner");
    }

    // Check for existing active membership
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", normalizedEmail))
      .first();
    if (existingUser) {
      const existingMembership = await ctx.db
        .query("orgMemberships")
        .withIndex("by_org_user", (q) =>
          q.eq("organizationId", orgId as any).eq("userId", existingUser._id)
        )
        .first();
      if (existingMembership?.isActive) {
        throw new Error("User is already a member");
      }
    }

    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    const now = Date.now();

    await ctx.db.insert("orgInvitations", {
      organizationId: orgId as any,
      email: normalizedEmail,
      role: assignedRole,
      invitedBy: user._id,
      tokenHash,
      expiresAt: now + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return { inviteToken: rawToken };
  },
});

// ─── Accept Invite ──────────────────────────────────────
export const acceptInvite = mutation({
  args: {
    token: v.string(),
    inviteToken: v.string(),
  },
  handler: async (ctx, { token, inviteToken }) => {
    const user = await requireAuth(ctx, token);

    const inviteHash = await hashToken(inviteToken);
    const invitation = await ctx.db
      .query("orgInvitations")
      .withIndex("by_token", (q) => q.eq("tokenHash", inviteHash))
      .first();

    if (!invitation) throw new Error("Invalid invitation");
    if (invitation.acceptedAt) throw new Error("Invitation already used");
    if (invitation.expiresAt < Date.now()) throw new Error("Invitation expired");
    if (invitation.email !== user.email) {
      throw new Error("Invitation was sent to a different email");
    }

    // Check for existing membership
    const existing = await ctx.db
      .query("orgMemberships")
      .withIndex("by_org_user", (q) =>
        q
          .eq("organizationId", invitation.organizationId)
          .eq("userId", user._id)
      )
      .first();

    if (existing) {
      // Reactivate if inactive
      if (!existing.isActive) {
        await ctx.db.patch(existing._id, {
          isActive: true,
          role: invitation.role,
        });
      }
    } else {
      await ctx.db.insert("orgMemberships", {
        organizationId: invitation.organizationId,
        userId: user._id,
        role: invitation.role,
        isActive: true,
        joinedAt: Date.now(),
      });
    }

    // Mark invitation as accepted
    await ctx.db.patch(invitation._id, { acceptedAt: Date.now() });

    return { success: true, orgId: invitation.organizationId };
  },
});

// ─── Update Role ────────────────────────────────────────
export const updateRole = mutation({
  args: {
    token: v.string(),
    orgId: v.string(),
    membershipId: v.string(),
    newRole: v.string(),
  },
  handler: async (ctx, { token, orgId, membershipId, newRole }) => {
    const user = await requireAuth(ctx, token);
    const callerMembership = await requireOrgRole(ctx, orgId, user._id, "admin");

    const callerLevel = ROLE_LEVELS[callerMembership.role] || 0;
    const targetLevel = ROLE_LEVELS[newRole] || 0;

    if (targetLevel > callerLevel) {
      throw new Error("Cannot promote above your own role");
    }

    const membership = await ctx.db.get(membershipId as any);
    if (!membership) throw new Error("Membership not found");

    const currentLevel = ROLE_LEVELS[membership.role] || 0;
    if (currentLevel >= callerLevel && callerMembership.role !== "owner") {
      throw new Error("Cannot modify a member with equal or higher role");
    }

    await ctx.db.patch(membership._id, { role: newRole });
    return { success: true };
  },
});

// ─── Remove Member ──────────────────────────────────────
export const removeMember = mutation({
  args: {
    token: v.string(),
    orgId: v.string(),
    membershipId: v.string(),
  },
  handler: async (ctx, { token, orgId, membershipId }) => {
    const user = await requireAuth(ctx, token);

    const membership = await ctx.db.get(membershipId as any);
    if (!membership) throw new Error("Membership not found");

    const isSelf = membership.userId === user._id;

    if (!isSelf) {
      await requireOrgRole(ctx, orgId, user._id, "admin");
    }

    // Can't remove last owner
    if (membership.role === "owner") {
      const owners = await ctx.db
        .query("orgMemberships")
        .withIndex("by_org", (q) => q.eq("organizationId", orgId as any))
        .filter((q) =>
          q.and(q.eq(q.field("role"), "owner"), q.eq(q.field("isActive"), true))
        )
        .collect();
      if (owners.length <= 1) {
        throw new Error("Cannot remove the last owner");
      }
    }

    await ctx.db.patch(membership._id, { isActive: false });
    return { success: true };
  },
});

// ─── Update Settings ────────────────────────────────────
export const updateSettings = mutation({
  args: {
    token: v.string(),
    orgId: v.string(),
    name: v.optional(v.string()),
    settings: v.optional(
      v.object({
        allowSelfRegistration: v.boolean(),
        defaultRole: v.string(),
        sessionTimeoutMinutes: v.number(),
      })
    ),
  },
  handler: async (ctx, { token, orgId, name, settings }) => {
    const user = await requireAuth(ctx, token);
    await requireOrgRole(ctx, orgId, user._id, "owner");

    const org = await ctx.db.get(orgId as any);
    if (!org) throw new Error("Organization not found");

    const updates: Record<string, any> = { updatedAt: Date.now() };
    if (name !== undefined) {
      if (!name.trim()) throw new Error("Name cannot be empty");
      updates.name = name.trim();
    }
    if (settings !== undefined) {
      updates.settings = settings;
    }

    await ctx.db.patch(org._id, updates);
    return { success: true };
  },
});
