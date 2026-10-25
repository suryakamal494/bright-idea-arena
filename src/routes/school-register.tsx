import { useState } from "react";
import { FileSpreadsheet, Printer, Table2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/school-register")({
  head: () => ({
    meta: [
      { title: "School Coordinator Registration — Social Innovation Ideathon" },
      {
        name: "description",
        content:
          "Teachers: register your school group, add students in bulk or via CSV, and print student access passes.",
      },
      { property: "og:title", content: "School Coordinator Registration" },
      {
        property: "og:description",
        content: "Bulk-register students, generate printable access passes and manage your school roster.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SchoolRegister,
});

function SchoolRegister() {
  const [form, setForm] = useState({
    full_name: "",
    school_name: "",
    city: "",
    email: "",
    password: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          full_name: form.full_name,
          school_name: form.school_name,
          city: form.city,
        },
      },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen flex-col bg-linen">
      <header className="mx-auto w-full max-w-5xl px-5 py-5">
        <Brand />
      </header>
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-start gap-8 px-5 pb-16 lg:grid-cols-2">
        <div>
          <p className="eyebrow">For teachers & coordinators</p>
          <h1 className="font-display mt-3 text-4xl font-semibold leading-tight text-forest">
            Bring your school's brightest to the ideathon.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Register your school group, add students with quick tabular entry or a CSV upload, and
            hand out printed access passes — each student gets their own login, no email round-trips
            needed.
          </p>
          <div className="mt-8 space-y-4">
            {[
              {
                icon: Table2,
                t: "Quick tabular entry",
                b: "Type students straight into a row grid — name, grade, contact — and create accounts in one go.",
              },
              {
                icon: FileSpreadsheet,
                t: "CSV upload",
                b: "Upload a spreadsheet with name, grade, email and parent contact columns.",
              },
              {
                icon: Printer,
                t: "Printable access passes",
                b: "Download print-ready passes with each student's temporary password for the computer lab.",
              },
            ].map((f) => (
              <div key={f.t} className="flex gap-3.5">
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-clay/12 text-clay">
                  <f.icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="font-semibold text-foreground">{f.t}</p>
                  <p className="text-sm text-muted-foreground">{f.b}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-forest">Coordinator registration</h2>
          {sent ? (
            <div className="mt-4 rounded-lg border border-sage/30 bg-sage/10 p-4 text-sm text-secondary-foreground">
              <p className="font-semibold">Check your email</p>
              <p className="mt-1">
                Confirm {form.email} to activate the account. Then sign in and open{" "}
                <span className="font-medium">My roster</span> from the navigation to claim your
                coordinator role and start adding students.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-4 space-y-3.5">
              <div className="space-y-1.5">
                <Label>Your name</Label>
                <Input required value={form.full_name} onChange={set("full_name")} placeholder="e.g. Sunita Nair" />
              </div>
              <div className="space-y-1.5">
                <Label>School name</Label>
                <Input required value={form.school_name} onChange={set("school_name")} placeholder="e.g. Sunrise Public School" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input required value={form.city} onChange={set("city")} placeholder="e.g. Delhi" />
              </div>
              <div className="space-y-1.5">
                <Label>School email</Label>
                <Input type="email" required value={form.email} onChange={set("email")} placeholder="coordinator@school.in" />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" required minLength={8} value={form.password} onChange={set("password")} placeholder="8+ characters" />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
                {busy ? "Creating account…" : "Create coordinator account"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Already registered?{" "}
                <a href="/auth" className="font-medium text-clay underline underline-offset-2">
                  Sign in
                </a>{" "}
                and open the roster portal.
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
