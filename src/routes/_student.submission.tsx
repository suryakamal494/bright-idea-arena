import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { Check, CloudUpload, Loader2, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/auth";
import {
  fetchGlobalStageSettings,
  fetchMyTeam,
  stageOpen,
  type StageSettingRow,
  type SubmissionRow,
  type TeamRow,
} from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Countdown } from "@/components/countdown";
import { SubmissionDetails } from "@/components/submission-details";

export const Route = createFileRoute("/_student/submission")({
  head: () => ({
    meta: [{ title: "My submission — Social Innovation Ideathon" }],
  }),
  component: SubmissionPage,
});

type SaveState = "idle" | "saving" | "saved" | "error";

function SubmissionPage() {
  const { data: team, isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: async () => {
      const user = await getSessionUser();
      return user ? fetchMyTeam(user.id) : null;
    },
  });

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }
  if (!team) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center">
        <h1 className="font-display text-xl font-semibold text-forest">No team yet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Submissions belong to a team. Create or join one first.
        </p>
        <Button asChild className="mt-4 bg-clay hover:bg-clay/90">
          <Link to="/team">Go to team formation</Link>
        </Button>
      </div>
    );
  }
  return <SubmissionWorkspace team={team} />;
}

function useSubmissions(teamId: string) {
  return useQuery({
    queryKey: ["team-submissions", teamId],
    queryFn: async () => {
      const { data } = await supabase
        .from("submissions")
        .select("*")
        .eq("team_id", teamId)
        .order("stage");
      return (data ?? []) as SubmissionRow[];
    },
  });
}

function useSubmissionFiles(teamId: string, submissions: SubmissionRow[]) {
  return useQuery({
    queryKey: ["submission-files", teamId, submissions.map((s) => s.id).join(",")],
    enabled: submissions.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("submission_files")
        .select("*")
        .in(
          "submission_id",
          submissions.map((s) => s.id),
        );
      return data ?? [];
    },
  });
}

