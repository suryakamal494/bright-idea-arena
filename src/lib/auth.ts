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

export async function getSessionUser() {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function fetchMyRoles(): Promise<AppRole[]> {
  const user = await getSessionUser();
  if (!user) return [];
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  return (data ?? []).map((r) => r.role as AppRole);
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return (data as Profile) ?? null;
}

export function homeFor(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/admin";
  if (roles.includes("judge")) return "/judge";
  if (roles.includes("coordinator")) return "/coordinator";
  return "/dashboard";
}

export const DEMO_PASSWORD = "Ideathon2026!";

export const DEMO_ACCOUNTS: { label: string; email: string; blurb: string }[] = [
  { label: "Administrator", email: "admin@demo.in", blurb: "Full operations hub" },
  { label: "Evaluator", email: "judge@demo.in", blurb: "Blind scoring queue" },
  { label: "Coordinator", email: "coordinator@demo.in", blurb: "Sunrise Public School" },
  { label: "Team captain", email: "arjun@demo.in", blurb: "Verdant Minds · AgriTech" },
  { label: "Teamless student", email: "zoya@demo.in", blurb: "Test joining a team" },
];

export async function signOutEverywhere() {
  await supabase.auth.signOut();
}
