import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Check,
  CloudUpload,
  FileText,
  Info,
  Loader2,
  Lock,
  Trash2,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from "@/lib/auth";
import {
  MAX_TEAM_SIZE,
  MIN_TEAM_SIZE,
  fetchCompetitionSettings,
  fetchGlobalStageSettings,
  fetchMyTeam,
  fetchSutras,
  fetchTeamMembers,
  stageOpen,
  type PublishedResultRow,
  type StageSettingRow,
  type SubmissionRow,
  type SutraRow,
  type TeamRow,
} from "@/lib/team";
import { isImageFile, isPdfFile } from "@/components/attachment-preview";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Countdown } from "@/components/countdown";
import { SubmissionDetails } from "@/components/submission-details";

export const Route = createFileRoute("/_student/submission")({
  head: () => ({
    meta: [{ title: "Submission form — Social Innovation Ideathon" }],
  }),
  component: SubmissionPage,
});

type SaveState = "idle" | "saving" | "saved" | "error" | "offline";

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
  const {
    data: members,
    isPending: membersPending,
    isError: membersError,
  } = useQuery({
    queryKey: ["team-members", team.id],
    queryFn: () => fetchTeamMembers(team.id),
    retry: 2,
  });
  const files = useSubmissionFiles(team.id, submissions ?? []);
  const list = submissions ?? [];
  const roster = members ?? [];
  // Only gate on a real short roster — never on a failed or still-loading fetch,
  // so a full team is never locked out by a transient request error.
  const teamReady = membersError || (!membersPending && roster.length >= MIN_TEAM_SIZE);

  const s1 = list.find((s) => s.stage === 1);
  const s2 = list.find((s) => s.stage === 2);
  const s1Open = stageOpen(settings ?? null, 1);
  const s2Open = stageOpen(settings ?? null, 2);
  const { data: competition } = useQuery({
    queryKey: ["competition-settings"],
    queryFn: fetchCompetitionSettings,
  });
  const twoStage = (competition?.stage_count ?? 2) === 2;
  const { data: results } = useQuery({
    queryKey: ["my-results", team.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("results")
        .select("team_id,stage,outcome,published")
        .eq("team_id", team.id);
      return (data ?? []) as PublishedResultRow[];
    },
  });
  const r1 = (results ?? []).find((r) => r.stage === 1);
  const shortlisted = !!r1?.published && r1.outcome === "shortlisted";

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["team-submissions", team.id] });
    queryClient.invalidateQueries({ queryKey: ["submission-files", team.id] });
    queryClient.invalidateQueries({ queryKey: ["my-team"] });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Submission form · {twoStage ? "two stages" : "single stage"}</p>
        <h1 className="font-display mt-1.5 text-2xl font-semibold leading-tight text-forest sm:text-3xl">
          {team.name} · {team.track?.name ?? "No theme selected"}
        </h1>
      </header>

      {membersPending && !membersError ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading team roster…</p>
      ) : !teamReady ? (
        <div className="rounded-2xl border border-ochre/40 bg-ochre/10 p-5">
          <div className="flex items-start gap-3">
            <Users className="mt-0.5 h-5 w-5 text-ochre" />
            <div className="space-y-2">
              <h2 className="font-display text-lg font-semibold text-forest">
                The submission form unlocks at {MIN_TEAM_SIZE} members
              </h2>
              <p className="text-sm text-ochre">
                Your team has {roster.length} of {MIN_TEAM_SIZE} required members (each team can
                have {MIN_TEAM_SIZE} to {MAX_TEAM_SIZE} members). Invite your teammates from the
                Team page using your join code.
              </p>
              <Button asChild size="sm" className="bg-clay hover:bg-clay/90">
                <Link to="/team">Invite teammates</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Tabs defaultValue="1">
          <TabsList className="w-full">
            <TabsTrigger value="1" className="flex-1">
              Stage 1 · One-pager
            </TabsTrigger>
            {twoStage && (
              <TabsTrigger value="2" className="flex-1" disabled={!s2Open && !s2}>
                Stage 2 · Final
              </TabsTrigger>
            )}
          </TabsList>
          <TabsContent value="1">
            <StageEditor
              stage={1}
              team={team}
              existing={s1}
              settings={settings ?? null}
              open={s1Open}
              files={(files.data ?? []).filter((f) => f.submission_id === s1?.id)}
              onRefresh={refresh}
            />
          </TabsContent>
          {twoStage && (
            <TabsContent value="2">
              {s1?.status !== "submitted" ? (
                <div className="rounded-xl border border-ochre/40 bg-ochre/10 p-4 text-sm text-ochre">
                  Submit your Stage 1 project one-pager first — Stage 2, the final submission,
                  unlocks once your concept is in review.
                </div>
              ) : r1?.published && r1.outcome === "not_selected" ? (
                <div className="rounded-xl border border-clay/40 bg-clay/10 p-4 text-sm font-medium text-clay">
                  Your team was not selected for Round 2 — thank you for participating!
                </div>
              ) : !shortlisted ? (
                <div className="rounded-xl border border-ochre/40 bg-ochre/10 p-4 text-sm text-ochre">
                  Round 1 results are not published yet. Stage 2 opens only for teams shortlisted
                  after Round 1 — we'll show it here the moment results go live.
                </div>
              ) : (
                <StageEditor
                  stage={2}
                  team={team}
                  existing={s2}
                  settings={settings ?? null}
                  open={s2Open}
                  files={(files.data ?? []).filter((f) => f.submission_id === s2?.id)}
                  onRefresh={refresh}
                />
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

type StagedFile = { file: File; title: string };

function StageEditor({
  stage,
  team,
  existing,
  settings,
  open,
  files,
  onRefresh,
}: {
  stage: 1 | 2;
  team: TeamRow;
  existing: SubmissionRow | undefined;
  settings: StageSettingRow | null;
  open: boolean;
  files: { id: string; name: string; url: string; title?: string | null }[];
  onRefresh: () => void;
}) {
  const deadline = stage === 1 ? settings?.stage1_deadline ?? null : settings?.stage2_deadline ?? null;
  const closedByDeadline = !!deadline && new Date(deadline).getTime() < Date.now();
  const locked = existing?.status === "submitted";
  const { data: sutras } = useQuery({ queryKey: ["sutras"], queryFn: fetchSutras });
  const [fields, setFields] = useState({
    title: existing?.title ?? "",
    sutras_explanation: existing?.sutras_explanation ?? "",
    problem_statement: existing?.problem_statement ?? "",
    methodology: existing?.methodology ?? "",
    technical_reasoning: existing?.technical_reasoning ?? "",
    prototype_status: existing?.prototype_status ?? "",
    test_outcomes: existing?.test_outcomes ?? "",
    links: existing?.links ?? "",
    evidence_links: existing?.evidence_links ?? "",
  });
  const [selectedSutras, setSelectedSutras] = useState<string[]>(existing?.sutra_ids ?? []);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [uploading, setUploading] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const saveRef = useRef<((submit: boolean) => Promise<void>) | null>(null);
  const finalized = useRef(false);
  const backupKey = `sii-draft:${team.id}:${stage}`;

  // Deadline auto-submit: when the deadline has passed and a draft is still open,
  // finalise it the moment any member opens the form.
  useEffect(() => {
    if (finalized.current || !closedByDeadline || locked || !existing) return;
    finalized.current = true;
    (async () => {
      const { error } = await supabase.rpc("finalize_due_submission", { p_stage: stage });
      if (error) { console.error(error); return; }
      toast.info(`The deadline passed — your ${stage === 1 ? "one-pager" : "final submission"} was auto-submitted.`);
      onRefresh();
    })();
  }, [closedByDeadline, locked, existing, stage, onRefresh]);

  async function save(submit: boolean) {
    if (!team.id) return;
    // Keep an on-device copy first so a dropped connection never loses work.
    try {
      localStorage.setItem(backupKey, JSON.stringify({ at: Date.now(), fields, sutras: selectedSutras }));
    } catch { /* storage full or blocked */ }
    if (!navigator.onLine) {
      dirty.current = true;
      setSaveState("offline");
      if (submit) toast.error("You're offline. Reconnect to submit — your work is kept on this device.");
      return;
    }
    setSaveState("saving");
    const payload: Record<string, unknown> = {
      team_id: team.id,
      ...(existing ? { id: existing.id } : {}),
      sutra_ids: selectedSutras,
    };
    for (const [k, v] of Object.entries(fields)) {
      if (stage === 1 && ["technical_reasoning", "prototype_status", "test_outcomes"].includes(k)) continue;
      if (stage === 2 && k === "methodology") continue;
      payload[k] = (v as string) || null;
    }
    const { data, error } = await supabase.rpc("upsert_submission", {
      p_payload: payload as never,
      p_stage: stage,
      p_submit: submit,
    });
    if (error) {
      if (/fetch|network|load failed/i.test(error.message)) {
        dirty.current = true;
        setSaveState("offline");
        if (submit) toast.error("Connection lost. Your work is kept on this device — try again when online.");
        return;
      }
      setSaveState("error");
      toast.error(error.message);
      return;
    }
    try { localStorage.removeItem(backupKey); } catch { /* ignore */ }
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

  function toggleSutra(id: string) {
    setSelectedSutras((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => (saveRef.current ?? save)(false).catch(console.error), 3000);
      return next;
    });
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
    const onOnline = () => {
      if (!dirty.current) return;
      (saveRef.current ?? save)(false).catch(console.error);
    };
    const onOffline = () => setSaveState("offline");
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      flush();
    };
  }, []);

  // Restore an unsent on-device copy (e.g. the network dropped before it saved).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(backupKey);
      if (!raw) return;
      const b = JSON.parse(raw) as { at: number; fields: typeof fields; sutras: string[] };
      const updatedAt = (existing as { updated_at?: string | null } | null | undefined)?.updated_at;
      const serverAt = updatedAt ? new Date(updatedAt).getTime() : 0;
      if (b.at <= serverAt) { localStorage.removeItem(backupKey); return; }
      setFields((f) => ({ ...f, ...b.fields }));
      setSelectedSutras(b.sutras ?? []);
      dirty.current = true;
      toast.info("Restored unsaved changes from this device.");
      if (navigator.onLine) setTimeout(() => (saveRef.current ?? save)(false).catch(console.error), 500);
    } catch { /* ignore corrupt backup */ }
  }, []);

  async function attachStaged() {
    if (!existing) {
      toast.info("Save your draft first (type something), then attach files.");
      return;
    }
    if (staged.length === 0) return;
    setUploading(true);
    try {
      for (const s of staged) {
        const path = `evidence/${team.id}/${existing.id}/${Date.now()}-${s.file.name}`;
        const { error: upErr } = await supabase.storage.from("evidence").upload(
          path.replace(/^evidence\//, ""),
          s.file,
        );
        if (upErr) { toast.error(`${s.file.name}: ${upErr.message}`); continue; }
        const { error: insErr } = await supabase.from("submission_files").insert({
          submission_id: existing.id,
          name: s.file.name,
          title: s.title.trim() || s.file.name,
          url: path,
        });
        if (insErr) toast.error(insErr.message);
      }
      setStaged([]);
      toast.success("Attachments added");
      onRefresh();
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(id: string) {
    const { error } = await supabase.from("submission_files").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
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
        {existing && (
          <SubmissionDetails
            submission={existing as never}
            files={files as never}
            theme={team.track?.name ?? null}
          />
        )}
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
    ) : saveState === "offline" ? (
      <span className="text-xs text-ochre">
        No internet — your work is kept on this device and will save when you reconnect
      </span>
    ) : saveState === "error" ? (
      <span className="text-xs text-destructive">Save failed — retrying on next edit</span>
    ) : (
      <span className="text-xs text-muted-foreground">Auto-saves as you type</span>
    );

  const SectionHead = ({ n, title, hint }: { n: string; title: string; hint?: string }) => (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-forest font-mono text-xs font-semibold text-linen">
          {n}
        </span>
        <h3 className="font-display text-base font-semibold text-forest">{title}</h3>
      </div>
      {hint && (
        <p className="flex items-start gap-1.5 pl-8 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clay" /> {hint}
        </p>
      )}
    </div>
  );

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest">
            {stage === 1 ? "Stage 1 · Project One-Pager" : "Stage 2 · Final Submission"}
          </h2>
          <Countdown deadline={deadline} className="mt-1" />
        </div>
        <SaveIndicator />
      </div>

      {stage === 1 ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <SectionHead
                n="01"
                title="Project title"
                hint="A clear, specific title — avoid broad areas like “Waste Management” or “Water Conservation”."
              />
              <Input
                value={fields.title}
                onChange={(e) => onChange("title", e.target.value)}
                placeholder="e.g. KrishiMitra: Low-cost Soil Health Advisor"
              />
            </div>
            <div className="space-y-1.5">
              <SectionHead n="02" title="Theme" hint="Chosen with your team — ask your coordinator to change it if needed." />
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-forest">
                {team.track?.name ?? "Not set"}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <SectionHead
              n="03"
              title="Swarna Andhra Sutras"
              hint="Pick every Sutra your project contributes to — one or more."
            />
            <div className="flex flex-wrap gap-1.5 pl-8">
              {(sutras ?? []).map((s: SutraRow) => {
                const active = selectedSutras.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    title={s.description ?? ""}
                    onClick={() => toggleSutra(s.id)}
                    className={
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                      (active
                        ? "border-ochre bg-ochre/15 text-ochre"
                        : "border-border text-muted-foreground hover:border-ochre/50 hover:text-ochre")
                    }
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
            <div className="pl-8">
              <Textarea
                rows={3}
                value={fields.sutras_explanation}
                onChange={(e) => onChange("sutras_explanation", e.target.value)}
                placeholder="Briefly explain how your project connects to the selected Sutra(s)…"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <SectionHead
              n="04"
              title="What is the problem?"
              hint="Describe the specific problem you have observed around you — a broad topic is not a problem. e.g. “Wet and recyclable waste get mixed at our collection point, making it unhygienic.”"
            />
            <div className="pl-8">
              <Textarea
                rows={5}
                value={fields.problem_statement}
                onChange={(e) => onChange("problem_statement", e.target.value)}
                placeholder="What exactly is happening, for whom, and what makes it difficult?"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <SectionHead
              n="05"
              title="What is your proposed solution?"
              hint="Explain the full idea — what it does, how it works, and how it addresses the problem. “We will build an app” is not a solution."
            />
            <div className="pl-8">
              <Textarea
                rows={6}
                value={fields.methodology}
                onChange={(e) => onChange("methodology", e.target.value)}
                placeholder="This is what we are proposing, this is how it works, and this is how it solves the problem…"
              />
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Project title</Label>
              <Input value={fields.title} onChange={(e) => onChange("title", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Theme</Label>
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-sm font-medium text-forest">
                {team.track?.name ?? "Not set"}
              </div>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Technical reasoning</Label>
            <Textarea
              rows={5}
              value={fields.technical_reasoning}
              onChange={(e) => onChange("technical_reasoning", e.target.value)}
              placeholder="Why does your solution work? Key design decisions…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Prototype status</Label>
            <Textarea
              rows={3}
              value={fields.prototype_status}
              onChange={(e) => onChange("prototype_status", e.target.value)}
              placeholder="Working prototype / partial build / simulation…"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Test outcomes</Label>
            <Textarea
              rows={4}
              value={fields.test_outcomes}
              onChange={(e) => onChange("test_outcomes", e.target.value)}
              placeholder="What did you test, what were the results…"
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <SectionHead
          n="06"
          title="Additional information"
          hint="Diagrams, sketches, photos, the flow of your idea, expected benefits — anything that helps the reader understand. At least one attachment is required to submit."
        />
        <div className="grid gap-4 pl-8 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Links (sketches, repos, demo)</Label>
            <Input value={fields.links} onChange={(e) => onChange("links", e.target.value)} placeholder="https://…" />
          </div>
          <div className="space-y-1.5">
            <Label>Evidence links</Label>
            <Input
              value={fields.evidence_links}
              onChange={(e) => onChange("evidence_links", e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
        <div className="space-y-2 pl-8">
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-clay/50 hover:text-foreground">
            <CloudUpload className="h-4.5 w-4.5" />
            Choose files to attach
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []).map((f) => ({
                  file: f,
                  title: f.name.replace(/\.[^.]+$/, ""),
                }));
                if (chosen.length) setStaged((cur) => [...cur, ...chosen]);
                e.target.value = "";
              }}
            />
          </label>
          {staged.length > 0 && (
            <div className="space-y-2 rounded-xl border border-clay/30 bg-clay/5 p-3">
              {staged.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    className="h-8 flex-1 text-xs"
                    value={s.title}
                    placeholder="Attachment title"
                    onChange={(e) =>
                      setStaged((cur) => cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                    }
                  />
                  <span className="max-w-40 truncate text-xs text-muted-foreground">{s.file.name}</span>
                  <button
                    onClick={() => setStaged((cur) => cur.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <Button size="sm" className="bg-clay hover:bg-clay/90" disabled={uploading} onClick={attachStaged}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
                Attach {staged.length} file{staged.length === 1 ? "" : "s"}
              </Button>
            </div>
          )}
          {files.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {files.map((f) => {
                const image = isImageFile(f.url);
                const pdf = isPdfFile(f.url);
                return (
                  <div key={f.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                    {image || pdf ? (
                      image ? (
                        <img src={f.url} alt="" className="h-8 w-8 rounded object-cover" />
                      ) : (
                        <FileText className="h-4 w-4 text-clay" />
                      )
                    ) : (
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{f.title || f.name}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{f.name}</p>
                    </div>
                    {!locked && (
                      <button
                        onClick={() => removeFile(f.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${f.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2 border-t border-border pt-4">
        <SectionHead n="07" title="Team members" hint="Filled automatically from your team roster." />
        <TeamMembersInline teamId={team.id} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Countdown deadline={deadline} />
        <Button
          className="bg-clay hover:bg-clay/90"
          disabled={!open}
          onClick={() => {
            if (window.confirm("Submit for review? Your entry and team roster lock after this.")) {
              save(true);
            }
          }}
        >
          Submit for review
        </Button>
      </div>
      {!open && (
        <p className="text-xs text-destructive">
          {closedByDeadline
            ? "The deadline has passed — your entry was auto-submitted for review."
            : "This stage is closed — final submission is disabled."}
        </p>
      )}
    </div>
  );
}

function TeamMembersInline({ teamId }: { teamId: string }) {
  const { data: members } = useQuery({
    queryKey: ["team-members", teamId],
    queryFn: () => fetchTeamMembers(teamId),
  });
  return (
    <div className="flex flex-wrap gap-1.5 pl-8">
      {(members ?? []).map((m) => (
        <span key={m.user_id} className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
          {m.profile?.full_name ?? "Member"}
          {m.is_captain ? " · Captain" : ""}
        </span>
      ))}
    </div>
  );
}
