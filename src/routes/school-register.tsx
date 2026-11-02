import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { clearAuthContext } from "@/lib/auth";
import { claimCoordinatorRole } from "@/lib/coordinator-actions";
import { Brand, OrgFooter } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/school-register")({
  head: () => ({
    meta: [
      { title: "School Registration — Social Innovation Ideathon" },
      {
        name: "description",
        content:
          "Teachers: register your school, add students in bulk or via CSV, and print student access passes.",
      },
      { property: "og:title", content: "School Registration — Social Innovation Ideathon" },
      {
        property: "og:description",
        content: "Register your school, bulk-register students, generate printable access passes and manage your roster.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchoolRegister,
});

function SchoolRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: "",
    designation: "",
    school_name: "",
    city: "",
    email: "",
    phone: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: form.full_name,
          designation: form.designation,
          school_name: form.school_name,
          city: form.city,
          phone: form.phone,
        },
      },
    });
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    if (data.session) {
      // The teacher who registers a school IS its coordinator — assign the
      // coordinator role immediately, no separate claim step or password
      // re-entry. One coordinator per school is enforced by the server fn.
      try {
        await claimCoordinatorRole();
      } catch (claimErr) {
        setBusy(false);
        setError(
          claimErr instanceof Error && claimErr.message
            ? claimErr.message
            : "Your account was created, but coordinator access could not be assigned. Please contact the organisers.",
        );
        return;
      }
      // Drop any cached auth context so the coordinator guard re-reads roles.
      clearAuthContext();
      await navigate({ to: "/coordinator" });
      return;
    }
    setBusy(false);
    setError(
      "Your account needs email confirmation before sign-in. Please check your inbox, then sign in from the home page.",
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-linen">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Brand />
          <a
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-clay underline underline-offset-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to sign in
          </a>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-8 px-5 pb-16 lg:grid-cols-2">
        <div>
          <p className="eyebrow">For schools</p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-tight text-forest">
            Register your school
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Register your school to take part in the Social Innovation Ideathon. One faculty
            coordinator signs up on behalf of the school and guides students from Grades 8–12
            through the competition.
          </p>
          <ol className="mt-8 space-y-4">
            {[
              { t: "Register your school", b: "Create the school's coordinator account with your official details." },
              { t: "Enrol your students", b: "Add participating students from your coordinator portal." },
              { t: "Follow their progress", b: "See teams, submissions and published results in one place." },
            ].map((f, i) => (
              <li key={f.t} className="flex gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-clay/12 text-sm font-semibold text-clay">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-foreground">{f.t}</p>
                  <p className="text-sm text-muted-foreground">{f.b}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-forest">Create school account</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            One coordinator per school. You'll be signed in right away to claim your school's roster
            portal.
          </p>
          <form onSubmit={submit} className="mt-4 space-y-3.5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Your name</Label>
                <Input required value={form.full_name} onChange={set("full_name")} placeholder="e.g. Sunita Nair" />
              </div>
              <div className="space-y-1.5">
                <Label>Designation</Label>
                <Input required value={form.designation} onChange={set("designation")} placeholder="e.g. ATL In-charge" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>School name</Label>
                <Input required value={form.school_name} onChange={set("school_name")} placeholder="e.g. Sunrise Public School" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input required value={form.city} onChange={set("city")} placeholder="e.g. Delhi" />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile number</Label>
                <Input required type="tel" value={form.phone} onChange={set("phone")} placeholder="+91 …" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>School email</Label>
                <Input type="email" required value={form.email} onChange={set("email")} placeholder="coordinator@school.in" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Password</Label>
                <Input type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="8+ characters" />
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
              {busy ? "Creating school account…" : "Create school account"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Already registered?{" "}
              <a href="/" className="font-medium text-clay underline underline-offset-2">
                Sign in
              </a>{" "}
              and open the roster portal.
            </p>
          </form>
        </div>
      </main>
      <OrgFooter />
    </div>
  );
}
