import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, FlaskConical, Lightbulb, Loader2, Lock, LogIn, User } from "lucide-react";
import studentsArt from "@/assets/login-students.jpg";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/** Temporary demo-login button. Set to false before launch to hide it entirely. */
const SHOW_DEMO_LOGINS = true;
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Brand, OrgFooter } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, USERNAME_RE, clearAuthContext, getAuthContext, homeFor, normalizeUsername, studentAuthEmail } from "@/lib/auth";
import { loginWithIdentifier, sendResetWithIdentifier } from "@/lib/auth-identifier.functions";

/**
 * Wipes every cached read (the previous user's teams, roster, roles) before
 * navigating, so switching accounts never renders stale data from the last
 * session. Route guards re-derive roles from the fresh session.
 */
async function resetAndNavigate(
  queryClient: ReturnType<typeof useQueryClient>,
  navigate: ReturnType<typeof useNavigate>,
  to?: string,
) {
  await queryClient.cancelQueries();
  queryClient.clear();
  clearAuthContext();
  if (to) {
    await navigate({ to });
    return;
  }
  const ctx = await getAuthContext();
  await navigate({ to: homeFor(ctx?.roles ?? []) });
}

export function AuthPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);

  async function demoSignIn(email: string) {
    setLoadingDemo(email);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: DEMO_PASSWORD,
    });
    if (error) {
      setLoadingDemo(null);
      toast.error(error.message);
      return;
    }
    try {
      // Demo accounts have known destinations — skip role discovery.
      const account = DEMO_ACCOUNTS.find((a) => a.email === email);
      await resetAndNavigate(queryClient, navigate, account?.home ?? "/dashboard");
    } finally {
      setLoadingDemo(null);
    }
  }

  async function googleSignIn() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    if (result.redirected) return; // full-page OAuth in progress
    await resetAndNavigate(queryClient, navigate);
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-linen">
      <div aria-hidden className="pointer-events-none absolute -right-40 top-1/3 h-[32rem] w-[32rem] rounded-full bg-clay/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -left-40 bottom-0 h-[28rem] w-[28rem] rounded-full bg-clay/10 blur-3xl" />
      <header className="relative z-10 mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-5 py-5">
        <Brand />
        {/* TEMPORARY: remove before launch by setting SHOW_DEMO_LOGINS = false. */}
        {SHOW_DEMO_LOGINS && (
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-full border-clay/60 bg-card text-clay hover:bg-clay/5">
                <FlaskConical className="mr-1.5 h-4 w-4" /> Demo logins
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle className="text-forest">Demo logins</DialogTitle>
                <DialogDescription>
                  Temporary preview accounts. Password{" "}
                  <span className="font-mono text-forest">{DEMO_PASSWORD}</span>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.email}
                    onClick={() => demoSignIn(a.email)}
                    disabled={loadingDemo !== null}
                    className="flex w-full items-center justify-between rounded-lg border border-border px-3.5 py-2.5 text-left transition-colors hover:border-clay/50 hover:bg-clay/5 disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-semibold text-foreground">{a.label}</p>
                      <p className="text-xs text-muted-foreground">{a.blurb}</p>
                    </div>
                    {loadingDemo === a.email ? (
                      <Loader2 className="h-4 w-4 animate-spin text-clay" />
                    ) : (
                      <LogIn className="h-4 w-4 text-clay" />
                    )}
                  </button>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        )}
      </header>
      <main className="relative z-10 mx-auto grid w-full max-w-7xl flex-1 gap-8 px-4 pb-12 pt-2 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-12 lg:pb-16">
        <section className="order-2 min-w-0 lg:order-1">
          <h2 className="hidden font-display text-5xl font-bold leading-[1.05] text-forest lg:block xl:text-6xl">
            Social Innovation Ideathon
          </h2>
          <span className="mt-5 hidden h-1 w-20 rounded-full bg-clay lg:block" />
          <p className="mt-5 max-w-md text-center text-base text-muted-foreground lg:text-left lg:text-lg">
            A platform for students to identify real problems, create solutions, and showcase their ideas for a better society.
          </p>
          <img src={studentsArt} alt="Students looking ahead with optimism" width={1024} height={1024} loading="lazy" className="mx-auto mt-6 w-full max-w-sm mix-blend-multiply [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_75%)] lg:mx-0 lg:max-w-lg" />
        </section>
        <div className="order-1 mx-auto w-full max-w-lg lg:order-2">
        <div className="relative mt-8 rounded-3xl border border-border/60 bg-card px-5 pb-6 pt-12 shadow-[0_24px_60px_-24px_color-mix(in_oklab,var(--clay)_35%,transparent)] sm:px-10 sm:pb-8">
          <div className="absolute -top-8 left-1/2 grid h-16 w-16 -translate-x-1/2 place-items-center rounded-full bg-clay/15 ring-8 ring-card">
            <Lightbulb className="h-8 w-8 text-clay" />
          </div>
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold text-forest sm:text-3xl">Welcome to the Portal</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Sign in to continue, or create a student account.</p>
          </div>
          <Tabs defaultValue="signin">
            <TabsList className="h-11 w-full rounded-full p-1">
              <TabsTrigger value="signin" className="flex-1 rounded-full data-[state=active]:bg-clay data-[state=active]:text-primary-foreground">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1 rounded-full">
                Student sign up
              </TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <SignInForm onDone={() => resetAndNavigate(queryClient, navigate)} />
            </TabsContent>
            <TabsContent value="signup">
              <StudentSignUpForm onSignedUp={() => resetAndNavigate(queryClient, navigate, "/dashboard")} />
            </TabsContent>
          </Tabs>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or continue with{" "}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="h-11 w-full rounded-xl" onClick={googleSignIn}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
              />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52Z"
              />
            </svg>
            Continue with Google
          </Button>
        </div>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          Registering a school?{" "}
          <a href="/school-register" className="font-medium text-clay underline underline-offset-2">
            School registration
          </a>
        </p>
        </div>
      </main>
      <OrgFooter />
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => Promise<void> }) {
  const [identifier, setIdentifier] = useState("");
  const [loginType, setLoginType] = useState<"student" | "official">("student");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = identifier.trim();
    if (loginType === "student" && id.includes("@")) {
      setError("Enter your student username, not an email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (id.includes("@")) {
        const { error: err } = await supabase.auth.signInWithPassword({ email: id, password });
        if (err) {
          setError(/invalid login/i.test(err.message) ? "Incorrect email/username or password." : err.message);
          return;
        }
      } else {
        // Username sign-in: the server resolves the account and verifies the
        // password with the auth service, then hands back the session.
        const res = await loginWithIdentifier({ data: { identifier: id, password } });
        if (res.kind !== "session") {
          setError("Incorrect email/username or password.");
          return;
        }
        const { error: sessErr } = await supabase.auth.setSession({
          access_token: res.session.access_token,
          refresh_token: res.session.refresh_token,
        });
        if (sessErr) {
          setError(sessErr.message);
          return;
        }
      }
      await onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect email/username or password.");
    } finally {
      setBusy(false);
    }
  }

  if (forgot) return <ForgotPasswordForm initialIdentifier={identifier} loginType={loginType} onBack={() => setForgot(false)} />;

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <Tabs value={loginType} onValueChange={(value) => setLoginType(value as "student" | "official")}>
        <TabsList className="h-11 w-full rounded-full p-1">
          <TabsTrigger value="student" className="flex-1 rounded-full data-[state=active]:bg-clay/15 data-[state=active]:text-forest">Student</TabsTrigger>
          <TabsTrigger value="official" className="flex-1 rounded-full data-[state=active]:bg-clay/15 data-[state=active]:text-forest">School</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="space-y-1.5">
        <Label>{loginType === "student" ? "Student username" : "Registered email"}</Label>
        <div className="relative"><User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 rounded-xl pl-10" type={loginType === "official" ? "email" : "text"} autoComplete={loginType === "official" ? "email" : "username"} required value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={loginType === "official" ? "name@school.org" : "Your username"} /></div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label>Password</Label>
          <button type="button" onClick={() => setForgot(true)} className="text-xs font-medium text-clay hover:underline">
            Forgot password?
          </button>
        </div>
        <div className="relative"><Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-11 rounded-xl pl-10" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="h-11 w-full rounded-xl bg-clay text-base hover:bg-clay/90" disabled={busy}>
        {busy ? "Signing in…" : <>Sign in <ArrowRight className="ml-1.5 h-4 w-4" /></>}
      </Button>
    </form>
  );
}

