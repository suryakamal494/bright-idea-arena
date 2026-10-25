import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/auth";
import { useResolvedAttachments } from "@/lib/attachments";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { SubmissionDetails } from "@/components/submission-details";

export const Route = createFileRoute("/judge/evaluate/$submissionId")({
  head: () => ({
    meta: [{ title: "Evaluation sheet — Social Innovation Ideathon" }],
  }),
  component: EvaluationSheet,
});

type Criterion = { id: string; name: string; description: string | null; max_score: number };
type FileRow = { id: string; name: string; url: string; title?: string | null };

function EvaluationSheet() {
  const { submissionId } = Route.useParams();
  const queryClient = useQueryClient();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "submitted">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedId = useRef<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["judge-eval", submissionId],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Sign in required");
      const { data: sub } = await supabase
        .from("submissions")
        .select("*, team:teams(track_id, track:tracks(name))")
        .eq("id", submissionId)
        .maybeSingle();
      const trackId = (sub?.team as { track_id?: string } | null)?.track_id;
      const [filesRes, existingRes, criteriaRes] = await Promise.all([
        supabase.from("submission_files").select("id,name,url,title").eq("submission_id", submissionId),
        supabase
          .from("scores")
          .select("id,criterion_scores,feedback,submitted")
          .eq("submission_id", submissionId)
          .eq("judge_id", user.id)
          .maybeSingle(),
        supabase
          .from("rubric_criteria")
          .select("id,name,description,max_score,track_id")
          .or(`track_id.is.null,track_id.eq.${trackId ?? "00000000-0000-0000-0000-000000000000"}`)
          .order("sort_order"),
      ]);
      return {
        submission: sub,
        files: (filesRes.data ?? []) as FileRow[],
        existing: existingRes.data,
        criteria: (criteriaRes.data ?? []) as Criterion[],
        judgeId: user.id,
      };
    },
  });

  // Load existing score row once.
  useEffect(() => {
    if (!data?.existing || loadedId.current === submissionId) return;
    loadedId.current = submissionId;
    setScores((data.existing.criterion_scores as Record<string, number>) ?? {});
    setFeedback(data.existing.feedback ?? "");
    setSaveState(data.existing.submitted ? "submitted" : "saved");
  }, [data, submissionId]);

  const urls = (data?.files ?? []).map((f) => f.url);
  const resolved = useResolvedAttachments(urls);

  async function persist(submit: boolean) {
    if (!data) return;
    setSaveState("saving");
    const payload = {
      submission_id: submissionId,
      judge_id: data.judgeId,
      criterion_scores: scores,
      feedback: feedback.trim() || null,
      submitted: submit,
    };
    const { error } = await supabase
      .from("scores")
      .upsert(payload, { onConflict: "submission_id,judge_id" });
    if (error) {
      toast.error(error.message);
      setSaveState("idle");
      return;
    }
    setSaveState(submit ? "submitted" : "saved");
    if (submit) {
      toast.success("Score submitted");
      queryClient.invalidateQueries({ queryKey: ["judge-queue"] });
    }
  }

  function onScoreChange(id: string, value: number) {
    setScores((s) => ({ ...s, [id]: value }));
    if (saveState === "submitted") return; // locked after submit
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(false).catch(console.error), 1200);
  }

  if (isLoading || !data?.submission) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading evaluation sheet…</p>;
  }

  const sub = data.submission;
  const locked = saveState === "submitted";
  const total = data.criteria.reduce((sum, c) => sum + (scores[c.id] ?? 0), 0);
  const maxTotal = data.criteria.reduce((sum, c) => sum + c.max_score, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/judge" className="text-sm text-clay underline underline-offset-2">
            ← Back to queue
          </Link>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-full bg-forest px-3 py-1 font-mono text-sm font-semibold text-linen">
              {sub.team_code ?? "TEAM"}
            </span>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
              {(sub.team as { track?: { name?: string } } | null)?.track?.name}
            </span>
          </div>
        </div>
        {locked ? (
          <span className="flex items-center gap-1.5 rounded-full bg-sage/15 px-3 py-1 text-sm font-semibold text-sage">
            <Check className="h-4 w-4" /> Score submitted · {total.toFixed(2)}/{maxTotal}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {saveState === "saving" ? (
              <Loader2 className="inline h-4 w-4 animate-spin" />
            ) : null}{" "}
            Draft total {total.toFixed(2)}/{maxTotal} · auto-saves
          </span>
        )}
      </div>

      {/* Dual-pane: stacked on mobile, split on desktop */}
      <div className="grid items-start gap-5 lg:grid-cols-2">
        {/* Left pane: full submission content */}
        <div className="rounded-2xl border border-border bg-card p-5">
          <SubmissionDetails
            submission={sub as never}
            files={data.files as never}
            theme={(sub.team as { track?: { name?: string } } | null)?.track?.name}
          />
        </div>

        {/* Right pane: sticky rubric */}
        <div className="rounded-2xl border border-border bg-card p-5 lg:sticky lg:top-20">
          <h2 className="font-display text-xl font-semibold text-forest">Evaluation rubric</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Sliders snap to 0.25-point steps. Scores auto-save as drafts.
          </p>
          <div className="mt-4 space-y-5">
            {data.criteria.map((c) => (
              <div key={c.id}>
                <div className="flex items-baseline justify-between gap-2">
                  <Label className="text-sm font-semibold">{c.name}</Label>
                  <span className="font-mono text-sm font-semibold text-forest">
                    {(scores[c.id] ?? 0).toFixed(2)}
                    <span className="text-muted-foreground"> / {c.max_score}</span>
                  </span>
                </div>
                {c.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>
                )}
                <Slider
                  className="mt-2.5"
                  value={[scores[c.id] ?? 0]}
                  min={0}
                  max={c.max_score}
                  step={0.25}
                  disabled={locked}
                  onValueChange={(vals) => onScoreChange(c.id, vals[0] ?? 0)}
                />
              </div>
            ))}
          </div>

          <div className="mt-6 space-y-1.5">
            <Label>Qualitative feedback</Label>
            <Textarea
              rows={4}
              value={feedback}
              disabled={locked}
              onChange={(e) => {
                setFeedback(e.target.value);
                if (timer.current) clearTimeout(timer.current);
                timer.current = setTimeout(() => persist(false).catch(console.error), 1200);
              }}
              placeholder="What impressed you? What should the team improve?"
            />
          </div>

          <Button
            className="mt-5 w-full bg-clay hover:bg-clay/90"
            disabled={locked || Object.keys(scores).length < data.criteria.length}
            onClick={() => {
              if (window.confirm("Submit final scores? The entry is marked evaluated.")) {
                persist(true);
              }
            }}
          >
            {locked ? "Evaluated" : "Submit score"}
          </Button>
          {Object.keys(scores).length < data.criteria.length && !locked && (
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Set every criterion before submitting.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
