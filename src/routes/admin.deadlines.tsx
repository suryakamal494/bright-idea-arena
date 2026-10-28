import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/deadlines")({
  head: () => ({
    meta: [
      { title: "Deadlines & stages — Social Innovation Ideathon" },
      { name: "description", content: "Set stage deadlines and manage competition themes." },
    ],
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

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Deadlines &amp; stages</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Deadlines &amp; stages</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stage 1 is always open until its deadline. Open Stage 2 when you are ready for shortlisted teams.
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <div className="space-y-4">
        {(rows ?? []).map((row) => (
          <DeadlineCard key={row.id} row={row} onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-stage-settings"] })} />
        ))}
      </div>

      <ThemesCard />
    </div>
  );
}

function DeadlineCard({ row, onSaved }: { row: SettingRow; onSaved: () => void }) {
  const [s1Deadline, setS1Deadline] = useState(toLocal(row.stage1_deadline));
  const [s2Open, setS2Open] = useState(row.stage2_open);
  const [s2Deadline, setS2Deadline] = useState(toLocal(row.stage2_deadline));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("stage_settings")
      .update({
        stage1_open: true,
        stage1_deadline: s1Deadline ? new Date(s1Deadline).toISOString() : null,
        stage2_open: s2Open,
        stage2_deadline: s2Deadline ? new Date(s2Deadline).toISOString() : null,
      })
      .eq("id", row.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Deadlines saved");
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">
          {row.track ? `Theme · ${row.track.name}` : "Stage deadlines"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="flex h-6 items-center justify-between">
            <Label>Stage 1</Label>
            <span className="rounded-full bg-forest/10 px-2.5 py-0.5 text-xs font-medium text-forest">Always open</span>
          </div>
          <div className="space-y-1.5">
            <Label>Stage 1 deadline</Label>
            <Input type="datetime-local" value={s1Deadline} onChange={(e) => setS1Deadline(e.target.value)} />
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex h-6 items-center justify-between">
            <Label>Stage 2 open</Label>
            <Switch checked={s2Open} onCheckedChange={setS2Open} />
          </div>
          <div className="space-y-1.5">
            <Label>Stage 2 deadline</Label>
            <Input type="datetime-local" value={s2Deadline} onChange={(e) => setS2Deadline(e.target.value)} />
          </div>
        </div>
        <div className="sm:col-span-2">
          <Button className="bg-clay hover:bg-clay/90" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save deadlines"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

type Track = { id: string; name: string; slug: string; description: string | null };

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function ThemesCard() {
  const queryClient = useQueryClient();
  const { data: tracks } = useQuery({
    queryKey: ["admin-tracks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tracks").select("id,name,slug,description").order("name");
      if (error) throw error;
      return (data ?? []) as Track[];
    },
  });
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["admin-tracks"] });
    queryClient.invalidateQueries({ queryKey: ["public-tracks"] });
    queryClient.invalidateQueries({ queryKey: ["tracks"] });
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    const { error } = await supabase.from("tracks").insert({ name: n, slug: slugify(n), description: desc.trim() || null });
    setBusy(false);
    if (error) {
      toast.error(error.code === "23505" ? "A theme with this name already exists" : error.message);
      return;
    }
    setName(""); setDesc("");
    toast.success(`Theme "${n}" added`);
    refresh();
  }

  async function remove(t: Track) {
    const { count } = await supabase.from("teams").select("id", { count: "exact", head: true }).eq("track_id", t.id);
    if ((count ?? 0) > 0) {
      toast.error(`${count} team(s) already chose "${t.name}" — it can't be deleted.`);
      return;
    }
    if (!window.confirm(`Delete theme "${t.name}"?`)) return;
    const { error } = await supabase.from("tracks").delete().eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Theme deleted");
    refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">Themes</CardTitle>
        <p className="text-sm text-muted-foreground">Each team picks one theme when it is created.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="divide-y divide-border rounded-lg border border-border">
          {(tracks ?? []).map((t) => (
            <ThemeRow key={t.id} track={t} onSaved={refresh} onDelete={() => remove(t)} />
          ))}
          {tracks?.length === 0 && <li className="p-3 text-sm text-muted-foreground">No themes yet.</li>}
        </ul>
        <div className="grid gap-2 sm:grid-cols-[1fr_2fr_auto]">
          <Input placeholder="Theme name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Short description (optional)" value={desc} onChange={(e) => setDesc(e.target.value)} />
          <Button className="bg-clay hover:bg-clay/90" onClick={add} disabled={busy || !name.trim()}>
            Add theme
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ThemeRow({ track, onSaved, onDelete }: { track: Track; onSaved: () => void; onDelete: () => void }) {
  const [name, setName] = useState(track.name);
  const [desc, setDesc] = useState(track.description ?? "");
  const changed = name.trim() !== track.name || desc.trim() !== (track.description ?? "");

  async function save() {
    const { error } = await supabase
      .from("tracks")
      .update({ name: name.trim(), description: desc.trim() || null })
      .eq("id", track.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Theme updated");
    onSaved();
  }

  return (
    <li className="grid gap-2 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-center">
      <Input value={name} onChange={(e) => setName(e.target.value)} aria-label="Theme name" />
      <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" aria-label="Description" />
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={save} disabled={!changed || !name.trim()}>Save</Button>
        <Button variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${track.name}`}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </li>
  );
}

function toLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
