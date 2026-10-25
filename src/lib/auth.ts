import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "student" | "coordinator" | "judge" | "admin" | "mentor";

export const ROLE_LABEL: Record<AppRole, string> = {
  student: "Student",
  coordinator: "School Coordinator",
  judge: "Evaluator",
  admin: "Administrator",
  mentor: "Mentor",
};

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  grade: number | null;
  school_name: string | null;
  city: string | null;
  parent_email: string | null;
};

/**
 * Reads the user from the locally cached Supabase session (no network
 * roundtrip). The bearer token is still validated server-side on every
 * authenticated request, so this is safe for route guards.
 */
export async function getSessionUser(): Promise<User | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

async function fetchRolesFor(userId: string): Promise<AppRole[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return (data ?? []).map((r) => r.role as AppRole);
}

async function fetchProfileFor(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export type AuthContext = { user: User; roles: AppRole[]; profile: Profile | null };

// Short-lived in-memory cache so route guards and child pages within the same
// navigation share one roles+profile fetch instead of repeating the queries.
let authCache: { userId: string; at: number; value: AuthContext } | null = null;
const AUTH_CACHE_TTL = 60_000;

export async function getAuthContext(): Promise<AuthContext | null> {
  const user = await getSessionUser();
  if (!user) {
    authCache = null;
    return null;
  }
  if (
    authCache &&
    authCache.userId === user.id &&
    Date.now() - authCache.at < AUTH_CACHE_TTL
  ) {
    return authCache.value;
  }
  const [roles, profile] = await Promise.all([
    fetchRolesFor(user.id),
    fetchProfileFor(user.id),
  ]);
  const value: AuthContext = { user, roles, profile };
  authCache = { userId: user.id, at: Date.now(), value };
  return value;
}

export function clearAuthContext() {
  authCache = null;
}

export async function fetchMyRoles(): Promise<AppRole[]> {
  const ctx = await getAuthContext();
  return ctx?.roles ?? [];
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const ctx = await getAuthContext();
  return ctx?.profile ?? null;
}

export function homeFor(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("judge")) return "/judge";
  if (roles.includes("coordinator")) return "/coordinator";
  return "/dashboard";
}

export const DEMO_PASSWORD = "Ideathon2026!";

export const DEMO_ACCOUNTS: {
  label: string;
  email: string;
  blurb: string;
  home: string;
}[] = [
  { label: "Administrator", email: "admin@demo.in", blurb: "Full operations hub", home: "/admin" },
  { label: "Evaluator", email: "judge@demo.in", blurb: "Blind scoring queue", home: "/judge" },
  { label: "Coordinator", email: "coordinator@demo.in", blurb: "Sunrise Public School", home: "/coordinator" },
  { label: "Team captain", email: "arjun@demo.in", blurb: "Verdant Minds · AgriTech", home: "/dashboard" },
  { label: "Teamless student", email: "zoya@demo.in", blurb: "Test joining a team", home: "/dashboard" },
];

export async function signOutEverywhere() {
  clearAuthContext();
  await supabase.auth.signOut();
}
