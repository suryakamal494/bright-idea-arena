import { createServerFn } from "@tanstack/react-start";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ClientSession = {
  access_token: string;
  refresh_token: string;
  expires_in?: number | undefined;
  expires_at?: number | undefined;
  token_type?: string | undefined;
};

/**
 * Student username sign-in resolves the Auth email server-side and lets the
 * Auth service verify the password; the resolved address never reaches the
 * browser. Official email sign-in stays on the browser client.
 */
export const loginWithIdentifier = createServerFn({ method: "POST" })
  .validator((input: { identifier: string; password: string }) => input)
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim();
    if (!identifier || !data.password) {
      throw new Error("Enter your email or username and your password.");
    }
    if (EMAIL_RE.test(identifier)) {
      return { kind: "email" as const, email: identifier };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: identities, error: identityError } = await supabaseAdmin.rpc("get_student_login_identity", {
      p_username: identifier.toLowerCase(),
    });
    if (identityError) throw new Error("Sign-in is temporarily unavailable. Please try again.");
    const loginEmail = identities?.[0]?.auth_email;
    if (!loginEmail) throw new Error("Incorrect email/username or password.");

    const url = process.env["SUPABASE_URL"]!;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: key, "content-type": "application/json" },
      body: JSON.stringify({ email: loginEmail, password: data.password }),
    });
    if (!res.ok) throw new Error("Incorrect email/username or password.");
    const session = (await res.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
      expires_at?: number;
      token_type?: string;
    };
    const out: ClientSession = {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_in: session.expires_in,
      expires_at: session.expires_at,
      token_type: session.token_type,
    };
    return { kind: "session" as const, session: out };
  });

/**
 * Username recovery resolves server-side without disclosing whether a
 * username exists. Internal-address accounts need a coordinator reset;
 * deliverable email accounts receive the normal Auth recovery message.
 */
export const sendResetWithIdentifier = createServerFn({ method: "POST" })
  .validator((input: { identifier: string; origin: string }) => input)
  .handler(async ({ data }) => {
    const identifier = data.identifier.trim();
    if (EMAIL_RE.test(identifier)) {
      if (identifier.toLowerCase().endsWith("@demo.in")) {
        return { kind: "demo" as const };
      }
      return { kind: "email" as const, email: identifier };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: identities, error: identityError } = await supabaseAdmin.rpc("get_student_login_identity", {
      p_username: identifier.toLowerCase(),
    });
    if (identityError) throw new Error("Password reset is temporarily unavailable. Please try again.");
    const loginEmail = identities?.[0]?.auth_email;
    if (loginEmail?.toLowerCase().endsWith("@demo.in")) return { kind: "demo" as const };
    if (loginEmail && !loginEmail.toLowerCase().endsWith("@student.ideathon.local")) {
      const url = process.env["SUPABASE_URL"]!;
      const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
      const redirect = `${data.origin.replace(/\/+$/, "")}/reset-password`;
      await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`, {
        method: "POST",
        headers: { apikey: key, "content-type": "application/json" },
        body: JSON.stringify({ email: loginEmail }),
      });
    }
    return { kind: "sent" as const };
  });
