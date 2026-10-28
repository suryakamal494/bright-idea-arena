import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
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
    meta: [
      { title: "Results — Social Innovation Ideathon" },
      { name: "description", content: "Shortlist teams round by round and publish results." },
      { property: "og:title", content: "Results — Social Innovation Ideathon" },
      { property: "og:description", content: "Shortlist teams round by round and publish results." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResultsManager,
});

type Row = {
  team_id: string;
  team_code: string | null;
  team_name: string;
  track_name: string | null;
  school: string | null;
  title: string | null;
  status: string;
  outcome: string | null;
  published: boolean;
  avg_score: number | null;
  reviews: number;
};

type DirRes = {
  total: number;
  max_score: number;
  counts: { teams: number; decided: number; positive: number; published: boolean | null };
  rows: Row[];
};

const PAGE_SIZE = 50;

const OUTCOME_LABEL: Record<string, string> = {
  shortlisted: "Shortlisted for Round 2",
  not_selected: "Not selected",
  selected: "Selected",
};

function ResultsManager() {
  const { data: competition } = useQuery({
    queryKey: ["competition-settings"],
    queryFn: fetchCompetitionSettings,
  });
  const twoStage = (competition?.stage_count ?? 2) === 2;
  const [tab, setTab] = useState<1 | 2>(1);
  const stage = twoStage ? tab : 1;

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Results</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Shortlist &amp; results</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Work one round at a time. Nothing reaches students or schools until you publish — scores stay internal.
        </p>
      </header>

      {twoStage && (
        <div role="tablist" className="inline-flex rounded-lg border border-border bg-card p-1">
          {([1, 2] as const).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={tab === s}
              onClick={() => setTab(s)}
              className={`rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
                tab === s ? "bg-forest text-primary-foreground" : "text-muted-foreground hover:text-forest"
              }`}
            >
              {s === 1 ? "Round 1 — Shortlisting" : "Round 2 — Finalists"}
            </button>
          ))}
        </div>
      )}

      <RoundPanel key={stage} stage={stage} twoStage={twoStage} />
    </div>
  );
}

