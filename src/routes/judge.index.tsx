import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, Inbox } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/judge/index")({
  head: () => ({
    meta: [{ title: "Evaluation queue — Social Innovation Ideathon" }],
  }),
  component: JudgeQueue,
});

type QueueRow = {
  id: string;
  team_code: string | null;
  title: string | null;
  status: string;
  team: { track: { name: string } | null } | null;
};

function JudgeQueue() {
  const { data, isLoading } = useQuery({
    queryKey: ["judge-queue"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return { items: [], evaluated: new Set<string>() };

      const { data: assignments } = await supabase
        .from("judge_assignments")
        .select("track_id")
        .eq("judge_id", user.id);
      const trackIds = (assignments ?? []).map((a) => a.track_id);
      if (trackIds.length === 0) return { items: [], evaluated: new Set<string>() };

      const { data: subs } = await supabase
        .from("submissions")
        .select("id,team_code,title,status,team:teams(track:tracks(name))")
        .eq("stage", 2)
        .eq("status", "submitted")
        .in("team.track_id", trackIds)
        .order("team_code");

      const { data: myScores } = await supabase
        .from("scores")
        .select("submission_id,submitted")
        .eq("judge_id", user.id);

      const evaluated = new Set(
        (myScores ?? []).filter((s) => s.submitted).map((s) => s.submission_id),
      );
      return { items: (subs ?? []) as QueueRow[], evaluated };
    },
  });

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading queue…</p>;
  }

  const items = data?.items ?? [];
  const evaluated = data?.evaluated ?? new Set<string>();

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Evaluator workspace</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Blind review queue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Entries appear only as anonymous team codes — student names, schools and cities are hidden
          throughout scoring.
        </p>
      </header>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Inbox className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            No final submissions in your assigned tracks yet.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((s) => {
            const done = evaluated.has(s.id);
            return (
              <Card key={s.id}>
                <CardContent className="pt-5">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-forest px-2.5 py-0.5 font-mono text-xs font-semibold text-linen">
                      {s.team_code ?? "TEAM"}
                    </span>
                    {done ? (
                      <span className="flex items-center gap-1 rounded-full bg-sage/15 px-2 py-0.5 text-xs font-semibold text-sage">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Evaluated
                      </span>
                    ) : (
                      <span className="rounded-full bg-ochre/15 px-2 py-0.5 text-xs font-semibold text-ochre">
                        Awaiting score
                      </span>
                    )}
                  </div>
                  <h2 className="font-display mt-3 text-lg font-semibold leading-snug text-forest">
                    {s.title ?? "Untitled project"}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Track · {s.team?.track?.name ?? "—"}
                  </p>
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <Link to="/judge/evaluate/$submissionId" params={{ submissionId: s.id }}>
                      {done ? "Review score" : "Open evaluation sheet"}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
