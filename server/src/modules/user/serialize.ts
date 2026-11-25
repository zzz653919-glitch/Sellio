import type { AuthUser } from "../../middleware/auth.js";

export function publicUser(u: AuthUser) {
  return {
    id: u.id,
    email: u.email,
    firstName: u.first_name,
    lastName: u.last_name,
    avatarUrl: u.avatar_key ? `/api/user/avatar?v=${encodeURIComponent(u.avatar_key)}` : null,
    emailVerified: Boolean(u.email_verified_at),
    plan: u.plan,
    createdAt: u.created_at,
  };
}