function RoundPanel({ stage, twoStage }: { stage: 1 | 2; twoStage: boolean }) {
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [trackId, setTrackId] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [sort, setSort] = useState("score");
  const [page, setPage] = useState(0);
  const timer = useRef<number | null>(null);

  const { data: tracks } = useQuery({
    queryKey: ["tracks"],
    queryFn: async () => {
      const { data } = await supabase.from("tracks").select("id,name").order("name");
      return data ?? [];
    },
  });

  const key = ["admin-results", stage, search, trackId, outcome, sort, page];
  const { data, isLoading } = useQuery({
    queryKey: key,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_results_directory", {
        p_stage: stage,
        p_page: page,
        p_page_size: PAGE_SIZE,
        p_sort: sort,
        ...(search ? { p_search: search } : {}),
        ...(trackId !== "all" ? { p_track_id: trackId } : {}),
        ...(outcome !== "all" ? { p_outcome: outcome } : {}),
      });
      if (error) throw new Error(error.message);
      return data as unknown as DirRes;
    },
  });

  const { data: r1Published } = useQuery({
    queryKey: ["results-r1-published"],
    enabled: stage === 2,
    queryFn: async () => {
      const { count } = await supabase
        .from("results")
        .select("id", { count: "exact", head: true })
        .eq("stage", 1)
        .eq("published", true);
      return (count ?? 0) > 0;
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-results"] });
    queryClient.invalidateQueries({ queryKey: ["results-r1-published"] });
    queryClient.invalidateQueries({ queryKey: ["coordinator-overview"] });
  };

  async function saveOutcome(teamId: string, value: string) {
    const { error } = await supabase.from("results").upsert(
      {
        team_id: teamId,
        stage,
        outcome: value as "shortlisted" | "not_selected" | "selected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,stage" },
    );
    if (error) return toast.error(error.message);
    refresh();
  }

  const label = !twoStage ? "Results" : stage === 1 ? "Round 1 shortlist" : "Final results";

  async function publish(state: boolean) {
    const c = data?.counts;
    if (state && c && c.decided < c.teams) {
      const ok = window.confirm(
        `${c.teams - c.decided} of ${c.teams} teams have no outcome yet. They stay hidden from results. Publish anyway?`,
      );
      if (!ok) return;
    }
    const { error } = await supabase
      .from("results")
      .update({ published: state, published_at: state ? new Date().toISOString() : null })
      .eq("stage", stage);
    if (error) return toast.error(error.message);
    toast.success(state ? `${label} published` : `${label} hidden`);
    refresh();
  }

  const options = twoStage && stage === 1 ? ["shortlisted", "not_selected"] : ["selected", "not_selected"];
  const positiveLabel = twoStage && stage === 1 ? "shortlisted" : "selected";
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const c = data?.counts;
  const max = data?.max_score ?? 0;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="font-display text-lg">
            {!twoStage ? "Final results" : stage === 1 ? "Round 1 — Shortlisting" : "Round 2 — Finalists"}
          </CardTitle>
          {c && (
            <p className="mt-1 text-xs text-muted-foreground">
              {c.teams} teams · {c.positive} {positiveLabel} · {c.decided} decided ·{" "}
              <span className={c.published ? "font-semibold text-sage" : "font-semibold text-ochre"}>
                {c.published ? "Published" : "Draft"}
              </span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-clay hover:bg-clay/90" onClick={() => publish(true)}>
            Publish {label.toLowerCase()}
          </Button>
          {c?.published && (
            <Button size="sm" variant="outline" onClick={() => publish(false)}>
              Hide
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {stage === 2 && r1Published === false && (
          <p className="rounded-md border border-ochre/30 bg-ochre/10 px-3 py-2 text-xs text-ochre">
            Round 1 results are still in draft. Shortlisted teams can only start their Round 2 submission once you publish Round 1.
          </p>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto]">
          <Input
            placeholder="Search team ID, name, project or school…"
            value={searchInput}
            onChange={(e) => {
              const v = e.target.value;
              setSearchInput(v);
              if (timer.current) window.clearTimeout(timer.current);
              timer.current = window.setTimeout(() => {
                setSearch(v);
                setPage(0);
              }, 350);
            }}
          />
          <Select value={trackId} onValueChange={(v) => { setTrackId(v); setPage(0); }}>
            <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All themes</SelectItem>
              {(tracks ?? []).map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={outcome} onValueChange={(v) => { setOutcome(v); setPage(0); }}>
            <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All outcomes</SelectItem>
              <SelectItem value="none">Not decided</SelectItem>
              {options.map((o) => (
                <SelectItem key={o} value={o}>{OUTCOME_LABEL[o]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => { setSort(v); setPage(0); }}>
            <SelectTrigger className="lg:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Highest score first</SelectItem>
              <SelectItem value="team">Team ID</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <p className="py-4 text-center text-sm text-muted-foreground">Loading teams…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Team ID</th>
                  <th className="py-2 pr-3 font-semibold">Team &amp; project</th>
                  <th className="py-2 pr-3 font-semibold">School</th>
                  <th className="py-2 pr-3 font-semibold">Theme</th>
                  <th className="py-2 pr-3 font-semibold">Judge score</th>
                  <th className="py-2 pr-3 font-semibold">Submission</th>
                  <th className="py-2 font-semibold">{stage === 1 && twoStage ? "Round 1 outcome" : "Final outcome"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(data?.rows ?? []).map((t) => (
                  <tr key={t.team_id}>
                    <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-forest">{t.team_code ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      <p className="font-medium">{t.team_name}</p>
                      <p className="text-xs text-muted-foreground">{t.title || "No project title yet"}</p>
                    </td>
                    <td className="py-2.5 pr-3 text-xs text-muted-foreground">{t.school ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-xs">{t.track_name ?? "—"}</td>
                    <td className="py-2.5 pr-3">
                      {t.avg_score != null ? (
                        <>
                          <p className="font-semibold text-forest">
                            {Number(t.avg_score).toFixed(1)}
                            <span className="text-xs font-normal text-muted-foreground"> / {max}</span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t.reviews} review{t.reviews === 1 ? "" : "s"}
                          </p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not scored</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-3"><StatusPill status={t.status} /></td>
                    <td className="py-2.5">
                      <OutcomeSelect
                        value={t.outcome ?? undefined}
                        published={t.published}
                        options={options}
                        onChange={(v) => saveOutcome(t.team_id, v)}
                      />
                    </td>
                  </tr>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-sm text-muted-foreground">
                      {stage === 2 ? "No shortlisted teams match. Shortlist teams in Round 1 first." : "No teams found."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-muted-foreground">Page {page + 1} of {pages} · {total} teams</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "submitted")
    return <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-semibold text-sage">Submitted</span>;
  if (status === "draft")
    return <span className="rounded-full bg-ochre/15 px-2.5 py-0.5 text-xs font-semibold text-ochre">Draft</span>;
  return <span className="whitespace-nowrap rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Not started</span>;
}

function OutcomeSelect({
  value,
  published,
  options,
  onChange,
}: {
  value: string | undefined;
  published?: boolean | undefined;
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
          <SelectItem value="none" disabled>Not decided</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{OUTCOME_LABEL[o]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {published && (
        <span className="rounded-full bg-sage/15 px-2 py-0.5 text-[10px] font-semibold text-sage">Live</span>
      )}
    </div>
  );
}
