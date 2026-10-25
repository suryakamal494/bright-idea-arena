import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StudentSeed = {
  full_name: string;
  email: string;
  grade: number;
  parent_email?: string;
  phone?: string;
};

export type CreatedPass = {
  full_name: string;
  email: string;
  password: string;
  grade: number;
  school_name: string;
  error?: string;
};

const COORDINATOR = "coordinator";

export const claimCoordinatorRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_name, full_name")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.school_name) {
      throw new Error("Set your school name in your profile before claiming the coordinator role.");
    }
    const school = profile.school_name;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // First coordinator per school wins; later claims are rejected.
    const { data: existingCoords } = await supabaseAdmin
      .from("user_roles")
      .select("user_id, profile:profiles!user_roles_user_id_fkey(school_name)")
      .eq("role", COORDINATOR);
    const taken = (existingCoords ?? []).some(
      (c) =>
        (c as unknown as { profile?: { school_name?: string } | null }).profile?.school_name === school,
    );
    if (taken) {
      throw new Error(`A coordinator for "${school}" has already been registered.`);
    }

    // Replace the caller's roles with the coordinator role.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: COORDINATOR });
    if (error) throw new Error(error.message);
    return { school };
  });

function generatePassword(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export const createStudentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { students: StudentSeed[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isCoord } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: COORDINATOR,
    });
    if (!isCoord) throw new Error("Only school coordinators can create student accounts.");

    const { data: profile } = await supabase
      .from("profiles")
      .select("school_name, city")
      .eq("id", userId)
      .maybeSingle();
    const school = profile?.school_name;
    if (!school) throw new Error("Your coordinator profile has no school set.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const results: CreatedPass[] = [];

    for (const student of data.students) {
      const password = generatePassword();
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: student.email.trim().toLowerCase(),
        password,
        email_confirm: true, // school-registered students get immediate access
        user_metadata: {
          full_name: student.full_name,
          school_name: school,
          city: profile?.city ?? null,
          grade: student.grade,
          parent_email: student.parent_email ?? null,
          phone: student.phone ?? null,
        },
      });
      if (error || !created?.user) {
        results.push({
          full_name: student.full_name,
          email: student.email,
          password: "",
          grade: student.grade,
          school_name: school,
          error: error?.message ?? "Account creation failed",
        });
        continue;
      }
      // Ensure the student role exists (signup trigger usually adds it).
      const { data: hasRole } = await supabaseAdmin.rpc("has_role", {
        _user_id: created.user.id,
        _role: "student",
      });
      if (!hasRole) {
        await supabaseAdmin
          .from("user_roles")
          .insert({ user_id: created.user.id, role: "student" });
      }
      results.push({
        full_name: student.full_name,
        email: student.email.trim().toLowerCase(),
        password,
        grade: student.grade,
        school_name: school,
      });
    }
    return results;
  });

export type RosterEntry = {
  id: string;
  full_name: string;
  email: string;
  grade: number | null;
  parent_email: string | null;
};

export const fetchSchoolRoster = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isCoord } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: COORDINATOR,
    });
    if (!isCoord) throw new Error("Only school coordinators can view the roster.");
    const { data: profile } = await supabase
      .from("profiles")
      .select("school_name")
      .eq("id", userId)
      .maybeSingle();
    if (!profile?.school_name) return [];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email, grade, parent_email, school_name")
      .eq("school_name", profile.school_name)
      .order("full_name");
    return ((data ?? []) as (RosterEntry & { school_name: string })[]).filter(
      (r) => r.id !== userId,
    ) as RosterEntry[];
  });
