import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Copy, Megaphone, PenLine, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/auth";
import { fetchCompetitionSettings, fetchGlobalStageSettings, fetchMyTeam, stageOpen, type PublishedResultRow, type StageSettingRow, type TeamRow } from "@/lib/team";
import { Countdown } from "@/components/countdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_student/dashboard")({
  head: () => ({
    meta: [{ title: "My ideathon — Social Innovation Ideathon" }],
  }),
  component: Dashboard,
});

type AnnouncementRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  created_at: string;
};

function Dashboard() {
  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: getSessionUser });
  const { data: team, isLoading: teamLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: async () => {
      const user = await getSessionUser();
      return user ? fetchMyTeam(user.id) : null;
    },
  });
  const { data: settings } = useQuery({
    queryKey: ["stage-settings-global"],
    queryFn: fetchGlobalStageSettings,
  });
  const { data: competition } = useQuery({
    queryKey: ["competition-settings"],
    queryFn: fetchCompetitionSettings,
  });
  const twoStage = (competition?.stage_count ?? 2) === 2;
  const { data: announcements } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,kind,title,body,link,created_at")
        .order("created_at", { ascending: false })
        .limit(6);
      return (data ?? []) as AnnouncementRow[];
    },
  });
  const { data: results } = useQuery({
    queryKey: ["my-results", team?.id],
    enabled: !!team,
    queryFn: async () => {
      const { data } = await supabase
        .from("results")
        .select("team_id,stage,outcome,published,published_at")
        .eq("team_id", team!.id);
      return (data ?? []) as PublishedResultRow[];
    },
  });

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Ideathon 2026 · Student workspace</p>
        <h1 className="font-display mt-1.5 text-2xl font-semibold leading-tight text-forest sm:text-3xl">
          {team ? "Your competition at a glance" : "Let's get you started"}
        </h1>
      </header>

      {teamLoading || meLoading ? (
        <div className="h-64 animate-pulse rounded-xl bg-muted/40" />
      ) : !team ? (
        <NoTeamCards />
      ) : (
        <>
          <TeamSummaryCard team={team} />
          {!team.cluster && <ClusterPrompt team={team} isCaptain={!!me && team.captain_id === me.id} />}
          <ResultsBanner results={results ?? []} twoStage={twoStage} settings={settings ?? null} />
          <StageCards settings={settings ?? null} team={team} twoStage={twoStage} results={results ?? []} />
        </>
      )}

      <AnnouncementsFeed items={announcements ?? []} />
    </div>
  );
}

function ClusterPrompt({ team, isCaptain }: { team: TeamRow; isCaptain: boolean }) {
  return (
    <div className="rounded-xl border border-ochre/40 bg-ochre/10 p-4 text-sm">
      <p className="font-semibold text-ochre">Your team has no cluster yet</p>
      <p className="mt-1 text-foreground/90">
        {isCaptain
          ? "Pick your team's competition cluster on the team page — the submission form stays locked until you do."
          : "Every team belongs to a competition cluster. Your captain picks it on the team page — the submission form stays locked until then."}
      </p>
      {isCaptain && (
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link to="/team" search={{ tab: "create" }}>Open team page</Link>
        </Button>
      )}
    </div>
  );
}

function ResultsBanner({ results, twoStage, settings }: { results: PublishedResultRow[]; twoStage: boolean; settings: StageSettingRow | null }) {
  const r1 = results.find((r) => r.stage === 1);
  const r2 = results.find((r) => r.stage === 2);
  const finalOutcome = twoStage ? r2 : r1;
  const lines: { text: string; tone: "good" | "bad" }[] = [];
  if (twoStage && r1?.published) {
    if (r1.outcome === "shortlisted") lines.push({ text: `Shortlisted for Round 2 — Stage 2 is ${stageOpen(settings, 2) ? "open" : "currently closed"}.`, tone: "good" });
    else lines.push({ text: "Round 1 result: not selected for Round 2. Thank you for participating!", tone: "bad" });
  }
  if (finalOutcome?.published) {
    if (finalOutcome.outcome === "selected") lines.push({ text: "Final result: Selected. Congratulations — your team is a winner!", tone: "good" });
    else lines.push({ text: "Final result: not selected. Thank you for participating!", tone: "bad" });
  }
  if (!lines.length) return null;
  return (
    <div className="space-y-2">
      {lines.map((l) => (
        <div
          key={l.text}
          className={
            "rounded-xl border p-4 text-sm font-medium " +
            (l.tone === "good"
              ? "border-sage/40 bg-sage/10 text-secondary-foreground"
              : "border-clay/40 bg-clay/10 text-clay")
          }
        >
          {l.text}
        </div>
      ))}
    </div>
  );
}

