import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  createStudentAccounts,
  fetchSchoolRoster,
  type CreatedPass,
  type StudentSeed,
} from "@/lib/coordinator-actions";
import { AccessPasses } from "@/components/access-passes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/coordinator/")({
  head: () => ({
    meta: [{ title: "School roster — Social Innovation Ideathon" }],
  }),
  component: CoordinatorPortal,
});

function CoordinatorPortal() {
  const queryClient = useQueryClient();
  const { data: roster, isLoading } = useQuery({
    queryKey: ["school-roster"],
    queryFn: () => fetchSchoolRoster(),
  });

  const [rows, setRows] = useState<StudentSeed[]>([{ full_name: "", email: "", grade: 8, parent_email: "" }]);
  const [busy, setBusy] = useState(false);
  const [passes, setPasses] = useState<CreatedPass[]>([]);

  function updateRow(i: number, patch: Partial<StudentSeed>) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  }

  async function createAccounts() {
    const valid = rows.filter((r) => r.full_name.trim() && r.email.trim());
    if (valid.length === 0) { toast.error("Add at least one student with name and email."); return; }
    setBusy(true);
    try {
      const results = await createStudentAccounts({ data: { students: valid } });
      const ok = results.filter((r) => !r.error);
      const failed = results.filter((r) => r.error);
      if (ok.length) {
        toast.success(`${ok.length} student account${ok.length === 1 ? "" : "s"} created`);
        setPasses((p) => [...p, ...ok]);
      }
      if (failed.length) {
        toast.error(`${failed.length} failed — likely duplicate emails.`);
        setPasses((p) => [...p, ...failed]);
      }
      setRows([{ full_name: "", email: "", grade: 8, parent_email: "" }]);
      queryClient.invalidateQueries({ queryKey: ["school-roster"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Account creation failed");
    }
    setBusy(false);
  }

  async function handleCsv(file: File) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    const start = /name/i.test(lines[0]) ? 1 : 0;
    const seeds: StudentSeed[] = [];
    for (const line of lines.slice(start)) {
      const cols = line.split(/[,;\t]/).map((c) => c.trim());
      if (!cols[0] || !cols[1]) continue;
      seeds.push({
        full_name: cols[0],
        email: cols[1],
        grade: Number(cols[2] || 8) || 8,
        parent_email: cols[3] || "",
      });
    }
    if (!seeds.length) { toast.error("No valid rows found (need name, email, grade columns)."); return; }
    setRows((r) => [...r.filter((x) => x.full_name || x.email), ...seeds]);
    toast.info(`${seeds.length} rows loaded from CSV — review and press "Create accounts".`);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">School coordinator portal</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">My roster</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Register students in bulk and hand out access passes.
        </p>
      </header>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="font-display text-lg">Quick student entry</CardTitle>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent">
            <FileSpreadsheet className="h-4 w-4" /> CSV upload
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleCsv(f);
                e.target.value = "";
              }}
            />
          </label>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {rows.map((row, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1.4fr_72px_1.4fr_36px]">
              <Input
                placeholder="Full name"
                value={row.full_name}
                onChange={(e) => updateRow(i, { full_name: e.target.value })}
              />
              <Input
                placeholder="Email"
                type="email"
                value={row.email}
                onChange={(e) => updateRow(i, { email: e.target.value })}
              />
              <Input
                type="number"
                min={8}
                max={12}
                value={row.grade}
                onChange={(e) => updateRow(i, { grade: Number(e.target.value) || 8 })}
              />
              <Input
                placeholder="Parent email (optional)"
                type="email"
                value={row.parent_email ?? ""}
                onChange={(e) => updateRow(i, { parent_email: e.target.value })}
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
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRows((r) => [...r, { full_name: "", email: "", grade: 8, parent_email: "" }])}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add row
            </Button>
            <Button className="bg-clay hover:bg-clay/90" size="sm" onClick={createAccounts} disabled={busy}>
              {busy ? "Creating…" : "Create accounts"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            CSV columns: name, email, grade, parent email (optional). Accounts are created immediately
            with a temporary password.
          </p>
        </CardContent>
      </Card>

      <AccessPasses passes={passes} />

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">
            Registered students ({roster?.length ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading roster…</p>
          ) : (
            <div className="divide-y divide-border">
              {(roster ?? []).map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div>
                    <p className="text-sm font-semibold">{s.full_name}</p>
                    <p className="text-xs text-muted-foreground">{s.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.grade && (
                      <span className="rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-semibold text-clay">
                        Grade {s.grade}
                      </span>
                    )}
                    {s.parent_email && (
                      <span className="text-xs text-muted-foreground">Parent: {s.parent_email}</span>
                    )}
                  </div>
                </div>
              ))}
              {(roster ?? []).length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No students yet — add your first batch above.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
