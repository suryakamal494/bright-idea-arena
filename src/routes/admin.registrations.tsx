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
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/registrations")({
  head: () => ({
    meta: [{ title: "Registrations — Social Innovation Ideathon" }],
  }),
  component: Registrations,
});

type RegistrationRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  grade: number | null;
  school_name: string | null;
  city: string | null;
  parent_email: string | null;
  created_at: string;
  team_id: string | null;
  team_code: string | null;
  team_name: string | null;
  cluster_name: string | null;
};

const PAGE_SIZE = 25;
const GRADES = [8, 9, 10, 11, 12];

function Registrations() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState("all");
  const [school, setSchool] = useState("all");
  const [cluster, setCluster] = useState("all");
  const [page, setPage] = useState(0);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    try {
      const pageSize = 100;
      const all: RegistrationRow[] = [];
      let p = 0;
      for (;;) {
        const { data, error } = await supabase.rpc("admin_registration_directory", {
          p_page: p,
          p_page_size: pageSize,
          ...(search.trim() ? { p_search: search.trim() } : {}),
          ...(grade === "all" ? {} : { p_grade: Number(grade) }),
          ...(school === "all" ? {} : { p_school: school }),
          ...(cluster === "all" ? {} : { p_cluster_id: cluster }),
        });
        if (error) throw error;
        const res = data as unknown as { total: number; rows: RegistrationRow[] };
        all.push(...res.rows);
        if (res.rows.length < pageSize || all.length >= res.total || all.length >= 5000) break;
        p++;
      }
      const header = ["student_name", "class_grade", "school", "city", "contact_email", "phone", "parent_email", "team_id", "team_name", "registered_at"];
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const csv = [
        header.join(","),
        ...all.map((r) =>
          [
            r.full_name,
            r.grade ?? "",
            r.school_name ?? "",
            r.city ?? "",
            r.email,
            r.phone ?? "",
            r.parent_email ?? "",
            r.team_code ?? "",
            r.team_name ?? "",
            r.created_at?.slice(0, 10) ?? "",
          ]
            .map(esc)
            .join(","),
        ),
      ].join("\n");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `registrations-${new Date().toISOString().slice(0, 10)}.csv`;
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

  // Distinct school list for the filter (admin RLS allows reading profiles).
  const { data: schools } = useQuery({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("school_name").order("school_name");
      const set = new Set<string>();
      for (const r of data ?? []) if (r.school_name) set.add(r.school_name);
      return [...set];
    },
    staleTime: 60_000,
  });

  const { data: clusters } = useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
    staleTime: 60_000,
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-registrations", search, grade, school, cluster, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_registration_directory", {
        p_page: page,
        p_page_size: PAGE_SIZE,
        ...(search.trim() ? { p_search: search.trim() } : {}),
        ...(grade === "all" ? {} : { p_grade: Number(grade) }),
        ...(school === "all" ? {} : { p_school: school }),
        ...(cluster === "all" ? {} : { p_cluster_id: cluster }),
      });
      if (error) throw error;
      return data as unknown as { total: number; rows: RegistrationRow[] };
    },
    placeholderData: keepPreviousData,
  });

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Registrations</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
          Registered students <span className="text-lg font-normal text-muted-foreground">({total})</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Every student who signed up, with contact details and the team they joined. New sign-ups
          appear here automatically.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search student, school, email or phone…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <Select
          value={grade}
          onValueChange={(v) => {
            setGrade(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-32">
            <SelectValue placeholder="Class" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All classes</SelectItem>
            {GRADES.map((g) => (
              <SelectItem key={g} value={String(g)}>
                Class {g}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={school}
          onValueChange={(v) => {
            setSchool(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="School" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All schools</SelectItem>
            {(schools ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-4 py-3.5">
                  <div className="space-y-1.5">
                    <Skeleton className="h-4 w-44" />
                    <Skeleton className="h-3 w-64" />
                  </div>
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <div className={isFetching ? "opacity-70 transition-opacity" : "transition-opacity"}>
              <div className="hidden grid-cols-[minmax(0,1.1fr)_60px_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_90px_minmax(0,1fr)_120px] gap-3 border-b border-border px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
                <span>Student</span>
                <span>Class</span>
                <span>School · city</span>
                <span>Cluster</span>
                <span>Contact email</span>
                <span>Phone</span>
                <span>Parent email</span>
                <span>Team</span>
              </div>
              <div className="divide-y divide-border">
                {(data?.rows ?? []).map((r) => (
                  <div
                    key={r.id}
                    className="grid grid-cols-1 gap-1.5 px-4 py-3 lg:grid-cols-[minmax(0,1.1fr)_60px_minmax(0,1fr)_minmax(0,0.7fr)_minmax(0,1.2fr)_90px_minmax(0,1fr)_120px] lg:items-center lg:gap-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{r.full_name || "—"}</span>
                      <span className="block truncate text-xs text-muted-foreground lg:hidden">
                        {r.school_name ?? "No school"}
                        {r.city ? ` · ${r.city}` : ""} · {r.email}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground lg:text-center">
                      {r.grade ? `Class ${r.grade}` : "—"}
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                      {r.school_name ?? "No school"}
                      {r.city ? ` · ${r.city}` : ""}
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                      {r.cluster_name ?? "—"}
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                      {r.email}
                    </span>
                    <span className="hidden truncate text-xs text-muted-foreground lg:block">
                      {r.phone ?? "—"}
                    </span>
                    <span className="hidden min-w-0 truncate text-xs text-muted-foreground lg:block">
                      {r.parent_email ?? "—"}
                    </span>
                    <span className="text-xs lg:text-right">
                      {r.team_code ? (
                        <Badge variant="outline" className="font-mono text-[11px] font-semibold text-forest">
                          {r.team_code}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Not in a team</span>
                      )}
                    </span>
                  </div>
                ))}
                {(data?.rows ?? []).length === 0 && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    No registrations match these filters.
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
            Next <ChevronRight className="mr-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