function SubmissionWorkspace({ team }: { team: TeamRow }) {
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["stage-settings-global"],
    queryFn: fetchGlobalStageSettings,
  });
  const { data: submissions } = useSubmissions(team.id);
  const files = useSubmissionFiles(team.id, submissions ?? []);
  const list = submissions ?? [];

  const s1 = list.find((s) => s.stage === 1);
  const s2 = list.find((s) => s.stage === 2);
  const s1Open = stageOpen(settings ?? null, 1);
  const s2Open = stageOpen(settings ?? null, 2);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["team-submissions", team.id] });
    queryClient.invalidateQueries({ queryKey: ["submission-files", team.id] });
    queryClient.invalidateQueries({ queryKey: ["my-team"] });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Two-stage submission</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">
          {team.name} · {team.track?.name}
        </h1>
      </header>

      {!s1Open && !s2Open && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive">
          Both submission stages are currently closed. Organisers may reopen them — announcements
          will appear on your dashboard.
        </div>
      )}

      <Tabs defaultValue="1">
        <TabsList className="w-full">
          <TabsTrigger value="1" className="flex-1">
            Stage 1 · Concept note
          </TabsTrigger>
          <TabsTrigger value="2" className="flex-1" disabled={!s2Open && !s2}>
            Stage 2 · Final prototype
          </TabsTrigger>
        </TabsList>
        <TabsContent value="1">
          <StageEditor
            stage={1}
            team={team}
            existing={s1}
            settings={settings ?? null}
            files={(files.data ?? []).filter((f) => f.submission_id === s1?.id)}
            onRefresh={refresh}
          />
        </TabsContent>
        <TabsContent value="2">
          {s1?.status !== "submitted" ? (
            <div className="rounded-xl border border-ochre/40 bg-ochre/10 p-4 text-sm text-ochre">
              Submit your Stage 1 concept note first — Stage 2, the final prototype submission,
              unlocks once your concept is in review.
            </div>
          ) : (
            <StageEditor
              stage={2}
              team={team}
              existing={s2}
              settings={settings ?? null}
              files={(files.data ?? []).filter((f) => f.submission_id === s2?.id)}
              onRefresh={refresh}
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StageEditor({
  stage,
  team,
  existing,
  settings,
  files,
  onRefresh,
}: {
  stage: 1 | 2;
  team: TeamRow;
  existing: SubmissionRow | undefined;
  settings: StageSettingRow | null;
  files: { id: string; name: string; url: string }[];
  onRefresh: () => void;
}) {
  const isOpen = stageOpen(settings, stage);
  const locked = existing?.status === "submitted";
  const [fields, setFields] = useState({
    title: existing?.title ?? "",
    sdg_tags: (existing?.sdg_tags ?? []).join(", "),
    problem_statement: existing?.problem_statement ?? "",
    methodology: existing?.methodology ?? "",
    technical_reasoning: existing?.technical_reasoning ?? "",
    prototype_status: existing?.prototype_status ?? "",
    test_outcomes: existing?.test_outcomes ?? "",
    links: existing?.links ?? "",
    evidence_links: existing?.evidence_links ?? "",
  });
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [uploading, setUploading] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    if (mounted.current) return;
    mounted.current = true;
  }, []);

  const queryClient = useQueryClient();
  const saveRef = useRef<((submit: boolean) => Promise<void>) | null>(null);


  async function save(submit: boolean) {
    if (!team.id) return;
    setSaveState("saving");
    const payload: Record<string, unknown> = { team_id: team.id };
    for (const [k, v] of Object.entries(fields)) {
      if (stage === 1 && ["technical_reasoning", "prototype_status", "test_outcomes"].includes(k)) continue;
      if (stage === 2 && k === "methodology") continue;
      payload[k] = k === "sdg_tags" ? (v as string).split(",").map((t) => t.trim()).filter(Boolean) || null : (v as string) || null;
    }
    const { data, error } = await supabase.rpc("upsert_submission", {
      p_payload: payload as never,
      p_stage: stage,
      p_submit: submit,
    });
    if (error) {
      setSaveState("error");
      toast.error(error.message);
      return;
    }
    dirty.current = false;
    setSaveState("saved");
    const saved = data as unknown as SubmissionRow | null;
    if (!submit && saved) {
      // Write the returned row straight into the cache — no refetch roundtrips.
      queryClient.setQueryData<SubmissionRow[]>(["team-submissions", team.id], (old) => {
        const list = old ?? [];
        const idx = list.findIndex((s) => s.id === saved.id);
        if (idx === -1) return [...list, saved];
        const next = [...list];
        next[idx] = saved;
        return next;
      });
    } else {
      onRefresh();
    }
    if (submit) toast.success("Submitted for review — team roster is now locked.");
  }

  function onChange(k: keyof typeof fields, v: string) {
    setFields((f) => ({ ...f, [k]: v }));
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => (saveRef.current ?? save)(false).catch(console.error), 3000);
  }

  // Keep the flush helper pointed at the latest save closure.
  useEffect(() => {
    saveRef.current = save;
  });

  // Flush pending edits when the tab is hidden, closed, or the editor unmounts.
  useEffect(() => {
    function flush() {
      if (!dirty.current) return;
      dirty.current = false;
      (saveRef.current ?? save)(false).catch(console.error);
    }
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHidden);
      flush();
    };
  }, []);

  async function uploadFile(file: File) {
    if (!existing) {
      toast.info("Save your draft first (type something), then attach files.");
      return;
    }
    setUploading(true);
    const path = `evidence/${team.id}/${existing.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("evidence").upload(
      path.replace(/^evidence\//, ""),
      file,
    );
    if (upErr) {
      setUploading(false);
      { toast.error(upErr.message); return; }
    }
    const { error: insErr } = await supabase
      .from("submission_files")
      .insert({ submission_id: existing.id, name: file.name, url: path });
    setUploading(false);
    if (insErr) { toast.error(insErr.message); return; }
    toast.success("Attachment uploaded");
    onRefresh();
  }

  if (locked) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-xl border border-sage/30 bg-sage/10 p-3.5 text-sm text-secondary-foreground">
          <Lock className="h-4 w-4" /> Submitted for review on{" "}
          {existing?.submitted_at && new Date(existing.submitted_at).toLocaleDateString()}. The
          entry is locked and cannot be edited.
        </div>
        {existing && <SubmissionDetails submission={existing as never} files={files as never} />}
      </div>
    );
  }

  const SaveIndicator = () =>
    saveState === "saving" ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    ) : saveState === "saved" ? (
      <span className="inline-flex items-center gap-1.5 text-xs text-sage">
        <Check className="h-3.5 w-3.5" /> All changes saved
      </span>
    ) : saveState === "error" ? (
      <span className="text-xs text-destructive">Save failed — retrying on next edit</span>
    ) : (
      <span className="text-xs text-muted-foreground">Auto-saves as you type</span>
    );

  return (
    <div className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest">
            {stage === 1 ? "Stage 1 · Progress / Concept Note" : "Stage 2 · Final Submission"}
          </h2>
          <Countdown
            deadline={stage === 1 ? settings?.stage1_deadline ?? null : settings?.stage2_deadline ?? null}
            className="mt-1"
          />
        </div>
        <SaveIndicator />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Project title</Label>
          <Input value={fields.title} onChange={(e) => onChange("title", e.target.value)} placeholder="e.g. KrishiMitra" />
        </div>
        <div className="space-y-1.5">
          <Label>SDG tags (comma separated)</Label>
          <Input value={fields.sdg_tags} onChange={(e) => onChange("sdg_tags", e.target.value)} placeholder="SDG 2, SDG 6" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Problem statement</Label>
        <Textarea rows={4} value={fields.problem_statement} onChange={(e) => onChange("problem_statement", e.target.value)} placeholder="What problem are you solving, and for whom?" />
      </div>

      {stage === 1 ? (
        <div className="space-y-1.5">
          <Label>Proposed methodology</Label>
          <Textarea rows={5} value={fields.methodology} onChange={(e) => onChange("methodology", e.target.value)} placeholder="How will you build it? Steps, materials, tools…" />
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label>Technical reasoning</Label>
            <Textarea rows={5} value={fields.technical_reasoning} onChange={(e) => onChange("technical_reasoning", e.target.value)} placeholder="Why does your solution work? Key design decisions…" />
          </div>
          <div className="space-y-1.5">
            <Label>Prototype status</Label>
            <Textarea rows={3} value={fields.prototype_status} onChange={(e) => onChange("prototype_status", e.target.value)} placeholder="Working prototype / partial build / simulation…" />
          </div>
          <div className="space-y-1.5">
            <Label>Test outcomes</Label>
            <Textarea rows={4} value={fields.test_outcomes} onChange={(e) => onChange("test_outcomes", e.target.value)} placeholder="What did you test, what were the results…" />
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Links (sketches, repos, demo)</Label>
          <Input value={fields.links} onChange={(e) => onChange("links", e.target.value)} placeholder="https://…" />
        </div>
        <div className="space-y-1.5">
          <Label>Evidence links</Label>
          <Input value={fields.evidence_links} onChange={(e) => onChange("evidence_links", e.target.value)} placeholder="https://…" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Evidence attachments (photos, PDFs)</Label>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground transition-colors hover:border-clay/50 hover:text-foreground">
          <CloudUpload className="h-4.5 w-4.5" />
          {uploading ? "Uploading…" : "Click to upload files"}
          <input
            type="file"
            multiple
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.target.value = "";
            }}
          />
        </label>
        {files.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {files.map((f) => (
              <span key={f.id} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                {f.name}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Countdown deadline={stage === 1 ? settings?.stage1_deadline ?? null : settings?.stage2_deadline ?? null} />
        <Button
          className="bg-clay hover:bg-clay/90"
          disabled={!isOpen}
          onClick={() => {
            if (window.confirm("Submit for review? Your entry and team roster lock after this.")) {
              save(true);
            }
          }}
        >
          Submit for review
        </Button>
      </div>
      {!isOpen && (
        <p className="text-xs text-destructive">This stage is closed — final submission is disabled.</p>
      )}
    </div>
  );
}
