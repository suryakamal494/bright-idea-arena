import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, ClipboardCheck, FileText, Users, UserSquare2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { judgingProgressPercent } from "@/lib/team";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Operations overview — Social Innovation Ideathon" }],
  }),
  component: AdminOverview,
});

type AdminOverview = {
  teams: number;
  students: number;
  stage1: number;
  stage2: number;
  judged: number;
  judging_total: number;
  recent: {
    id: string;
    team_code: string | null;
    title: string | null;
    stage: number;
    status: string;
    submitted_at: string | null;
    updated_at: string;
    team_name: string | null;
    track: string | null;
  }[];
};

function AdminOverview() {
  // One roundtrip: the admin-only RPC returns all counts + recent rows.
  const { data: overview, isLoading } = useQuery({
    queryKey: ["admin-kpis"],
    queryFn: async (): Promise<AdminOverview> => {
      const { data, error } = await supabase.rpc("admin_overview_kpis");
      if (error) throw error;
      return data as AdminOverview;
    },
  });

  const kpis = overview
    ? {
        teams: overview.teams,
        students: overview.students,
        stage1: overview.stage1,
        stage2: overview.stage2,
        judged: overview.judged,
        judging_total: overview.judging_total,
      }
    : undefined;
  const recent = overview?.recent ?? [];

  const judgedPct = kpis ? judgingProgressPercent(kpis.judged, kpis.judging_total) : 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Operations hub</p>
          <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
            Live overview
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/registrations">
              <Users className="mr-1.5 h-4 w-4" /> Registrations
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/broadcasts">
              <ArrowUpRight className="mr-1.5 h-4 w-4" /> Post announcement
            </Link>
          </Button>
        </div>
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
            <p className="text-xs font-medium text-muted-foreground">Submitted entries evaluated</p>
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
                    {s.track ?? "—"}
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
