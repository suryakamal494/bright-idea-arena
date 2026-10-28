import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardPaste, FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  checkBulkAvailability,
  createStudentAccounts,
  type CreatedPass,
  type StudentSeed,
} from "@/lib/coordinator-actions";
import {
  buildRows,
  parsePastedTable,
  COLUMN_KINDS,
  type ColumnKind,
  type ParsedTable,
} from "@/lib/paste-import";
import { fetchClusters, fetchCompetitionSettings } from "@/lib/team";
import { getSessionUser } from "@/lib/auth";
import { AccessPasses } from "@/components/access-passes";
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

export const Route = createFileRoute("/coordinator/")({
  head: () => ({
    meta: [{ title: "My portal — Social Innovation Ideathon" }],
  }),
  component: CoordinatorPortal,
});

type OverviewTeam = {
  team_id: string;
  team_code: string | null;
  team_name: string;
  cluster_name: string | null;
  members: { full_name: string; grade: number | null }[];
  stage1_status: string | null;
  stage2_status: string | null;
  stage1_result: string | null;
  stage2_result: string | null;
};

type OverviewStudent = {
  id: string;
  full_name: string;
  username: string | null;
  grade: number | null;
  email: string;
  phone: string | null;
  team_id: string | null;
  team_code: string | null;
};

const emptyRow = (): StudentSeed => ({
  full_name: "",
  username: "",
  password: "",
  grade: 8,
  email: "",
  mobile: "",
});

const USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type RowErrors = { name?: string; username?: string; password?: string; email?: string; grade?: string };

function rowErrors(row: StudentSeed, all: StudentSeed[], taken: { usernames: string[]; emails: string[] }): RowErrors {
  const errs: RowErrors = {};
  if (!row.full_name.trim()) errs.name = "Name is required";
  const username = row.username.trim().toLowerCase();
  if (!username) errs.username = "Username is required";
  else if (!USERNAME_RE.test(username)) errs.username = "3–30 chars: letters, numbers, . _ -";
  else if (all.filter((x) => x.username.trim().toLowerCase() === username).length > 1)
    errs.username = "Duplicate username in this list";
  else if (taken.usernames.includes(username)) errs.username = "Already used — pick another";
  if (!row.password || row.password.length < 8) errs.password = "Min 8 characters";
  const email = row.email.trim().toLowerCase();
  if (!email) errs.email = "Email is required";
  else if (!EMAIL_RE.test(email)) errs.email = "Enter a valid email";
  else if (all.filter((x) => x.email.trim().toLowerCase() === email).length > 1)
    errs.email = "Duplicate email in this list";
  else if (taken.emails.includes(email)) errs.email = "Already registered — use another";
  if (!row.grade || row.grade < 8 || row.grade > 12) errs.grade = "Grade must be 8–12";
  return errs;
}

