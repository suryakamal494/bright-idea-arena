import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchCompetitionSettings } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/deadlines")({
  head: () => ({
    meta: [{ title: "Deadline management — Social Innovation Ideathon" }],
  }),
  component: DeadlineManager,
});

type SettingRow = {
  id: string;
  track_id: string | null;
  stage1_open: boolean;
  stage1_deadline: string | null;
  stage2_open: boolean;
  stage2_deadline: string | null;
  track: { name: string } | null;
};

function DeadlineManager() {
  const queryClient = useQueryClient();
  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-stage-settings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stage_settings")
        .select("*, track:tracks(name)")
        .order("track_id", { ascending: true, nullsFirst: true });
      return (data ?? []) as SettingRow[];
    },
  });
  const { data: competition } = useQuery({
    queryKey: ["competition-settings"],
    queryFn: fetchCompetitionSettings,
  });
  const twoStage = (competition?.stage_count ?? 2) === 2;

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Deadline management</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Stages &amp; windows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how many rounds the competition runs, and open or close each submission stage.
        </p>
      </header>

      <StageCountCard stageCount={competition?.stage_count ?? 2} onSaved={() => {
        queryClient.invalidateQueries({ queryKey: ["competition-settings"] });
      }} />

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <div className="space-y-4">
        {(rows ?? []).map((row) => (
          <DeadlineCard key={row.id} row={row} twoStage={twoStage} onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-stage-settings"] })} />
        ))}
      </div>
    </div>
  );
}

function StageCountCard({ stageCount, onSaved }: { stageCount: number; onSaved: () => void }) {
  const [value, setValue] = useState(String(stageCount));
  const [busy, setBusy] = useState(false);
  const changed = Number(value) !== stageCount;
  const { data: stage2Count } = useQuery({
    queryKey: ["stage2-submission-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("submissions")
        .select("id", { count: "exact", head: true })
        .eq("stage", 2);
      return count ?? 0;
    },
  });

  async function save() {
    setBusy(true);
    const next = Number(value);
    if (next === 1 && (stage2Count ?? 0) > 0) {
      const go = window.confirm(
        `${stage2Count} stage-2 entries already exist. Switching to a single stage hides stage 2 everywhere and blocks new stage-2 saves. Continue?`,
      );
      if (!go) {
        setBusy(false);
        return;
      }
    }
    const { error } = await supabase
      .from("competition_settings")
      .update({ stage_count: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(next === 1 ? "Competition set to a single stage" : "Competition set to two stages");
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Number of stages</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>This competition runs</Label>
            <Select value={value} onValueChange={setValue}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">One stage — single round</SelectItem>
                <SelectItem value="2">Two stages — Round 1 + final round</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="bg-clay hover:bg-clay/90" onClick={save} disabled={busy || !changed}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {stageCount === 2
            ? "Two stages: after Round 1 closes, shortlist teams on the Results page and publish results — stage 2 opens only for shortlisted teams."
            : "Single stage: publish the final results directly from the Results page when Round 1 closes."}
        </p>
      </CardContent>
    </Card>
  );
}

function DeadlineCard({ row, twoStage, onSaved }: { row: SettingRow; twoStage: boolean; onSaved: () => void }) {
  const [s1Open, setS1Open] = useState(row.stage1_open);
  const [s1Deadline, setS1Deadline] = useState(toLocal(row.stage1_deadline));
  const [s2Open, setS2Open] = useState(row.stage2_open);
  const [s2Deadline, setS2Deadline] = useState(toLocal(row.stage2_deadline));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("stage_settings")
      .update({
        stage1_open: s1Open,
        stage1_deadline: s1Deadline ? new Date(s1Deadline).toISOString() : null,
        stage2_open: s2Open,
        stage2_deadline: s2Deadline ? new Date(s2Deadline).toISOString() : null,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(row.track ? `${row.track.name} windows saved` : "Global windows saved");
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">
          {row.track ? `Theme · ${row.track.name}` : "Global (all themes)"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Stage 1 open</Label>
            <Switch checked={s1Open} onCheckedChange={setS1Open} />
          </div>
          <div className="space-y-1.5">
            <Label>Stage 1 deadline</Label>
            <Input type="datetime-local" value={s1Deadline} onChange={(e) => setS1Deadline(e.target.value)} />
          </div>
        </div>
        {twoStage && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Stage 2 open</Label>
              <Switch checked={s2Open} onCheckedChange={setS2Open} />
            </div>
            <div className="space-y-1.5">
              <Label>Stage 2 deadline</Label>
              <Input type="datetime-local" value={s2Deadline} onChange={(e) => setS2Deadline(e.target.value)} />
            </div>
          </div>
        )}
        <div className="sm:col-span-2">
          <Button className="bg-clay hover:bg-clay/90" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save windows"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
