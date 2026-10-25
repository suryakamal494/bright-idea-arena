import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogIn } from "lucide-react";
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
import { DEMO_ACCOUNTS, DEMO_PASSWORD, clearAuthContext, getAuthContext, homeFor } from "@/lib/auth";

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
    <div className="flex min-h-screen flex-col bg-linen">
      <header className="mx-auto w-full max-w-6xl px-5 py-5">
        <Brand />
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-8 px-5 pb-16 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h1 className="font-display text-2xl font-semibold text-forest">Welcome</h1>
          <Tabs defaultValue="signin" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="signin" className="flex-1">
                Sign in
              </TabsTrigger>
              <TabsTrigger value="signup" className="flex-1">
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
          <Button variant="outline" className="w-full" onClick={googleSignIn}>
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
          <p className="mt-4 text-sm text-muted-foreground">
            Registering a school?{" "}
            <a href="/school-register" className="font-medium text-clay underline underline-offset-2">
              School registration
            </a>
          </p>
        </div>

        {/* Demo quick logins */}
        <aside className="rounded-2xl border border-dashed border-clay/40 bg-card p-5">
          <h2 className="font-display text-lg font-semibold text-forest">Explore with a demo role</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Seeded preview accounts, password{" "}
            <span className="font-mono text-[11px] text-forest">{DEMO_PASSWORD}</span>. One click to switch roles.
          </p>
          <div className="mt-4 space-y-2">
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
        </aside>
      </main>
      <OrgFooter />
    </div>
  );
}

function SignInForm({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    try {
      await onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.in" />
      </div>
      <div className="space-y-1.5">
        <Label>Password</Label>
        <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
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
    email: "",
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
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
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
        },
      },
    });
    if (err) {
      setBusy(false);
      setError(err.message);
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
        <p className="font-semibold">Check your email</p>
        <p className="mt-1">
          We sent a confirmation link to {form.email}. Click it to activate your account, then sign
          in here.
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
          <Label>Parent email</Label>
          <Input type="email" required value={form.parent_email} onChange={set("parent_email")} placeholder="parent@example.com" />
        </div>
        <div className="space-y-1.5">
          <Label>Email</Label>
          <Input type="email" required value={form.email} onChange={set("email")} placeholder="you@school.in" />
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
        You'll be signed in right away — no email confirmation needed. We'll notify your parent or
        guardian by email with participation details.
      </p>
    </form>
  );
}
