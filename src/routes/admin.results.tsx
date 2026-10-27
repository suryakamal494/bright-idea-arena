import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompetitionSettings } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/results")({
  head: () => ({
    meta: [{ title: "Results — Social Innovation Ideathon" }],
  }),
  component: ResultsManager,
});

type TeamRow = {
  team_id: string;
  team_code: string | null;
  team_name: string;
  track_name: string | null;
  school: string | null;
  s1_status: string | null;
  s2_status: string | null;
};

type ResultRow = {
  team_id: string;
  stage: number;
  outcome: "shortlisted" | "not_selected" | "selected";
  published: boolean;
};

const PAGE_SIZE = 100;

const OUTCOME_LABEL: Record<string, string> = {
  shortlisted: "Shortlisted for Round 2",
  not_selected: "Not selected",
  selected: "Selected",
};

function ResultsManager() {
  const queryClient = useQueryClient();
  const { data: competition } = useQuery({
    queryKey: ["competition-settings"],
    queryFn: fetchCompetitionSettings,
  });
  const twoStage = (competition?.stage_count ?? 2) === 2;

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  const { data: teamsRes, isLoading } = useQuery({
    queryKey: ["admin-results-teams", search, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_team_directory", {
        p_page: page,
        p_page_size: PAGE_SIZE,
        ...(search ? { p_search: search } : {}),
      });
      if (error) throw new Error(error.message);
      return data as { total: number; rows: TeamRow[] };
    },
  });

  const { data: results } = useQuery({
    queryKey: ["admin-results-rows"],
    queryFn: async () => {
      const { data } = await supabase.from("results").select("team_id,stage,outcome,published");
      return (data ?? []) as ResultRow[];
    },
  });

  const byTeam = new Map<string, Map<number, ResultRow>>();
  for (const r of results ?? []) {
    if (!byTeam.has(r.team_id)) byTeam.set(r.team_id, new Map());
    byTeam.get(r.team_id)!.set(r.stage, r);
  }

  async function setOutcome(teamId: string, stage: number, outcome: string) {
    const { error } = await supabase
      .from("results")
      .upsert(
        { team_id: teamId, stage, outcome, updated_at: new Date().toISOString() },
        { onConflict: "team_id,stage" },
      );
    if (error) {
      toast.error(error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-results-rows"] });
  }

  async function publish(stage: number, publishState: boolean, label: string) {
    const missing = (teamsRes?.rows ?? []).filter(
      (t) => !byTeam.get(t.team_id)?.has(stage),
    ).length;
    const totalTeams = teamsRes?.total ?? 0;
    if (publishState && missing > 0) {
      const go = window.confirm(
        `${missing} of ${totalTeams} teams have no outcome set yet. Teams without an outcome stay hidden from results. Publish anyway?`,
      );
      if (!go) return;
    }
    const { error } = await supabase
      .from("results")
      .update({ published: publishState, published_at: publishState ? new Date().toISOString() : null })
      .eq("stage", stage);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(publishState ? `${label} published` : `${label} hidden`);
    queryClient.invalidateQueries({ queryKey: ["admin-results-rows"] });
    queryClient.invalidateQueries({ queryKey: ["coordinator-overview"] });
  }

  const total = teamsRes?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const stage1Published = (results ?? []).some((r) => r.stage === 1 && r.published);

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Results</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Shortlist &amp; results</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Decide each team's outcome and publish. Nothing reaches students, schools or coordinators until you publish — and scores stay internal.
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0">
          <CardTitle className="font-display text-lg">
            {twoStage ? "Round 1 — shortlisting" : "Final results"}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {twoStage && (
              <>
                <Button
                  size="sm"
                  className="bg-clay hover:bg-clay/90"
                  onClick={() => publish(1, true, "Round 1 results")}
                >
                  Publish Round 1 results
                </Button>
                {stage1Published && (
                  <Button size="sm" variant="outline" onClick={() => publish(1, false, "Round 1 results")}>
                    Hide Round 1 results
                  </Button>
                )}
              </>
            )}
            {!twoStage && (
              <Button
                size="sm"
                className="bg-clay hover:bg-clay/90"
                onClick={() => publish(1, true, "Results")}
              >
                Publish results
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Search team ID, team name or school…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              window.clearTimeout((setSearch as unknown as { t?: number }).t);
              (setSearch as unknown as { t?: number }).t = window.setTimeout(() => {
                setSearch(e.target.value);
                setPage(0);
              }, 350);
            }}
          />
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading teams…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Team ID</th>
                    <th className="py-2 pr-3 font-semibold">Team</th>
                    <th className="py-2 pr-3 font-semibold">School</th>
                    <th className="py-2 pr-3 font-semibold">Stage 1</th>
                    <th className="py-2 pr-3 font-semibold">{twoStage ? "Round 1 outcome" : "Outcome"}</th>
                    {twoStage && <th className="py-2 pr-3 font-semibold">Stage 2</th>}
                    {twoStage && <th className="py-2 font-semibold">Final outcome</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {(teamsRes?.rows ?? []).map((t) => {
                    const r1 = byTeam.get(t.team_id)?.get(1);
                    const r2 = byTeam.get(t.team_id)?.get(2);
                    return (
                      <tr key={t.team_id}>
                        <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-forest">{t.team_code ?? "—"}</td>
                        <td className="py-2.5 pr-3 font-medium">{t.team_name}</td>
                        <td className="py-2.5 pr-3 text-xs text-muted-foreground">{t.school ?? "—"}</td>
                        <td className="py-2.5 pr-3">
                          {t.s1_status === "submitted" ? (
                            <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-semibold text-sage">Submitted</span>
                          ) : t.s1_status === "draft" ? (
                            <span className="rounded-full bg-ochre/15 px-2.5 py-0.5 text-xs font-semibold text-ochre">Draft</span>
                          ) : (
                            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Not started</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          <OutcomeSelect
                            value={r1?.outcome}
                            published={r1?.published}
                            options={twoStage ? ["shortlisted", "not_selected"] : ["selected", "not_selected"]}
                            onChange={(v) => setOutcome(t.team_id, 1, v)}
                          />
                        </td>
                        {twoStage && (
                          <td className="py-2.5 pr-3">
                            {t.s2_status === "submitted" ? (
                              <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-semibold text-sage">Submitted</span>
                            ) : t.s2_status === "draft" ? (
                              <span className="rounded-full bg-ochre/15 px-2.5 py-0.5 text-xs font-semibold text-ochre">Draft</span>
                            ) : (
                              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Not started</span>
                            )}
                          </td>
                        )}
                        {twoStage && (
                          <td className="py-2.5">
                            <OutcomeSelect
                              value={r2?.outcome}
                              published={r2?.published}
                              options={["selected", "not_selected"]}
                              onChange={(v) => setOutcome(t.team_id, 2, v)}
                            />
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {(teamsRes?.rows ?? []).length === 0 && (
                    <tr>
                      <td colSpan={twoStage ? 7 : 5} className="py-4 text-center text-sm text-muted-foreground">
                        No teams found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
          {pages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-xs text-muted-foreground">
                Page {page + 1} of {pages} · {total} teams
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
                  Next
                </Button>
              </div>
            </div>
          )}
          {twoStage && (
            <p className="text-xs text-muted-foreground">
              Publishing Round 1 results unlocks stage 2 for shortlisted teams only. Publish final results after Round 2 closes.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function OutcomeSelect({
  value,
  published,
  options,
  onChange,
}: {
  value: string | undefined;
  published?: boolean;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Select value={value ?? "none"} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-52 text-xs">
          <SelectValue placeholder="Not decided" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none" disabled>
            Not decided
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {OUTCOME_LABEL[o]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {published && (
        <span className="rounded-full bg-sage/15 px-2 py-0.5 text-[10px] font-semibold text-sage">Live</span>
      )}
    </div>
  );
}
