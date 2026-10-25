import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Copy, Megaphone, PenLine, Trophy, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/auth";
import { fetchGlobalStageSettings, fetchMyTeam, stageOpen, type StageSettingRow, type SubmissionRow, type TeamRow } from "@/lib/team";
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
  const { data: team } = useQuery({
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

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Ideathon 2026 · Student workspace</p>
        <h1 className="font-display mt-1.5 text-2xl font-semibold leading-tight text-forest sm:text-3xl">
          {team ? "Your competition at a glance" : "Let's get you started"}
        </h1>
      </header>

      {!team ? (
        <NoTeamCards />
      ) : (
        <>
          <TeamSummaryCard team={team} />
          <StageCards settings={settings ?? null} team={team} />
        </>
      )}

      <AnnouncementsFeed items={announcements ?? []} />
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
              Every team has 2–5 members. One member creates the team and becomes its captain; the
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
              <Link to="/team">Create a team</Link>
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
              <Link to="/team">Join a team</Link>
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
}: {
  settings: StageSettingRow | null;
  team: TeamRow;
}) {
  const s1 = stageOpen(settings, 1);
  const s2 = stageOpen(settings, 2);
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
        <CardContent className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {s1 ? (
            <Countdown deadline={settings?.stage1_deadline ?? null} />
          ) : (
            <p className="text-sm font-medium text-destructive">Closed</p>
          )}
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
            <Link to="/submission">Open submission form</Link>
          </Button>
        </CardContent>
      </Card>
      <Card className="flex flex-col">
        <CardHeader className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 space-y-0">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Stage 2</p>
            <CardTitle className="font-display mt-1 text-lg leading-snug">Final prototype</CardTitle>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><CalendarClock className="h-4.5 w-4.5 text-ochre" /></span>
        </CardHeader>
        <CardContent className="mt-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {s2 ? (
            <Countdown deadline={settings?.stage2_deadline ?? null} />
          ) : (
            <p className="text-sm font-medium text-destructive">Closed</p>
          )}
          <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
            <Link to="/submission">Open submission form</Link>
          </Button>
        </CardContent>
      </Card>
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
