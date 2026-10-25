import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight, ClipboardList, Rocket, Search, Trophy, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Social Innovation Ideathon — Student Innovation Competition, Grades 8–12",
        name: "description",
        content:
          "Form a team, choose a track — AgriTech, CleanTech, Health or Education — and take your social innovation from concept note to final prototype. Two stages, blind judging, school coordination built in.",
      },
      { property: "og:title", content: "Social Innovation Ideathon" },
      {
        property: "og:description",
        content:
          "A two-stage ideathon for grades 8–12: concept note, prototype, blind judging across four innovation tracks.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

type Track = { id: string; name: string; slug: string; description: string | null };

function Landing() {
  const { data: tracks } = useQuery({
    queryKey: ["public-tracks"],
    queryFn: async () => {
      const { data } = await supabase.from("tracks").select("id,name,slug,description").order("name");
      return (data ?? []) as Track[];
    },
  });

  return (
    <div className="min-h-screen bg-linen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Brand />
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" className="hidden sm:inline-flex">
            <Link to="/school-register">School coordinators</Link>
          </Button>
          <Button asChild className="bg-clay hover:bg-clay/90">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-8 sm:pt-14">
        <p className="eyebrow">Ideathon 2026 · Grades 8–12</p>
        <h1 className="font-display mt-3 max-w-3xl text-4xl font-semibold leading-[1.08] text-forest sm:text-6xl">
          Ideas that grow into change — for schools, by students.
        </h1>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
          A two-stage national ideathon. Build a team, choose an innovation track, submit your
          concept note, then return with a working prototype for blind evaluation by an expert jury.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button asChild size="lg" className="h-12 bg-clay px-6 text-base hover:bg-clay/90">
            <Link to="/auth">
              Register your team <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
            <Link to="/school-register">Register a school group</Link>
          </Button>
        </div>
        <div className="hairline mt-10" />

        {/* How it works */}
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: Users,
              title: "Form a team",
              body: "2–5 students per team. Create a team and share the 6-digit join code, or join a friend's team.",
            },
            {
              icon: ClipboardList,
              title: "Stage 1 — Concept note",
              body: "Problem statement, SDG tags and methodology. Submitting locks your roster.",
            },
            {
              icon: Rocket,
              title: "Stage 2 — Final prototype",
              body: "Technical reasoning, test outcomes and evidence, scored on a precision rubric.",
            },
          ].map((s) => (
            <div key={s.title} className="rounded-2xl border border-border bg-card p-5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-clay/12 text-clay">
                <s.icon className="h-5 w-5" />
              </span>
              <h3 className="font-display mt-3 text-lg font-semibold text-forest">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tracks */}
      <section className="border-y border-border bg-forest py-14 text-linen">
        <div className="mx-auto max-w-6xl px-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ochre">
            Innovation tracks
          </p>
          <h2 className="font-display mt-2 text-3xl font-semibold">Pick the problem you care about</h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(tracks ?? []).map((t) => (
              <div key={t.id} className="rounded-xl border border-linen/15 bg-linen/5 p-5">
                <h3 className="font-display text-lg font-semibold">{t.name}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-linen/70">{t.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Roles + demo */}
      <section className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Built for everyone in the room</p>
            <h2 className="font-display mt-2 text-3xl font-semibold text-forest">
              Students, teachers, judges — one workspace
            </h2>
            <ul className="mt-6 space-y-4">
              {[
                { icon: Users, t: "Students & teams", b: "Team workspace with join codes, WhatsApp sharing, deadline countdowns and auto-saving submissions." },
                { icon: Search, t: "Evaluators", b: "A blind queue of anonymous team codes with a dual-pane scoring sheet — 0.25-step rubric sliders." },
                { icon: Trophy, t: "Organisers", b: "Live KPI dashboard, submission manager, deadline controls and broadcasts to every student feed." },
              ].map((r) => (
                <li key={r.t} className="flex gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage/12 text-sage">
                    <r.icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="font-semibold text-foreground">{r.t}</p>
                    <p className="text-sm text-muted-foreground">{r.b}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-dashed border-clay/40 bg-card p-6">
            <p className="eyebrow">Explore right now</p>
            <h3 className="font-display mt-2 text-xl font-semibold text-forest">Demo accounts</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              One click signs you into a seeded preview environment (password{" "}
              <span className="font-mono text-xs text-forest">{DEMO_PASSWORD}</span>).
            </p>
            <div className="mt-4 grid gap-2">
              {DEMO_ACCOUNTS.map((a) => (
                <Link
                  key={a.email}
                  to="/auth"
                  className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 transition-colors hover:border-clay/50 hover:bg-clay/5"
                >
                  <div>
                    <p className="text-sm font-semibold text-foreground">{a.label}</p>
                    <p className="text-xs text-muted-foreground">{a.blurb}</p>
                  </div>
                  <span className="font-mono text-xs text-clay">{a.email}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 text-sm text-muted-foreground">
          <span>© 2026 Social Innovation Ideathon</span>
          <div className="flex gap-4">
            <Link to="/school-register" className="hover:text-foreground">
              School coordinators
            </Link>
            <Link to="/auth" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
