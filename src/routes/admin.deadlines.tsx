import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Deadline management</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Stage windows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Open or close submission stages, and extend deadlines globally or per track.
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
      <div className="space-y-4">
        {(rows ?? []).map((row) => (
          <DeadlineCard key={row.id} row={row} onSaved={() => queryClient.invalidateQueries({ queryKey: ["admin-stage-settings"] })} />
        ))}
      </div>
    </div>
  );
}

function DeadlineCard({ row, onSaved }: { row: SettingRow; onSaved: () => void }) {
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
    if (error) return toast.error(error.message);
    toast.success(row.track ? `${row.track.name} windows saved` : "Global windows saved");
    onSaved();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-lg">
          {row.track ? `Track · ${row.track.name}` : "Global (all tracks)"}
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
