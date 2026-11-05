import { Download, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/app-nav";

export type AccessPass = {
  full_name: string;
  username: string;
  email: string;
  password: string;
  grade?: number | null;
  school_name?: string | null;
  error?: string | undefined;
};

function csvCell(v: string | number | null | undefined): string {
  const s = (v ?? "").toString();
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Master credentials sheet — the only way to recover passwords later. */
function downloadCredentialsCsv(passes: AccessPass[]) {
  const ok = passes.filter((p) => !p.error && p.password);
  if (!ok.length) return;
  const lines = [
    ["Student Name", "Grade", "Username", "Password", "Contact Email", "School"],
    ...ok.map((p) => [p.full_name, p.grade ?? "", p.username, p.password, p.email, p.school_name ?? ""]),
  ];
  const csv = "\ufeff" + lines.map((l) => l.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const school = (ok[0]?.school_name ?? "students").toString().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  a.href = url;
  a.download = `${school || "students"}-student-credentials.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Printable student access passes for the school coordinator portal. */
export function AccessPasses({
  passes,
  onClear,
}: {
  passes: AccessPass[];
  onClear?: () => void;
}) {
  if (passes.length === 0) return null;
  return (
    <div>
      <div className="no-print mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {passes.length} access pass{passes.length === 1 ? "" : "es"} ready — print and hand out in class.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadCredentialsCsv(passes)}>
            <Download className="mr-2 h-4 w-4" /> Download CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" /> Print passes
          </Button>
          {onClear && (
            <Button variant="ghost" size="sm" aria-label="Clear printed passes" onClick={onClear}>
              <X className="mr-1.5 h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </div>
      <p className="no-print mb-3 rounded-md border border-ochre/30 bg-ochre/10 px-3 py-2 text-xs text-ochre">
        Download the CSV or print the passes now — passwords are stored securely and cannot be
        retrieved once you clear these passes or close this browser session.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {passes.map((p, i) => (
          <div
            key={`${p.email}-${i}`}
            className={
              "rounded-xl border-2 p-4 break-inside-avoid " +
              (p.error ? "border-destructive/60 bg-destructive/5" : "border-forest/80 bg-white")
            }
          >
            {p.error && (
              <p className="mb-2 rounded-md bg-destructive/10 px-2 py-1 text-xs font-semibold text-destructive">
                {p.error}
              </p>
            )}
            <div className="flex items-start justify-between border-b border-dashed border-border pb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-forest text-[11px] font-bold text-linen">
                  SI
                </span>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-forest">
                  Social Innovation Ideathon
                  <div className="text-[9px] font-normal text-muted-foreground">Student access pass</div>
                </div>
              </div>
              {p.grade && (
                <span className="rounded-full bg-clay/10 px-2 py-0.5 text-[10px] font-semibold text-clay">
                  Grade {p.grade}
                </span>
              )}
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <p className="font-semibold text-foreground">{p.full_name}</p>
              <p className="text-xs text-muted-foreground">
                Username: <span className="font-mono font-medium text-foreground">{p.username}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">Contact email: <span className="font-mono">{p.email}</span></p>
              {p.school_name && <p className="text-xs text-muted-foreground">{p.school_name}</p>}
              <div className="mt-2 rounded-md bg-muted px-2.5 py-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Password</span>
                <p className="font-mono text-sm font-semibold text-forest">{p.password}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
