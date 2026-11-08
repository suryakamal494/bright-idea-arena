import { createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/judges")({
  head: () => ({
    meta: [
      { title: "Evaluator assignments | Social Innovation Ideathon | ICORG" },
      { name: "description", content: "Assign evaluators to competition themes and review current assignments." },
      { property: "og:title", content: "Evaluator assignments | Social Innovation Ideathon | ICORG" },
      { property: "og:description", content: "Assign evaluators to competition themes and review current assignments." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: JudgeAssignment,
});

type JudgeRow = { user_id: string; profile: { full_name: string; email: string } | null };
type AssignmentRow = { id: string; judge_id: string; track: { name: string } | null };

function JudgeAssignment() {
  const queryClient = useQueryClient();
  const [judgeId, setJudgeId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: judges } = useQuery({
    queryKey: ["admin-judges"],
      queryFn: async () => {
        const { data: roleRows } = await supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "judge");
        const ids = (roleRows ?? []).map((r) => r.user_id);
        if (ids.length === 0) return [];
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email")
          .in("id", ids);
        const byId = new Map((profs ?? []).map((p) => [p.id, p]));
        return ids.map((id) => ({ user_id: id, profile: byId.get(id) ?? null })) as JudgeRow[];
      },
  });

  const { data: tracks } = useQuery({
    queryKey: ["public-tracks"],
    queryFn: async () => {
      const { data } = await supabase.from("tracks").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data: assignments } = useQuery({
    queryKey: ["admin-assignments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("judge_assignments")
        .select("id,judge_id,track:tracks(name)");
      return (data ?? []) as AssignmentRow[];
    },
  });

  async function assign() {
    if (!judgeId || !trackId) { toast.error("Choose a judge and a track"); return; }
    setBusy(true);
    const { error } = await supabase.from("judge_assignments").insert({ judge_id: judgeId, track_id: trackId });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Judge assigned to track");
    setJudgeId("");
    setTrackId("");
    queryClient.invalidateQueries({ queryKey: ["admin-assignments"] });
  }

  async function unassign(id: string) {
    const { error } = await supabase.from("judge_assignments").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    queryClient.invalidateQueries({ queryKey: ["admin-assignments"] });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Judge assignment</p>
        <h1 className="font-display mt-1.5 text-3xl font-semibold text-forest">Evaluators by track</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Judges see only the anonymous queue for the tracks they're assigned to.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">New assignment</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="min-w-44 flex-1 space-y-1.5">
            <Select value={judgeId} onValueChange={setJudgeId}>
              <SelectTrigger>
                <SelectValue placeholder="Judge" />
              </SelectTrigger>
              <SelectContent>
                {(judges ?? []).map((j) => (
                  <SelectItem key={j.user_id} value={j.user_id}>
                    {j.profile?.full_name ?? "Judge"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-44 flex-1 space-y-1.5">
            <Select value={trackId} onValueChange={setTrackId}>
              <SelectTrigger>
                <SelectValue placeholder="Innovation track" />
              </SelectTrigger>
              <SelectContent>
                {(tracks ?? []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button className="bg-clay hover:bg-clay/90" onClick={assign} disabled={busy}>
            <Plus className="mr-1.5 h-4 w-4" /> Assign
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Current assignments</CardTitle>
        </CardHeader>
        <CardContent className="divide-y divide-border">
          {(assignments ?? []).map((a) => {
            const judge = (judges ?? []).find((j) => j.user_id === a.judge_id);
            return (
              <div key={a.id} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-semibold">{judge?.profile?.full_name ?? "Judge"}</p>
                  <p className="text-xs text-muted-foreground">{judge?.profile?.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground">
                    {a.track?.name ?? "—"}
                  </span>
                  <Button variant="ghost" size="icon" onClick={() => unassign(a.id)} aria-label="Remove assignment">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
          {(assignments ?? []).length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">No assignments yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
