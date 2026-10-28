import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Star, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Textarea } from "@/components/ui/textarea";

export type ReviewStatus = "unreviewed" | "marked" | "not_selected";

export const REVIEW_LABEL: Record<ReviewStatus, string> = {
  unreviewed: "Unreviewed",
  marked: "Marked for review",
  not_selected: "Not selected",
};

export async function saveReview(teamId: string, patch: { status?: ReviewStatus; notes?: string }) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await supabase.from("team_reviews").upsert(
    { team_id: teamId, ...patch, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() },
    { onConflict: "team_id" },
  );
  if (error) throw error;
}

/** Two compact buttons. Clicking the active one returns the team to Unreviewed. */
export function ReviewButtons({
  teamId,
  status,
  onChanged,
  size = "sm",
}: {
  teamId: string;
  status: ReviewStatus;
  onChanged?: (s: ReviewStatus) => void;
  size?: "sm" | "md";
}) {
  const qc = useQueryClient();
  const [current, setCurrent] = useState<ReviewStatus>(status);
  useEffect(() => setCurrent(status), [status]);

  async function set(next: ReviewStatus, e: React.MouseEvent) {
    e.stopPropagation();
    const value = current === next ? "unreviewed" : next;
    const prev = current;
    setCurrent(value);
    try {
      await saveReview(teamId, { status: value });
      onChanged?.(value);
      qc.invalidateQueries({ queryKey: ["admin-directory"] });
      qc.invalidateQueries({ queryKey: ["admin-results"] });
    } catch (err) {
      setCurrent(prev);
      toast.error((err as Error).message);
    }
  }

  const pad = size === "md" ? "px-3 py-1.5 text-sm" : "px-2 py-1 text-xs";
  return (
    <span className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-pressed={current === "marked"}
        title="Marked for review"
        onClick={(e) => set("marked", e)}
        className={`inline-flex items-center gap-1 rounded-md border font-semibold transition-colors ${pad} ${
          current === "marked"
            ? "border-sage bg-sage text-primary-foreground"
            : "border-border text-muted-foreground hover:border-sage hover:text-sage"
        }`}
      >
        <Star className="h-3.5 w-3.5" />
        {size === "md" ? "Marked for review" : "Review"}
      </button>
      <button
        type="button"
        aria-pressed={current === "not_selected"}
        title="Not selected"
        onClick={(e) => set("not_selected", e)}
        className={`inline-flex items-center gap-1 rounded-md border font-semibold transition-colors ${pad} ${
          current === "not_selected"
            ? "border-destructive bg-destructive text-destructive-foreground"
            : "border-border text-muted-foreground hover:border-destructive hover:text-destructive"
        }`}
      >
        <X className="h-3.5 w-3.5" />
        {size === "md" ? "Not selected" : "No"}
      </button>
    </span>
  );
}

/** Internal notes, saved automatically after typing stops. */
export function ReviewNotes({ teamId, initial }: { teamId: string; initial: string | null }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(initial ?? "");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<number | null>(null);
  const latest = useRef(value);

  useEffect(() => () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      void saveReview(teamId, { notes: latest.current });
    }
  }, [teamId]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="eyebrow">Internal notes</p>
        <span className="text-[11px] text-muted-foreground">
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved" : "Only admins see this"}
        </span>
      </div>
      <Textarea
        rows={4}
        placeholder="Your comments on this entry…"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          setValue(v);
          latest.current = v;
          setState("saving");
          if (timer.current) window.clearTimeout(timer.current);
          timer.current = window.setTimeout(async () => {
            timer.current = null;
            try {
              await saveReview(teamId, { notes: v });
              setState("saved");
              qc.invalidateQueries({ queryKey: ["admin-directory"] });
            } catch (err) {
              setState("idle");
              toast.error((err as Error).message);
            }
          }, 700);
        }}
      />
    </div>
  );
}
