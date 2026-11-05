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
 * Sign-in accepts an email or a username. Emails are verified client-side by
 * the normal Supabase client. For a username, the email is resolved
 * server-side and the password is verified by the auth service itself — the
 * password check is never bypassed and the resolved email never reaches the
 * browser.
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
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("auth_login_email,email")
      .eq("username", identifier.toLowerCase())
      .maybeSingle();
    const loginEmail = profile?.auth_login_email ?? profile?.email;
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
 * Password reset accepts an email or a username. For a username the reset
 * email is sent server-side to the resolved address — the response is the
 * same whether or not the account exists, so usernames can't be probed.
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
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("auth_login_email,email")
      .eq("username", identifier.toLowerCase())
      .maybeSingle();
    const loginEmail = profile?.auth_login_email ?? profile?.email;
    if (loginEmail) {
      if (loginEmail.toLowerCase().endsWith("@demo.in")) {
        return { kind: "demo" as const };
      }
      if (loginEmail.toLowerCase().endsWith("@student.ideathon.local")) {
        return { kind: "sent" as const };
      } else {
        const url = process.env["SUPABASE_URL"]!;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const redirect = `${data.origin.replace(/\/+$/, "")}/reset-password`;
        await fetch(`${url}/auth/v1/recover?redirect_to=${encodeURIComponent(redirect)}`, {
          method: "POST",
          headers: { apikey: key, "content-type": "application/json" },
          body: JSON.stringify({ email: loginEmail }),
        });
      }
    }
    return { kind: "sent" as const };
  });
