import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useState } from "react";
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
import { SubmissionDetails } from "@/components/submission-details";

export const Route = createFileRoute("/admin/submissions")({
  head: () => ({
    meta: [{ title: "Submissions manager — Social Innovation Ideathon" }],
  }),
  component: SubmissionsManager,
});

type Row = {
  id: string;
  team_code: string | null;
  title: string | null;
  stage: number;
  status: string;
  updated_at: string;
  team: { name: string; track: { name: string } | null } | null;
};

const PAGE_SIZE = 10;

function SubmissionsManager() {
  const [search, setSearch] = useState("");
  const [trackId, setTrackId] = useState<string>("all");
  const [stage, setStage] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: tracks } = useQuery({
    queryKey: ["public-tracks"],
    queryFn: async () => {
      const { data } = await supabase.from("tracks").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data, isLoading, count } = useQuery({
    queryKey: ["admin-submissions", search, trackId, stage, status, page],
    queryFn: async () => {
      let q = supabase
        .from("submissions")
        .select("id,team_code,title,stage,status,updated_at,team:teams(name,track:tracks(name))", {
          count: "exact",
        })
        .order("updated_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (trackId !== "all") q = q.eq("team.track_id", trackId);
      if (stage !== "all") q = q.eq("stage", Number(stage));
      if (status !== "all") q = q.eq("status", status);
      if (search.trim()) q = q.or(`title.ilike.%${search.trim()}%,team_code.ilike.%${search.trim()}%`);
      const { data: rows, count: c } = await q;
      return { rows: (rows ?? []) as Row[], count: c ?? 0 };
    },
  });

  const totalPages = count ? Math.ceil(count / PAGE_SIZE) : 1;

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Submissions manager</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
          All entries <span className="text-lg font-normal text-muted-foreground">({count ?? 0})</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">View-only inspection of every entry and its scores.</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search title or team code…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
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
          value={stage}
          onValueChange={(v) => {
            setStage(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Stage" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All stages</SelectItem>
            <SelectItem value="1">Stage 1</SelectItem>
            <SelectItem value="2">Stage 2</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading entries…</p>
          ) : (
            <div className="divide-y divide-border">
              {(data?.rows ?? []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{s.title ?? "Untitled"}</p>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-mono">{s.team_code ?? "TEAM"}</span> ·{" "}
                      {s.team?.name ?? "—"} · {s.team?.track?.name ?? "No track"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">Stage {s.stage}</span>
                    <span
                      className={
                        "rounded-full px-2 py-0.5 text-xs font-semibold " +
                        (s.status === "submitted" ? "bg-sage/15 text-sage" : "bg-ochre/15 text-ochre")
                      }
                    >
                      {s.status}
                    </span>
                  </div>
                </button>
              ))}
              {(data?.rows ?? []).length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No entries match these filters.
                </p>
              )}
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
          </span>
          <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}

      <Sheet open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Submission inspection</SheetTitle>
          </SheetHeader>
          {selectedId && <SubmissionInspector submissionId={selectedId} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SubmissionInspector({ submissionId }: { submissionId: string }) {
  const { data } = useQuery({
    queryKey: ["admin-submission", submissionId],
    queryFn: async () => {
      const [sub, files, scores] = await Promise.all([
        supabase.from("submissions").select("*").eq("id", submissionId).maybeSingle(),
        supabase.from("submission_files").select("*").eq("submission_id", submissionId),
        supabase
          .from("scores")
          .select("id,criterion_scores,feedback,submitted,updated_at,judge:profiles(full_name)")
          .eq("submission_id", submissionId),
      ]);
      return {
        submission: sub.data,
        files: files.data ?? [],
        scores: (scores.data ?? []) as {
          id: string;
          criterion_scores: Record<string, number> | null;
          feedback: string | null;
          submitted: boolean;
          updated_at: string;
          judge: { full_name: string } | null;
        }[],
      };
    },
  });

  if (!data?.submission) {
    return <p className="mt-6 text-sm text-muted-foreground">Loading…</p>;
  }

  const total = Object.values(data.scores.find((s) => s.submitted)?.criterion_scores ?? {}).reduce(
    (a, b) => a + (typeof b === "number" ? b : 0),
    0,
  );

  return (
    <div className="mt-4 space-y-6">
      <SubmissionDetails submission={data.submission as never} files={data.files as never} />
      <section className="border-t border-border pt-4">
        <h3 className="eyebrow mb-2">Judge scoring summary</h3>
        <div className="space-y-2.5">
          {data.scores.map((s) => (
            <div key={s.id} className="rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{s.judge?.full_name ?? "Judge"}</p>
                <span
                  className={
                    "rounded-full px-2 py-0.5 text-xs font-semibold " +
                    (s.submitted ? "bg-sage/15 text-sage" : "bg-ochre/15 text-ochre")
                  }
                >
                  {s.submitted ? `Evaluated · ${total.toFixed(2)}` : "In progress"}
                </span>
              </div>
              {s.feedback && <p className="mt-1.5 text-sm text-muted-foreground">{s.feedback}</p>}
            </div>
          ))}
          {data.scores.length === 0 && (
            <p className="text-sm text-muted-foreground">No judge has opened this entry yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
