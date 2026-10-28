import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { SubmissionDetails } from "@/components/submission-details";
import { printOnePager } from "@/lib/onepager";
import { ReviewButtons, ReviewNotes, type ReviewStatus } from "@/components/review-controls";

export const Route = createFileRoute("/admin/submissions")({
  head: () => ({
    meta: [{ title: "Submissions — Social Innovation Ideathon" }],
  }),
  component: SubmissionsManager,
});

type Row = {
  team_id: string;
  team_code: string | null;
  team_name: string;
  track_name: string | null;
  school: string | null;
  members: string[];
  member_count: number;
  s1_status: string | null;
  s2_status: string | null;
  last_activity: string | null;
  review_status: ReviewStatus;
  review_notes: string | null;
};

const REVIEW_TABS: { key: "all" | ReviewStatus; label: string }[] = [
  { key: "all", label: "All submissions" },
  { key: "marked", label: "Marked for review" },
  { key: "unreviewed", label: "Unreviewed" },
  { key: "not_selected", label: "Not selected" },
];

const PAGE_SIZE = 25;

function SubmissionsManager() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [trackId, setTrackId] = useState("all");
  const [status, setStatus] = useState("all");
  const [review, setReview] = useState<"all" | ReviewStatus>("all");
  const [round, setRound] = useState<1 | 2>(1);
  const { data: stageCount = 2 } = useQuery({
    queryKey: ["competition-stage-count"],
    queryFn: async () => {
      const { data } = await supabase.from("competition_settings").select("stage_count").eq("id", 1).maybeSingle();
      return data?.stage_count ?? 2;
    },
  });
  const stage = stageCount === 1 ? 1 : round;
  const [page, setPage] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState<Row | null>(null);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc("admin_submission_export", {
        ...(search.trim() ? { p_search: search.trim() } : {}),
        ...(trackId === "all" ? {} : { p_track_id: trackId }),
        p_status: status,
      });
      if (error) throw error;
      type ExportRow = {
        school: string | null; student_name: string; email: string | null; phone: string | null;
        theme: string | null; team_code: string | null; team_name: string; stage1: string | null; stage2: string | null;
      };
      const all = (data ?? []) as unknown as ExportRow[];
      const header = ["School", "Student name", "Email", "Mobile", "Theme", "Team ID", "Team name", "Stage 1", "Stage 2"];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        header.join(","),
        ...all.map((r) =>
          [r.school, r.student_name, r.email, r.phone, r.theme, r.team_code, r.team_name, r.stage1 ?? "not started", r.stage2 ?? "not started"]
            .map(esc)
            .join(","),
        ),
      ].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  // Debounced search: one query per settled term, not per keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: tracks } = useQuery({
    queryKey: ["public-tracks"],
    queryFn: async () => {
      const { data } = await supabase.from("tracks").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-directory", stage, search, trackId, status, review, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_team_directory", {
        p_page: page,
        p_page_size: PAGE_SIZE,
        ...(search.trim() ? { p_search: search.trim() } : {}),
        ...(trackId === "all" ? {} : { p_track_id: trackId }),
        p_status: status,
        p_review: review,
        p_stage: stage,
      });
      if (error) throw error;
      return data as unknown as {
        total: number;
        counts: Record<"all" | ReviewStatus, number>;
        rows: Row[];
      };
    },
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const statusBadge = (s: string | null) =>
    s === "submitted" ? (
      <Badge className="bg-sage/15 text-sage hover:bg-sage/15">Submitted</Badge>
    ) : s === "draft" ? (
      <Badge className="bg-ochre/15 text-ochre hover:bg-ochre/15">Draft</Badge>
    ) : (
      <span className="text-xs text-muted-foreground">—</span>
    );

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Submissions</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
          Team entries <span className="text-lg font-normal text-muted-foreground">({total})</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stage 1 and Stage 2 status for every team. Click a team to inspect its entries, scoring
          and attachments.
        </p>
      </header>

      {stageCount === 2 && (
        <div role="tablist" aria-label="Round" className="flex gap-1 border-b border-border">
          {([1, 2] as const).map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={round === r}
              onClick={() => {
                setRound(r);
                setReview("all");
                setPage(0);
                setSelectedTeam(null);
              }}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition-colors ${
                round === r ? "border-terracotta text-forest" : "border-transparent text-muted-foreground hover:text-forest"
              }`}
            >
              {r === 1 ? "Round 1 — Idea screening" : "Round 2 — Shortlisted teams"}
            </button>
          ))}
        </div>
      )}
      {stage === 2 && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Only teams shortlisted in published Round 1 results appear here. Marks and notes are separate from Round 1.
        </p>
      )}

      <div role="tablist" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {REVIEW_TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={review === t.key}
            onClick={() => {
              setReview(t.key);
              setPage(0);
            }}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors sm:flex-none ${
              review === t.key ? "bg-forest text-primary-foreground" : "text-muted-foreground hover:text-forest"
            }`}
          >
            {t.label}
            {data?.counts && <span className="ml-1.5 opacity-75">{data.counts[t.key] ?? 0}</span>}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search team ID, name, school or student…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          value={trackId}
          onValueChange={(v) => {
            setTrackId(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Theme" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All themes</SelectItem>
            {(tracks ?? []).map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Progress" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All progress</SelectItem>
            <SelectItem value="none">Not started</SelectItem>
            <SelectItem value="stage1">Stage 1 in review</SelectItem>
            <SelectItem value="stage2">Stage 2 submitted</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" disabled={exporting} onClick={exportCsv} className="ml-auto">
          <Download className="mr-1.5 h-4 w-4" />
          {exporting ? "Preparing…" : "Export CSV"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : (
            <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
              <div className="hidden grid-cols-[130px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_70px_80px_80px_210px] gap-3 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <span>Team ID</span>
                <span>Team</span>
                <span>School</span>
                <span>Theme</span>
                <span className="text-center">Members</span>
                <span className="text-center">Stage 1</span>
                <span className="text-center">Stage 2</span>
                <span className="text-center">Screening</span>
              </div>
              <div className="divide-y divide-border">
                {(data?.rows ?? []).map((r) => (
                  <div
                    key={r.team_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedTeam(r)}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedTeam(r)}
                    className="grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:grid-cols-[130px_minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_70px_80px_80px_210px] lg:items-center lg:gap-3"
                  >
                    <span className="font-mono text-xs font-semibold text-forest">
                      {r.team_code ?? "—"}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{r.team_name}</span>
                      <span className="block truncate text-xs text-muted-foreground lg:hidden">
                        {r.school ?? "No school"} · {r.track_name ?? "No track"}
                      </span>
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                      {r.school ?? "No school"}
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                      {r.track_name ?? "No theme"}
                    </span>
                    <span className="text-xs text-muted-foreground lg:text-center">
                      {r.member_count}{" "}
                      <span className="hidden lg:inline">
                        {r.members.slice(0, 2).join(", ")}
                        {r.members.length > 2 ? ` +${r.members.length - 2}` : ""}
                      </span>
                      <span className="lg:hidden">members</span>
                    </span>
                    <span className="lg:text-center">{statusBadge(r.s1_status)}</span>
                    <span className="lg:text-center">{statusBadge(r.s2_status)}</span>
                    <span className="lg:text-center">
                      <ReviewButtons teamId={r.team_id} stage={stage} status={r.review_status} />
                    </span>
                  </div>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No teams match these filters.
                  </p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Prev
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page + 1} of {totalPages}
            {isFetching ? " · loading…" : ""}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      <Sheet open={!!selectedTeam} onOpenChange={(o) => !o && setSelectedTeam(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{selectedTeam?.team_name}</SheetTitle>
          </SheetHeader>
          {selectedTeam && (
            <div className="mt-4 space-y-4 rounded-xl border border-sage/30 bg-sage/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="eyebrow">Round {stage} screening</p>
                <ReviewButtons
                  size="md"
                  teamId={selectedTeam.team_id}
                  stage={stage}
                  status={selectedTeam.review_status}
                  onChanged={(s) => setSelectedTeam((t) => (t ? { ...t, review_status: s } : t))}
                />
              </div>
              <ReviewNotes key={`${selectedTeam.team_id}-${stage}`} teamId={selectedTeam.team_id} stage={stage} initial={selectedTeam.review_notes} />
            </div>
          )}
          {selectedTeam && <TeamEntryInspector team={selectedTeam} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TeamEntryInspector({ team }: { team: Row }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-team-detail", team.team_id],
    queryFn: async () => {
      const subs = await supabase
        .from("submissions")
        .select("*")
        .eq("team_id", team.team_id)
        .order("stage");
      const ids = (subs.data ?? []).map((s) => s.id);
      const [files, scores] = await Promise.all([
        ids.length
          ? supabase.from("submission_files").select("*").in("submission_id", ids)
          : Promise.resolve({ data: [] as never[] }),
        ids.length
          ? supabase
              .from("scores")
              .select("id,submission_id,criterion_scores,feedback,submitted,updated_at,judge:profiles(full_name)")
              .in("submission_id", ids)
          : Promise.resolve({ data: [] as never[] }),
      ]);
      return { submissions: subs.data ?? [], files: files.data ?? [], scores: scores.data ?? [] };
    },
  });

  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: ["admin-team-detail", team.team_id] });
    };
  }, [queryClient, team.team_id]);

  if (isLoading) return <p className="mt-6 text-sm text-muted-foreground">Loading…</p>;

  const entries = data?.submissions ?? [];
  const files = data?.files ?? [];
  const scores = (data?.scores ?? []) as {
    id: string;
    submission_id: string;
    criterion_scores: Record<string, number> | null;
    feedback: string | null;
    submitted: boolean;
    updated_at: string;
    judge: { full_name: string } | null;
  }[];

  return (
    <div className="mt-4 space-y-6">
      <section className="rounded-xl border border-border p-4 text-sm">
        <p>
          <span className="font-semibold">Team ID:</span>{" "}
          <span className="font-mono">{team.team_code ?? "—"}</span>
        </p>
        <p className="mt-1">
          <span className="font-semibold">School:</span> {team.school ?? "—"} ·{" "}
          <span className="font-semibold">Theme:</span> {team.track_name ?? "—"}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Members ({team.member_count}):</span>{" "}
          {team.members.join(", ") || "—"}
        </p>
      </section>

      <section className="space-y-5">
        {entries.map((s) => {
          const subScores = scores.filter((sc) => sc.submission_id === s.id);
          const evaluated = subScores.find((sc) => sc.submitted);
          const total =
            evaluated
              ? Object.values(evaluated.criterion_scores ?? {}).reduce(
                  (a, b) => a + (typeof b === "number" ? b : 0),
                  0,
                )
              : 0;
          return (
            <div key={s.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                <h3 className="text-sm font-semibold">Stage {s.stage} entry</h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    printOnePager(s as never, files.filter((f) => f.submission_id === s.id) as never, {
                      theme: team.track_name ?? null,
                      school: team.school ?? null,
                      teamName: team.team_name ?? null,
                    })
                  }
                >
                  <Download className="mr-1.5 h-4 w-4" /> One-pager
                </Button>
              </div>
              <SubmissionDetails
                submission={s as never}
                files={files.filter((f) => f.submission_id === s.id) as never}
                theme={team.track_name ?? null}
              />
              <div className="rounded-lg border border-border p-3">
                <p className="eyebrow mb-2">Judge scoring</p>
                <div className="space-y-2">
                  {subScores.map((sc) => (
                    <div key={sc.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="font-medium">{sc.judge?.full_name ?? "Judge"}</span>
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-semibold " +
                          (sc.submitted ? "bg-sage/15 text-sage" : "bg-ochre/15 text-ochre")
                        }
                      >
                        {sc.submitted ? `Evaluated · ${total.toFixed(2)}` : "In progress"}
                      </span>
                    </div>
                  ))}
                  {subScores.length === 0 && (
                    <p className="text-xs text-muted-foreground">No judge has opened this entry yet.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground">No entries from this team yet.</p>
        )}
      </section>
    </div>
  );
}
