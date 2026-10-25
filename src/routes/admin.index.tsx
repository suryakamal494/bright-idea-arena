import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardCheck, FileText, Users, UserSquare2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/index")({
  head: () => ({
    meta: [{ title: "Operations overview — Social Innovation Ideathon" }],
  }),
  component: AdminOverview,
});

type Kpis = {
  teams: number;
  students: number;
  stage1: number;
  stage2: number;
  judged: number;
};

function AdminOverview() {
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: async (): Promise<Kpis> => {
      const count = async (table: string, filters: Record<string, unknown> = {}) => {
        let q = supabase.from(table).select("id", { count: "exact", head: true });
        for (const [k, v] of Object.entries(filters)) {
          q = q.eq(k, v as never);
        }
        const { count: c } = await q;
        return c ?? 0;
      };
      const [teams, students, stage1, stage2, judged] = await Promise.all([
        count("teams"),
        count("profiles"),
        count("submissions", { stage: 1, status: "submitted" }),
        count("submissions", { stage: 2, status: "submitted" }),
        count("scores", { submitted: true }),
      ]);
      return { teams, students, stage1, stage2, judged };
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["admin-recent-submissions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("submissions")
        .select("id,team_code,title,stage,status,submitted_at,updated_at,team:teams(name,track:tracks(name))")
        .order("updated_at", { ascending: false })
        .limit(8);
      return data ?? [];
    },
  });

  const judgedPct =
    kpis && kpis.stage2 > 0 ? Math.round((kpis.judged / kpis.stage2) * 100) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Operations hub</p>
          <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
            Live overview
          </h1>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/broadcasts">
            <ArrowUpRight className="mr-1.5 h-4 w-4" /> Post announcement
          </Link>
        </Button>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Total teams", value: kpis?.teams, icon: Users, tone: "text-sage bg-sage/12" },
          { label: "Total students", value: kpis?.students, icon: UserSquare2, tone: "text-sage bg-sage/12" },
          { label: "Stage 1 submitted", value: kpis?.stage1, icon: FileText, tone: "text-clay bg-clay/12" },
          { label: "Stage 2 submitted", value: kpis?.stage2, icon: ClipboardCheck, tone: "text-ochre bg-ochre/12" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${k.tone}`}>
                <k.icon className="h-4.5 w-4.5" />
              </span>
              <p className="font-display mt-3 text-3xl font-semibold text-forest">
                {isLoading ? "…" : (k.value ?? 0)}
              </p>
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardContent className="pt-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-forest/10 text-forest">
              <ClipboardCheck className="h-4.5 w-4.5" />
            </span>
            <p className="font-display mt-3 text-3xl font-semibold text-forest">{judgedPct}%</p>
            <p className="text-xs font-medium text-muted-foreground">Judging complete</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-forest transition-all" style={{ width: `${judgedPct}%` }} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-lg">Recent submission activity</CardTitle>
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin/submissions">View all</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {(recent ?? []).map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{s.title ?? "Untitled"}</p>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-mono">{s.team_code ?? "TEAM"}</span> ·{" "}
                    {(s.team as { track?: { name?: string } } | null)?.track?.name ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                    Stage {s.stage}
                  </span>
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-xs font-semibold " +
                      (s.status === "submitted" ? "bg-sage/15 text-sage" : "bg-ochre/15 text-ochre")
                    }
                  >
                    {s.status}
                  </span>
                </div>
              </div>
            ))}
            {(recent ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">No submissions yet.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
