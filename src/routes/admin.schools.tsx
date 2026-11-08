import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchClusters } from "@/lib/team";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createPageHead } from "@/lib/brand-meta";

export const Route = createFileRoute("/admin/schools")({
  head: () => createPageHead("Registered schools", "View registered schools, coordinator contacts, student counts, and submission progress."),
  component: Schools,
});

type SchoolRow = {
  school_name: string;
  coordinator_name: string | null;
  coordinator_phone: string | null;
  coordinator_email: string | null;
  city: string | null;
  cluster_name: string | null;
  students: number;
  teams: number;
  stage1_submitted: number;
  stage1_teams: number;
  stage2_submitted: number;
  stage2_teams: number;
};

type Counts = {
  schools: number;
  students: number;
  teams: number;
  stage1_teams: number;
  stage1_submitted: number;
  stage2_teams: number;
  stage2_submitted: number;
};

const PAGE_SIZE = 25;

function Schools() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [cluster, setCluster] = useState("all");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  const { data: stageCount = 2 } = useQuery({
    queryKey: ["competition-stage-count"],
    queryFn: async () => {
      const { data } = await supabase.from("competition_settings").select("stage_count").eq("id", 1).maybeSingle();
      return data?.stage_count ?? 2;
    },
  });
  const twoStages = stageCount === 2;

  async function exportCsv() {
    setExporting(true);
    try {
      const pageSize = 100;
      const all: SchoolRow[] = [];
      let p = 0;
      for (;;) {
        const { data, error } = await supabase.rpc("admin_schools_directory", {
          p_page: p,
          p_page_size: pageSize,
          ...(search.trim() ? { p_search: search.trim() } : {}),
          ...(cluster === "all" ? {} : { p_cluster_id: cluster }),
        });
        if (error) throw error;
        const res = data as unknown as { total: number; rows: SchoolRow[] };
        all.push(...res.rows);
        if (res.rows.length < pageSize || all.length >= res.total || all.length >= 5000) break;
        p++;
      }
      const header = [
        "School",
        "City",
        "Cluster",
        "Coordinator",
        "Coordinator phone",
        "Coordinator email",
        "Students registered",
        "Teams formed",
        "Stage 1 teams",
        "Stage 1 submitted",
        ...(twoStages ? ["Stage 2 teams", "Stage 2 submitted"] : []),
      ];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        header.join(","),
        ...all.map((r) =>
          [
            r.school_name,
            r.city ?? "",
            r.cluster_name ?? "",
            r.coordinator_name ?? "",
            r.coordinator_phone ?? "",
            r.coordinator_email ?? "",
            r.students,
            r.teams,
            r.stage1_teams,
            r.stage1_submitted,
            ...(twoStages ? [r.stage2_teams, r.stage2_submitted] : []),
          ]
            .map(esc)
            .join(","),
        ),
      ].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `schools-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const { data: clusters } = useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
    staleTime: 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-schools-directory", search, cluster, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_schools_directory", {
        p_page: page,
        p_page_size: PAGE_SIZE,
        ...(search.trim() ? { p_search: search.trim() } : {}),
        ...(cluster === "all" ? {} : { p_cluster_id: cluster }),
      });
      if (error) throw error;
      return data as unknown as { total: number; counts: Counts; rows: SchoolRow[] };
    },
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const counts = data?.counts;

  const kpis = [
    { label: "Schools", value: counts?.schools ?? 0 },
    { label: "Students", value: counts?.students ?? 0 },
    { label: "Teams", value: counts?.teams ?? 0 },
    {
      label: twoStages ? "Stage 1 submitted" : "Stage 1 submitted",
      value: counts ? `${counts.stage1_submitted}/${counts.stage1_teams}` : "—",
    },
    ...(twoStages
      ? [
          {
            label: "Stage 2 submitted",
            value: counts ? `${counts.stage2_submitted}/${counts.stage2_teams}` : "—",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Schools</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
          Registered schools <span className="text-lg font-normal text-muted-foreground">({total})</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One row per registered school, with its coordinator, student count and submission progress.
        </p>
      </header>

      {counts && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <Card key={k.label} className="py-4">
              <CardContent className="px-4">
                <p className="text-2xl font-semibold text-forest">{k.value}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{k.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search school, city or coordinator…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        {(clusters ?? []).length > 0 && (
          <Select
            value={cluster}
            onValueChange={(v) => {
              setCluster(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Cluster" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clusters</SelectItem>
              {(clusters ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" disabled={exporting} onClick={exportCsv} className="ml-auto">
          <Download className="mr-1.5 h-4 w-4" />
          {exporting ? "Preparing…" : "Export CSV"}
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </div>
          ) : (
            <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
              <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_70px_70px_100px_100px] gap-3 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <span>School · city</span>
                <span>Coordinator · contact</span>
                <span>Cluster</span>
                <span className="text-center">Students</span>
                <span className="text-center">Teams</span>
                <span className="text-center">Stage 1</span>
                {twoStages && <span className="text-center">Stage 2</span>}
              </div>
              <div className="divide-y divide-border">
                {(data?.rows ?? []).map((r) => (
                  <div
                    key={r.school_name}
                    className="grid grid-cols-1 gap-1.5 px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.1fr)_minmax(0,0.7fr)_70px_70px_100px_100px] lg:items-center lg:gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{r.school_name}</span>
                      <span className="block truncate text-xs text-muted-foreground lg:hidden">
                        {r.coordinator_name ?? "No coordinator"}
                        {r.city ? ` · ${r.city}` : ""}
                      </span>
                    </span>
                    <span className="hidden min-w-0 text-xs text-muted-foreground lg:block">
                      <span className="block truncate">{r.coordinator_name ?? "—"}</span>
                      <span className="block truncate">
                        {r.coordinator_phone ?? "—"}
                        {r.coordinator_email ? ` · ${r.coordinator_email}` : ""}
                      </span>
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                      {r.cluster_name ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground lg:text-center">{r.students}</span>
                    <span className="text-xs text-muted-foreground lg:text-center">{r.teams}</span>
                    <span className="text-xs lg:text-center">
                      <span className="lg:hidden">Stage 1: </span>
                      {r.stage1_submitted}/{r.stage1_teams}
                    </span>
                    {twoStages && (
                      <span className="text-xs lg:text-center">
                        <span className="lg:hidden">Stage 2: </span>
                        {r.stage2_submitted}/{r.stage2_teams}
                      </span>
                    )}
                  </div>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No schools match these filters.
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
    </div>
  );
}