function ForgotPasswordForm({ initialIdentifier, loginType, onBack }: { initialIdentifier: string; loginType: "student" | "official"; onBack: () => void }) {
  const [identifier, setIdentifier] = useState(initialIdentifier);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const clean = identifier.trim();
  const looksEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean);
  const demoEmail = loginType === "official" && looksEmail && clean.toLowerCase().endsWith("@demo.in");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loginType === "student" && looksEmail) {
      setError("Enter your student username, not an email address.");
      return;
    }
    if (demoEmail) {
      setIsDemo(true);
      return;
    }
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      if (loginType === "official") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(clean.toLowerCase(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (err && /rate|security purposes|429/i.test(err.message)) {
          setError("Too many requests. Please wait a minute before trying again.");
          setCooldown(60);
          return;
        }
        setSent(true);
        setIsDemo(false);
      } else {
        // Username: the server resolves the account and sends the reset mail.
        const res = await sendResetWithIdentifier({
          data: { identifier: clean, origin: window.location.origin },
        });
        if (res.kind === "demo") {
          setIsDemo(true);
        } else {
          setSent(true);
          setIsDemo(false);
        }
      }
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div>
        <h3 className="font-semibold text-forest">Reset your password</h3>
        <p className="text-sm text-muted-foreground">{loginType === "student" ? "Enter your student username." : "Enter the email registered to your school or evaluator account."}</p>
      </div>
      <div className="space-y-1.5">
        <Label>{loginType === "student" ? "Student username" : "Registered email"}</Label>
        <Input type={loginType === "official" ? "email" : "text"} autoComplete={loginType === "official" ? "email" : "username"} required value={identifier} onChange={(e) => { setIdentifier(e.target.value); setSent(false); setIsDemo(false); }} placeholder={loginType === "official" ? "name@school.org" : "Your username"} />
      </div>
      {(isDemo || demoEmail) && (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm">
          Demo accounts can't be reset. Their password is <span className="font-mono">{DEMO_PASSWORD}</span>.
        </p>
      )}
      {loginType === "student" && !isDemo && !sent && (
        <p className="rounded-lg border border-ochre/30 bg-ochre/10 p-3 text-sm" role="status">
          Email recovery is not available for username-only individual accounts yet. Ask your school coordinator or the organisers to reset the password.
        </p>
      )}
      {sent && !isDemo && !demoEmail && (
        <p className="rounded-lg border border-border bg-muted p-3 text-sm" role="status">
          {loginType === "student"
            ? "If your account has an email-based recovery address, a reset link is on its way. Individual username-only accounts do not yet support email recovery; contact your school coordinator or the organisers for a password reset."
            : "If an account exists for this email, a reset link is on its way. Check your inbox and spam folder. The link works once and expires in 1 hour."}
        </p>
      )}
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy || demoEmail || cooldown > 0}>
        {busy ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : sent ? "Resend link" : "Send reset link"}
      </Button>
      <button type="button" onClick={onBack} className="block w-full text-center text-sm text-muted-foreground hover:text-foreground">
        ← Back to sign in
      </button>
    </form>
  );
}