function NoTeamCards() {
  return (
    <div className="space-y-4">
      <Card className="border-clay/30 bg-clay/5">
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-clay">
              You're registered — step 1 of 3
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">
              Every team needs 2–3 members. One member creates the team and becomes its captain; the
              others join with the 6-digit code the captain shares.
            </p>
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-clay/12 text-clay">
              <Users className="h-5 w-5" />
            </span>
            <CardTitle className="font-display text-xl">Create a team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Lead your team: pick an innovation track, get your join code and share it with
              teammates.
            </p>
            <Button asChild className="mt-4 bg-clay hover:bg-clay/90">
              <Link to="/team" search={{ tab: "create" }}>Create a team</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-sage/12 text-sage">
              <Trophy className="h-5 w-5" />
            </span>
            <CardTitle className="font-display text-xl">Join a team</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Have the 6-digit join code from your team captain? Enter it and you're in.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/team" search={{ tab: "join" }}>Join a team</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 2 · Study the problem briefs
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Read the guides and past examples in the Resources before picking your track —
              no team needed to start.
            </p>
            <Button asChild variant="link" className="mt-1 h-auto p-0 text-clay">
              <Link to="/learning">Open Resources →</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Step 3 · Submit your concept note
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Stage 1 unlocks as soon as your team is formed. You'll draft the problem statement,
              methodology and sketches together.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TeamSummaryCard({ team }: { team: TeamRow }) {
  const [copied, setCopied] = useState(false);
  const shareText = encodeURIComponent(
    `Join my ideathon team "${team.name}"! Enter code ${team.join_code} on the Social Innovation Ideathon app.`,
  );
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="font-display text-2xl text-forest">{team.name}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Theme · {team.track?.name ?? "Not set"}
            {team.cluster ? ` · Cluster · ${team.cluster.name}` : " · Cluster not set"}
          </p>
        </div>
        <span className="rounded-full bg-forest px-3 py-1 font-mono text-xs font-semibold text-linen">
          {team.team_code ?? "TEAM"}
        </span>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-muted px-3 py-2 font-mono text-base font-semibold tracking-widest text-forest">
            {team.join_code}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(team.join_code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <Copy className="mr-1.5 h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`https://wa.me/?text=${shareText}`} target="_blank" rel="noreferrer">
              Share on WhatsApp
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StageCards({
  settings,
  team,
  twoStage,
  results,
}: {
  settings: StageSettingRow | null;
  team: TeamRow;
  twoStage: boolean;
  results: PublishedResultRow[];
}) {
  const s1 = stageOpen(settings, 1);
  const s2 = stageOpen(settings, 2);
  const r1 = results.find((r) => r.stage === 1);
  const shortlisted = r1?.published && r1.outcome === "shortlisted";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Card className="flex flex-col">
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 space-y-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage 1</p>
            <CardTitle className="font-display mt-1 text-lg leading-snug">Concept note</CardTitle>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><PenLine className="h-4.5 w-4.5 text-clay" /></span>
        </CardHeader>
        <CardContent className="mt-auto flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {s1 ? (
            <Countdown deadline={settings?.stage1_deadline ?? null} />
          ) : (
            <p className="text-sm font-medium text-destructive">Closed</p>
          )}
          <Button asChild size="sm" variant="outline" className="w-full lg:w-auto">
            <Link to="/submission">Open submission form</Link>
          </Button>
        </CardContent>
      </Card>
      {twoStage && (
        <Card className="flex flex-col">
          <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 space-y-0">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage 2</p>
              <CardTitle className="font-display mt-1 text-lg leading-snug">Final prototype</CardTitle>
            </div>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><CalendarClock className="h-4.5 w-4.5 text-ochre" /></span>
          </CardHeader>
          <CardContent className="mt-auto flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {!r1?.published ? (
              <p className="text-sm font-medium text-muted-foreground">Round 1 results not published yet</p>
            ) : !shortlisted ? (
              <p className="text-sm font-medium text-destructive">Your team was not selected for Round 2</p>
            ) : s2 ? (
              <Countdown deadline={settings?.stage2_deadline ?? null} />
            ) : settings ? (
              <p className="text-sm font-medium text-destructive">Closed</p>
            ) : (
              <p className="text-sm font-medium text-muted-foreground">Loading stage settings…</p>
            )}
            {shortlisted && s2 ? (
              <Button asChild size="sm" variant="outline" className="w-full lg:w-auto">
                <Link to="/submission">Open submission form</Link>
              </Button>
            ) : shortlisted ? (
              <Button size="sm" variant="outline" className="w-full lg:w-auto" disabled>
                Stage 2 is closed
              </Button>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function AnnouncementsFeed({ items }: { items: AnnouncementRow[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2 space-y-0">
        <Megaphone className="h-4.5 w-4.5 text-clay" />
        <CardTitle className="font-display text-lg">Announcements</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((a) => (
          <div key={a.id} className="border-l-2 border-clay/40 pl-3.5">
            <p className="text-sm font-semibold text-foreground">{a.title}</p>
            <p className="mt-0.5 whitespace-pre-wrap text-sm text-muted-foreground">{a.body}</p>
            {a.link && (
              <a
                href={a.link}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-sm font-medium text-clay underline underline-offset-2"
              >
                Open link
              </a>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
