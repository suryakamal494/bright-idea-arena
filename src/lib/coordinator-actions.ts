import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StudentSeed = {
  full_name: string;
  username: string;
  password: string;
  grade: number;
  email: string;
  mobile?: string;
};

export type CreatedPass = {
  full_name: string;
  username: string;
  email: string;
  password: string;
  grade: number;
  school_name: string;
  mobile?: string | undefined;
  error?: string | undefined;
};

const COORDINATOR = "coordinator";
const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export type BulkAvailability = {
  usernames: string[];
  emails: string[];
};

/**
 * Inline uniqueness pre-check for the bulk entry table: returns the usernames
 * and emails that already exist on the platform, so the school sees the
 * collision on the field itself before submitting.
 */
export const checkBulkAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { students: Pick<StudentSeed, "username" | "email">[] }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isCoord } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: COORDINATOR,
    });
    if (!isCoord) throw new Error("Only school coordinators can check availability.");

    const usernames = [
      ...new Set(data.students.map((s) => s.username.trim().toLowerCase()).filter(Boolean)),
    ];
    const emails = [
      ...new Set(data.students.map((s) => s.email.trim().toLowerCase()).filter(Boolean)),
    ];
    if (!usernames.length && !emails.length) return { usernames: [], emails: [] };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [uRes, eRes] = await Promise.all([
      usernames.length
        ? supabaseAdmin.from("profiles").select("username").in("username", usernames)
        : Promise.resolve({ data: [] as { username: string }[] }),
      emails.length
        ? supabaseAdmin.from("profiles").select("email").in("email", emails)
        : Promise.resolve({ data: [] as { email: string }[] }),
    ]);
    return {
      usernames: ((uRes.data ?? []) as { username: string }[]).map((r) => r.username),
      emails: ((eRes.data ?? []) as { email: string }[]).map((r) => r.email),
    } satisfies BulkAvailability;
  });

export const createStudentAccounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { students: StudentSeed[] }) => input)
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

    // Global uniqueness: every username and email must be new on the platform.
    const usernames = data.students.map((s) => s.username.trim().toLowerCase());
    const emails = data.students.map((s) => s.email.trim().toLowerCase());
    const [existingUsers, existingEmails] = await Promise.all([
      supabaseAdmin.from("profiles").select("username").in("username", usernames),
      supabaseAdmin.from("profiles").select("email").in("email", emails),
    ]);
    const takenUsers = new Set(((existingUsers.data ?? []) as { username: string }[]).map((r) => r.username));
    const takenEmails = new Set(((existingEmails.data ?? []) as { email: string }[]).map((r) => r.email));

    for (const [index, student] of data.students.entries()) {
      const username = student.username.trim().toLowerCase();
      const email = student.email.trim().toLowerCase();
      const rowError =
        !student.full_name.trim()
          ? "Name is required"
          : !USERNAME_RE.test(username)
            ? "Username must be 3–30 characters (letters, numbers, . _ -)"
            : takenUsers.has(username)
              ? "Username already used on the platform"
              : !EMAIL_RE.test(email)
                ? "Enter a valid email"
                : takenEmails.has(email)
                  ? "Email already used on the platform"
                  : !student.password || student.password.length < 8
                    ? "Password must be at least 8 characters"
                    : null;
      if (rowError) {
        results.push({
          full_name: student.full_name,
          username,
          email: student.email,
          password: "",
          grade: student.grade,
          school_name: school,
          mobile: student.mobile,
          error: rowError,
        });
        continue;
      }
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: student.password,
        email_confirm: true, // school-registered students get immediate access
        user_metadata: {
          full_name: student.full_name.trim(),
          username,
          school_name: school,
          city: profile?.city ?? null,
          grade: student.grade,
          phone: student.mobile ?? null,
        },
      });
      if (error || !created?.user) {
        results.push({
          full_name: student.full_name,
          username,
          email,
          password: "",
          grade: student.grade,
          school_name: school,
          mobile: student.mobile,
          error: error?.message ?? "Account creation failed",
        });
        continue;
      }
      takenUsers.add(username);
      takenEmails.add(email);
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
        full_name: student.full_name.trim(),
        username,
        email,
        password: student.password,
        grade: student.grade,
        school_name: school,
        mobile: student.mobile,
      });
      void index;
    }
    return results;
  });

/**
 * C06: let the coordinator set a new password for one of their students.
 * The old password stops working immediately; the coordinator prints a fresh
 * access pass. Restricted to students of the coordinator's own school.
 */
export const resetStudentPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { studentId: string; password: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isCoord } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: COORDINATOR,
    });
    if (!isCoord) throw new Error("Only school coordinators can reset student passwords.");
    if (!data.password || data.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }

    const { data: coordProfile } = await supabase
      .from("profiles")
      .select("school_name")
      .eq("id", userId)
      .maybeSingle();
    const school = coordProfile?.school_name;
    if (!school) throw new Error("Your coordinator profile has no school set.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: student } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, username, email, grade, school_name")
      .eq("id", data.studentId)
      .maybeSingle();
    const row = student as
      | { id: string; full_name: string; username: string | null; email: string; grade: number | null; school_name: string | null }
      | null;
    if (!row || row.school_name !== school) {
      throw new Error("Student not found in your school.");
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(row.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return {
      full_name: row.full_name,
      username: row.username ?? row.email,
      email: row.email,
      grade: row.grade,
      password: data.password,
    };
  });