function StudentSignUpForm({ onSignedUp }: { onSignedUp: () => Promise<void> }) {
  const [form, setForm] = useState({
    full_name: "",
    grade: "",
    school_name: "",
    city: "",
    phone: "",
    parent_email: "",
    username: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.grade) {
      setError("Select your class grade (8–12).");
      return;
    }
    const username = normalizeUsername(form.username);
    if (!USERNAME_RE.test(username)) {
      setError("Username must be 3–30 characters: letters, numbers, dots, underscores, or hyphens.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.parent_email.trim())) {
      setError("Enter a valid parent or guardian email address.");
      return;
    }
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: studentAuthEmail(username),
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: form.full_name,
          grade: form.grade,
          school_name: form.school_name,
          city: form.city,
          phone: form.phone,
          parent_email: form.parent_email,
          username,
        },
      },
    });
    if (err) {
      setBusy(false);
      setError(/already registered|already exists|database error saving new user|duplicate key|profiles_username_lower_key/i.test(err.message)
        ? "That username may already be taken. Please choose another."
        : err.message);
      return;
    }
    if (data.session) {
      // Auto-confirmed: the student is signed in right away.
      try {
        await onSignedUp();
      } finally {
        setBusy(false);
      }
      return;
    }
    setBusy(false);
    setNeedsConfirm(true);
  }

  if (needsConfirm) {
    return (
      <div className="mt-4 rounded-lg border border-sage/30 bg-sage/10 p-4 text-sm text-secondary-foreground">
        <p className="font-semibold">Account created</p>
        <p className="mt-1">
          This username may already be registered or need organiser activation. Contact the organisers before trying to register again.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3.5">
      <div className="grid gap-3.5 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Full name</Label>
          <Input required value={form.full_name} onChange={set("full_name")} placeholder="Your name" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Student username</Label>
          <Input required minLength={3} maxLength={30} autoComplete="username" value={form.username} onChange={set("username")} placeholder="e.g. arjun_sharma09" />
        </div>
        <div className="space-y-1.5">
          <Label>Class grade</Label>
          <Select value={form.grade} onValueChange={(v) => setForm((f) => ({ ...f, grade: v }))}>
            <SelectTrigger>
              <SelectValue placeholder="Grade 8–12" />
            </SelectTrigger>
            <SelectContent>
              {[8, 9, 10, 11, 12].map((g) => (
                <SelectItem key={g} value={String(g)}>
                  Grade {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Phone</Label>
          <Input value={form.phone} onChange={set("phone")} placeholder="+91 …" />
        </div>
        <div className="space-y-1.5">
          <Label>School name</Label>
          <Input required value={form.school_name} onChange={set("school_name")} placeholder="e.g. Sunrise Public School" />
        </div>
        <div className="space-y-1.5">
          <Label>City</Label>
          <Input required value={form.city} onChange={set("city")} placeholder="e.g. Delhi" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Parent or guardian email</Label>
          <Input type="email" required value={form.parent_email} onChange={set("parent_email")} placeholder="parent@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="8+ characters" />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
        {busy ? "Creating your workspace…" : "Create student account"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Use your username to sign in. The parent or guardian email is a contact address; email verification and notifications are not configured yet.
      </p>
    </form>
  );
}
