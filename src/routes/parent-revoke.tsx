import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand, OrgFooter } from "@/components/app-nav";
import { Button } from "@/components/ui/button";
import { createPageHead } from "@/lib/brand-meta";

export const Route = createFileRoute("/parent-revoke")({
  validateSearch: (search: Record<string, unknown>) => ({
    token: typeof search["token"] === "string" ? search["token"] : undefined,
  }),
  head: () =>
    createPageHead(
      "Parent consent",
      "Parents can review their child's participation details and withdraw consent using the secure link provided.",
    ),
  component: ParentRevoke,
});

type RevokeInfo = {
  student_name: string;
  school_name: string | null;
  grade: number | null;
  restricted: boolean;
};

function ParentRevoke() {
  const { token } = Route.useSearch();
  const [info, setInfo] = useState<RevokeInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<"details" | "confirm" | "done">("details");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setLoading(false);
        return;
      }
      const { data, error: err } = await supabase.rpc("parent_revoke_info", { p_token: token });
      if (cancelled) return;
      setLoading(false);
      if (err) {
        setError("This link could not be verified. Please use the exact link from your notification email.");
        return;
      }
      setInfo((data as RevokeInfo | null) ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function revoke() {
    if (!token) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("revoke_parent_access", { p_token: token });
    setBusy(false);
    if (err || !data) {
      setError(
        err?.message ??
          "This link is invalid or has already been used. Contact the organisers if you believe this is a mistake.",
      );
      return;
    }
    setStep("done");
  }

  const firstName = info?.student_name?.split(" ")[0] ?? "your child";

  return (
    <div className="flex min-h-screen flex-col bg-linen">
      <header className="mx-auto w-full max-w-3xl px-5 py-5">
        <div className="flex items-center justify-between">
          <Brand />
          {step === "confirm" && (
            <button
              onClick={() => setStep("details")}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-clay underline underline-offset-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-5 pb-10">
        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-clay" />
          </div>
        ) : step === "done" ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage/12 text-sage">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="font-display mt-4 text-2xl font-semibold text-forest">
              Consent withdrawn
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {firstName === "your child" ? "The student's" : `${info?.student_name}'s`} account has
              been restricted. They can no longer sign in or submit entries for the Social
              Innovation Ideathon.
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              If this was a mistake, contact your school coordinator to restore access.
            </p>
          </div>
        ) : !token || (!info && error) ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/12 text-destructive">
              <ShieldX className="h-5 w-5" />
            </span>
            <h1 className="font-display mt-4 text-2xl font-semibold text-forest">Link not valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {error ??
                "This link is missing its access token. Please use the exact link from your notification email."}
            </p>
          </div>
        ) : !info ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <h1 className="font-display text-2xl font-semibold text-forest">Link not valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This withdrawal link is invalid or has already been used. Contact the organisers if
              you believe this is a mistake.
            </p>
          </div>
        ) : info.restricted ? (
          <div className="rounded-2xl border border-border bg-card p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage/12 text-sage">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <h1 className="font-display mt-4 text-2xl font-semibold text-forest">
              Already withdrawn
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Consent for {info.student_name}'s participation has already been withdrawn. Contact
              the school coordinator if you'd like access restored.
            </p>
          </div>
        ) : step === "details" ? (
          <DetailsView info={info} onContinue={() => setStep("confirm")} />
        ) : (
          <ConfirmView
            info={info}
            busy={busy}
            error={error}
            onConfirm={revoke}
            onCancel={() => setStep("details")}
          />
        )}
      </main>
      <OrgFooter />
    </div>
  );
}

function DetailsView({ info, onContinue }: { info: RevokeInfo; onContinue: () => void }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-clay/12 text-clay">
        <ShieldAlert className="h-5 w-5" />
      </span>
      <h1 className="font-display mt-4 text-2xl font-semibold text-forest">
        Withdraw participation?
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        You've followed the withdrawal link from your parent notification email. This page shows the
        participation record linked to your family — nothing has been changed yet.
      </p>

      <dl className="mt-5 divide-y divide-border rounded-xl border border-border bg-linen/60 px-4 text-sm">
        {[
          ["Student", info.student_name],
          ["School", info.school_name ?? "—"],
          ["Class", info.grade ? `Grade ${info.grade}` : "—"],
          ["Competition", "Social Innovation Ideathon"],
          ["Organizer", "ICORG"],
          ["Participation fee", "Free"],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-2.5">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="text-right font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        If you choose to withdraw, <span className="font-medium text-foreground">{info.student_name}</span>{" "}
        will immediately lose access to the platform and can no longer take part in the ideathon.
      </p>
      <Button className="mt-5 w-full bg-clay hover:bg-clay/90" onClick={onContinue}>
        Continue to withdraw consent
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        No action is needed if you're happy for {info.student_name.split(" ")[0]} to participate.
      </p>
    </div>
  );
}

function ConfirmView({
  info,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  info: RevokeInfo;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-destructive/30 bg-card p-6">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-destructive/12 text-destructive">
        <ShieldAlert className="h-5 w-5" />
      </span>
      <h1 className="font-display mt-4 text-2xl font-semibold text-forest">
        Please confirm — this can't be undone here
      </h1>
      <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        <p className="font-semibold">Withdrawing will:</p>
        <ul className="mt-1.5 list-disc space-y-1 pl-4">
          <li>
            Immediately restrict <span className="font-medium">{info.student_name}</span>'s account
            {info.school_name ? ` at ${info.school_name}` : ""}
          </li>
          <li>Sign them out of the ideathon platform</li>
          <li>Stop any further submissions from that account</li>
        </ul>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        If you did not intend to withdraw, simply close this page — their participation continues as
        normal. To restore access later, contact your school coordinator.
      </p>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <div className="mt-5 grid gap-2.5">
        <Button variant="destructive" className="w-full" onClick={onConfirm} disabled={busy}>
          {busy ? "Processing…" : "Yes, withdraw consent"}
        </Button>
        <Button variant="outline" className="w-full" onClick={onCancel} disabled={busy}>
          Cancel — keep my child's participation
        </Button>
      </div>
    </div>
  );
}