function CoordinatorPortal() {
  const queryClient = useQueryClient();
  const { data: overview, isLoading } = useQuery({
    queryKey: ["coordinator-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("coordinator_school_overview");
      if (error) throw new Error(error.message);
      return data as {
        cluster: { id: string | null; name: string | null } | null;
        teams: OverviewTeam[];
        students: OverviewStudent[];
      };
    },
  });
  const { data: clusters } = useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
    staleTime: 60_000,
  });
  const { data: myId } = useQuery({
    queryKey: ["coordinator-me-id"],
    queryFn: async () => (await getSessionUser())?.id ?? null,
  });
  const { data: competition } = useQuery({
    queryKey: ["competition-settings"],
    queryFn: fetchCompetitionSettings,
  });
  const twoStage = (competition?.stage_count ?? 2) === 2;
  const clusterChosen = !!overview?.cluster?.id;
  const clusterRequired = (clusters ?? []).length > 0;

  const [rows, setRows] = useState<StudentSeed[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [passes, setPasses] = useState<CreatedPass[]>([]);
  const [pasteOpen, setPasteOpen] = useState(true);
  const [pasteText, setPasteText] = useState("");
  const [parsed, setParsed] = useState<ParsedTable | null>(null);

  // Inline uniqueness against the platform, refreshed (debounced) as rows change.
  const [taken, setTaken] = useState<{ usernames: string[]; emails: string[] }>({ usernames: [], emails: [] });
  const debounceRef = useRef<number | null>(null);
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const relevant = rows.filter((r) => r.username.trim() || r.email.trim());
    if (!relevant.length) {
      setTaken({ usernames: [], emails: [] });
      return;
    }
    debounceRef.current = window.setTimeout(async () => {
      try {
        const res = await checkBulkAvailability({
          data: { students: relevant.map((r) => ({ username: r.username, email: r.email })) },
        });
        setTaken({ usernames: res.usernames, emails: res.emails });
      } catch {
        /* the server re-validates on create; a failed pre-check must not block */
      }
    }, 600);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [rows]);

  const allErrs = rows.map((row) => rowErrors(row, rows, taken));
  const hasErrors = allErrs.some((e) => e.name || e.username || e.password || e.email || e.grade);

  function updateRow(i: number, patch: Partial<StudentSeed>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  function applyParsed(table: ParsedTable) {
    setParsed(table);
    const derived = buildRows(table.matrix, table.mapping);
    if (!derived.length) {
      toast.error("No rows found — paste the table including its header row if it has one.");
      return;
    }
    setRows(derived);
    toast.info(`${derived.length} row${derived.length === 1 ? "" : "s"} pasted — check the highlighted columns, then press "Create accounts".`);
  }

  function setMappingKind(col: number, kind: ColumnKind) {
    if (!parsed) return;
    const mapping = parsed.mapping.map((m, i) => (i === col ? kind : m));
    const table = { ...parsed, mapping };
    setParsed(table);
    setRows(buildRows(table.matrix, table.mapping));
  }

  async function handlePaste() {
    if (!pasteText.trim()) return;
    applyParsed(parsePastedTable(pasteText));
  }

  async function handleCsv(file: File) {
    const text = await file.text();
    applyParsed(parsePastedTable(text));
  }

  async function createAccounts() {
    if (hasErrors) return;
    setBusy(true);
    try {
      const results = await createStudentAccounts({ data: { students: rows } });
      const ok = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);
      if (ok.length) {
        setPasses((p) => [...p, ...ok]);
        toast.success(`${ok.length} student account${ok.length === 1 ? "" : "s"} created`);
      }
      if (failed.length) {
        setPasses((p) => [...p, ...failed]);
        toast.error(`${failed.length} failed — check the messages on the passes.`);
      }
      setRows([emptyRow()]);
      setParsed(null);
      setPasteText("");
      queryClient.invalidateQueries({ queryKey: ["coordinator-overview"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Account creation failed");
    }
    setBusy(false);
  }

  const students = overview?.students ?? [];
  const teams = overview?.teams ?? [];

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">School coordinator portal</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">My portal</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register students from your Excel sheet and follow their teams and submissions.
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-lg">Add students</CardTitle>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">
              <FileSpreadsheet className="h-4 w-4" /> Upload file
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleCsv(f);
                  e.target.value = "";
                }}
              />
            </label>
            <Button variant="outline" size="sm" onClick={() => setPasteOpen((o) => !o)}>
              <ClipboardPaste className="mr-1.5 h-4 w-4" /> {pasteOpen ? "Hide paste box" : "Paste from Excel"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {pasteOpen && (
            <div className="rounded-lg border border-clay/30 bg-clay/5 p-3">
              <p className="text-sm font-medium text-forest">Paste your Excel table</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Open your sheet, select the table (header row included if you have one), copy, and paste here.
              </p>
              <textarea
                aria-label="Paste student data"
                className="mt-2 h-32 w-full rounded-md border border-input bg-background p-2.5 font-mono text-xs"
                placeholder={"Name\tClass\tUsername\tPassword\tEmail\tMobile"}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
              />
              <div className="mt-2 flex items-center gap-2">
                <Button size="sm" className="bg-clay hover:bg-clay/90" onClick={handlePaste} disabled={!pasteText.trim()}>
                  Paste data
                </Button>
                {parsed && <span className="text-xs text-muted-foreground">{parsed.matrix.length} rows detected</span>}
              </div>
              {parsed && parsed.mapping.length > 1 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {parsed.mapping.map((kind, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0 truncate text-muted-foreground">
                        {parsed.headers?.[i]?.trim() || `Column ${i + 1}`}
                      </span>
                      <Select value={kind} onValueChange={(v) => setMappingKind(i, v as ColumnKind)}>
                        <SelectTrigger className="h-8 flex-1 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLUMN_KINDS.map((k) => (
                            <SelectItem key={k.value} value={k.value}>
                              {k.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="hidden grid-cols-[1.2fr_1fr_100px_1fr_1fr_1fr_36px] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Full name</span><span>Username</span><span>Password</span><span>Class</span><span>Email</span><span>Mobile</span><span />
          </div>
          {rows.map((row, i) => {
            const err = allErrs[i] ?? {};
            const flag = (bad?: string) =>
              bad ? "border-destructive focus-visible:ring-destructive" : undefined;
            return (
              <div key={i} className="space-y-1">
                <div className="grid gap-2 lg:grid-cols-[1.2fr_1fr_100px_1fr_1fr_1fr_36px]">
                  <Input
                    placeholder="Full name"
                    aria-label="Full name"
                    aria-invalid={!!err.name}
                    className={flag(err.name)}
                    value={row.full_name}
                    onChange={(e) => updateRow(i, { full_name: e.target.value })}
                  />
                  <Input
                    placeholder="username"
                    aria-label="Username"
                    aria-invalid={!!err.username}
                    className={flag(err.username)}
                    value={row.username}
                    onChange={(e) => updateRow(i, { username: e.target.value.toLowerCase() })}
                  />
                  <Input
                    placeholder="Password"
                    aria-label="Password"
                    aria-invalid={!!err.password}
                    className={flag(err.password)}
                    value={row.password}
                    onChange={(e) => updateRow(i, { password: e.target.value })}
                  />
                  <Input
                    type="number"
                    min={8}
                    max={12}
                    aria-label="Class grade"
                    aria-invalid={!!err.grade}
                    className={flag(err.grade)}
                    value={row.grade}
                    onChange={(e) => updateRow(i, { grade: Number(e.target.value) || 0 })}
                  />
                  <Input
                    placeholder="student@email"
                    aria-label="Student email"
                    type="email"
                    aria-invalid={!!err.email}
                    className={flag(err.email)}
                    value={row.email}
                    onChange={(e) => updateRow(i, { email: e.target.value })}
                  />
                  <Input
                    placeholder="Mobile (optional)"
                    aria-label="Student mobile"
                    type="tel"
                    value={row.mobile ?? ""}
                    onChange={(e) => updateRow(i, { mobile: e.target.value })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove row"
                    onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {(err.name || err.username || err.password || err.email || err.grade) && (
                  <p className="text-xs text-destructive" role="alert">
                    {[err.name, err.username, err.password, err.email, err.grade].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            );
          })}
          {hasErrors && !busy && (
            <p className="text-sm text-destructive" role="alert">
              Fix the highlighted rows — every student needs a name, username, password (8+ chars), a fresh email and class 8–12.
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((r) => [...r, emptyRow()])}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add row
            </Button>
            <Button className="bg-clay hover:bg-clay/90" size="sm" onClick={createAccounts} disabled={busy || hasErrors}>
              {busy ? "Creating…" : "Create accounts"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Usernames and emails must be new on the platform. Passwords show on the printable passes below.
          </p>
        </CardContent>
      </Card>

      <AccessPasses passes={passes} />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Teams &amp; progress</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : teams.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No teams yet — they appear here as soon as your students form them.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Team ID</th>
                    <th className="py-2 pr-3 font-semibold">Members</th>
                    <th className="py-2 pr-3 font-semibold">Stage 1</th>
                    {twoStage && <th className="py-2 pr-3 font-semibold">Stage 2</th>}
                    <th className="py-2 font-semibold">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {teams.map((t) => (
                    <tr key={t.team_id}>
                      <td className="py-2.5 pr-3 font-mono text-xs font-semibold text-forest">{t.team_code ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">
                        {t.members.map((m) => m.full_name).join(", ")}
                      </td>
                      <td className="py-2.5 pr-3"><StatusPill status={t.stage1_status} /></td>
                      {twoStage && <td className="py-2.5 pr-3"><StatusPill status={t.stage2_status} /></td>}
                      <td className="py-2.5"><ResultPill result={twoStage ? t.stage2_result ?? t.stage1_result : t.stage1_result} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Registered students ({students.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading…</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3 font-semibold">Name</th>
                    <th className="py-2 pr-3 font-semibold">Username</th>
                    <th className="py-2 pr-3 font-semibold">Class</th>
                    <th className="py-2 pr-3 font-semibold">Email</th>
                    <th className="py-2 pr-3 font-semibold">Mobile</th>
                    <th className="py-2 font-semibold">Team ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {students.map((s) => (
                    <tr key={s.id}>
                      <td className="py-2.5 pr-3 font-medium">{s.full_name}</td>
                      <td className="py-2.5 pr-3 font-mono text-xs">{s.username ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        {s.grade ? <span className="rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-semibold text-clay">{s.grade}</span> : "—"}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{s.email}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{s.phone ?? "—"}</td>
                      <td className="py-2.5 font-mono text-xs font-semibold text-forest">{s.team_code ?? "—"}</td>
                    </tr>
                  ))}
                  {students.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-sm text-muted-foreground">
                        No students yet — add your first batch above.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (status === "submitted")
    return <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-semibold text-sage">Submitted</span>;
  if (status === "draft")
    return <span className="rounded-full bg-ochre/15 px-2.5 py-0.5 text-xs font-semibold text-ochre">Draft</span>;
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Not started</span>;
}

function ResultPill({ result }: { result: string | null }) {
  if (result === "shortlisted")
    return <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-semibold text-sage">Shortlisted for Round 2</span>;
  if (result === "selected")
    return <span className="rounded-full bg-sage/15 px-2.5 py-0.5 text-xs font-semibold text-sage">Selected</span>;
  if (result === "not_selected")
    return <span className="rounded-full bg-clay/15 px-2.5 py-0.5 text-xs font-semibold text-clay">Not selected</span>;
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">Not published</span>;
}
