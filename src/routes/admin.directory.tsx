import { useEffect, useRef, useState } from "react";
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

export const Route = createFileRoute("/admin/directory")({
  head: () => ({
    meta: [{ title: "Students & teams directory — Social Innovation Ideathon" }],
  }),
  component: TeamDirectory,
});

type DirectoryRow = {
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
};

const PAGE_SIZE = 25;

function TeamDirectory() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [trackId, setTrackId] = useState("all");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [selectedTeam, setSelectedTeam] = useState<DirectoryRow | null>(null);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const pageSize = 100;
      const all: DirectoryRow[] = [];
      let page = 0;
      for (;;) {
        const { data, error } = await supabase.rpc("admin_team_directory", {
          p_page: page,
          p_page_size: pageSize,
          ...(search.trim() ? { p_search: search.trim() } : {}),
          ...(trackId === "all" ? {} : { p_track_id: trackId }),
          ...(status === "all" ? {} : { p_status: status }),
        });
        if (error) throw error;
        const res = data as unknown as { total: number; rows: DirectoryRow[] };
        all.push(...res.rows);
        if (res.rows.length < pageSize || all.length >= res.total || all.length >= 5000) break;
        page++;
      }
      const header = ["team_code", "team_name", "theme", "school", "member_count", "members", "stage1", "stage2"];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        header.join(","),
        ...all.map((r) =>
          [
            r.team_code,
            r.team_name,
            r.track_name,
            r.school,
            r.member_count,
            (r.members ?? []).join("; "),
            r.s1_status ?? "",
            r.s2_status ?? "",
          ]
            .map(esc)
            .join(","),
        ),
      ].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `teams-and-students-${new Date().toISOString().slice(0, 10)}.csv`;
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
    queryKey: ["admin-directory", search, trackId, status, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_team_directory", {
        p_page: page,
        p_page_size: PAGE_SIZE,
        ...(search.trim() ? { p_search: search.trim() } : {}),
        ...(trackId === "all" ? {} : { p_track_id: trackId }),
        p_status: status,
      });
      if (error) throw error;
      return data as unknown as { total: number; rows: DirectoryRow[] };
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
        <p className="eyebrow">Students &amp; teams</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
          Team directory <span className="text-lg font-normal text-muted-foreground">({total})</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every registered team with its school, roster and stage status. Pages are served
          server-side, 25 teams at a time.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search team code, name, school or student…"
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
            <SelectValue placeholder="Track" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tracks</SelectItem>
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
              <div className="hidden grid-cols-[130px_minmax(0,1.2fr)_minmax(0,1fr)_90px_90px_110px] gap-3 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <span>Team ID</span>
                <span>Team</span>
                <span>School · track</span>
                <span className="text-center">Members</span>
                <span className="text-center">Stage 1</span>
                <span className="text-center">Stage 2</span>
              </div>
              <div className="divide-y divide-border">
                {(data?.rows ?? []).map((r) => (
                  <button
                    key={r.team_id}
                    onClick={() => setSelectedTeam(r)}
                    className="grid w-full grid-cols-1 gap-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 lg:grid-cols-[130px_minmax(0,1.2fr)_minmax(0,1fr)_90px_90px_110px] lg:items-center lg:gap-3"
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
                      {r.school ?? "No school"} · {r.track_name ?? "No track"}
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
                  </button>
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
          {selectedTeam && <TeamDetail team={selectedTeam} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function TeamDetail({ team }: { team: DirectoryRow }) {
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
              .select("id,criterion_scores,feedback,submitted,updated_at,judge:profiles(full_name)")
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

  return (
    <div className="mt-4 space-y-6">
      <section className="rounded-xl border border-border p-4 text-sm">
        <p>
          <span className="font-semibold">Team ID:</span>{" "}
          <span className="font-mono">{team.team_code ?? "—"}</span>
        </p>
        <p className="mt-1">
          <span className="font-semibold">School:</span> {team.school ?? "—"} ·{" "}
          <span className="font-semibold">Track:</span> {team.track_name ?? "—"}
        </p>
        <p className="mt-1">
          <span className="font-semibold">Members ({team.member_count}):</span>{" "}
          {team.members.join(", ") || "—"}
        </p>
      </section>
      <section className="space-y-4">
        {(data?.submissions ?? []).map((s) => (
          <SubmissionDetails
            key={s.id}
            submission={s as never}
            files={(data?.files ?? []).filter((f) => f.submission_id === s.id) as never}
          />
        ))}
        {(data?.submissions ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">No submissions from this team yet.</p>
        )}
      </section>
    </div>
  );
}
