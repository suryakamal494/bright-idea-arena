import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, LogOut, ShieldAlert, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAuthContext, getSessionUser } from "@/lib/auth";
import { MAX_TEAM_SIZE, fetchClusters, fetchMyTeam, fetchTeamMembers } from "@/lib/team";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/_student/team")({
  head: () => ({
    meta: [{ title: "My team — Social Innovation Ideathon" }],
  }),
  component: TeamPage,
});

function TeamPage() {
  const queryClient = useQueryClient();
  const { data: team, isLoading } = useQuery({
    queryKey: ["my-team"],
    queryFn: async () => {
      const user = await getSessionUser();
      return user ? fetchMyTeam(user.id) : null;
    },
  });

  if (isLoading) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Loading your team…</p>;
  }
  return team ? (
    <TeamRoster
      team={team}
      onChanged={() => queryClient.invalidateQueries({ queryKey: ["my-team"] })}
    />
  ) : (
    <TeamFormation
      onDone={() => queryClient.invalidateQueries({ queryKey: ["my-team"] })}
    />
  );
}

function TeamRoster({
  team,
  onChanged,
}: {
  team: NonNullable<Awaited<ReturnType<typeof fetchMyTeam>>>;
  onChanged: () => void;
}) {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getSessionUser });
  const { data: members } = useQuery({
    queryKey: ["team-members", team.id],
    queryFn: () => fetchTeamMembers(team.id),
  });
  const [transferTo, setTransferTo] = useState("");
  const isCaptain = !!team.captain_id && team.captain_id === user?.id;
  const roster = members ?? [];
  const others = roster.filter((m) => !m.is_captain);

  async function transfer() {
    if (!transferTo) return;
    const { error } = await supabase.rpc("transfer_captaincy", { p_user_id: transferTo });
    if (error) { toast.error(error.message); return; }
    toast.success("Captaincy transferred");
    onChanged();
  }

  async function leave() {
    const { error } = await supabase.rpc("leave_team");
    if (error) { toast.error(error.message); return; }
    toast.success("You left the team");
    onChanged();
  }

  async function disband() {
    if (!window.confirm("Disband this team? All members will be removed. This cannot be undone.")) return;
    const { error } = await supabase.rpc("disband_team");
    if (error) { toast.error(error.message); return; }
    toast.success("Team disbanded");
    onChanged();
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Team workspace</p>
        <h1 className="font-display mt-1.5 text-2xl font-semibold leading-tight text-forest sm:text-3xl">{team.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Track · {team.track?.name ?? "Not set"} · Cluster · {team.cluster?.name ?? "Not set"} ·{" "}
          {roster.length}/{MAX_TEAM_SIZE} members
        </p>
      </header>

      <ClusterGate team={team} onChanged={onChanged} />

      {team.locked && (
        <div className="flex gap-2.5 rounded-xl border border-ochre/40 bg-ochre/10 p-3.5 text-sm text-ochre">
          <ShieldAlert className="mt-0.5 h-4.5 w-4.5 shrink-0" />
          Roster locked — a stage submission is under review, so the team can no longer change.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Members</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {roster.map((m) => (
            <div key={m.user_id} className="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sage/15 text-sm font-semibold text-sage">
                  {m.profile?.full_name.slice(0, 1).toUpperCase() ?? "?"}
                </span>
                <div>
                  <p className="text-sm font-semibold">{m.profile?.full_name ?? "Member"}</p>
                  {m.profile?.grade && <p className="text-xs text-muted-foreground">Grade {m.profile.grade}</p>}
                </div>
              </div>
              {m.is_captain && (
                <span className="flex items-center gap-1 rounded-full bg-ochre/15 px-2.5 py-0.5 text-xs font-semibold text-ochre">
                  <Crown className="h-3.5 w-3.5" /> Captain
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {roster.length >= MAX_TEAM_SIZE ? (
        <Card className="border-sage/30 bg-sage/5">
          <CardHeader>
            <CardTitle className="font-display text-lg">Team is full</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {team.name} has all {MAX_TEAM_SIZE} members, so no more teammates can join — the
              join code stops working automatically.
            </p>
            <Button asChild size="sm" className="mt-3 bg-clay hover:bg-clay/90">
              <Link to="/submission">Open submission form</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-lg">Invite teammates</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-muted px-3 py-2 font-mono text-base font-semibold tracking-widest text-forest">
              {team.join_code}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(team.join_code);
                toast.success("Join code copied");
              }}
            >
              Copy code
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `Join my ideathon team "${team.name}"! Enter code ${team.join_code} on the Social Innovation Ideathon app.`,
                )}`}
                target="_blank"
                rel="noreferrer"
              >
                Share on WhatsApp
              </a>
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-lg">Team settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isCaptain && others.length > 0 && (
            <div className="flex flex-wrap items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label>Transfer captaincy</Label>
                <Select value={transferTo} onValueChange={setTransferTo}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a teammate" />
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile?.full_name ?? "Member"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" onClick={transfer} disabled={!transferTo}>
                <UserRoundCheck className="mr-1.5 h-4 w-4" /> Transfer
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            {(!isCaptain || roster.length <= 1) && !team.locked && (
              <Button variant="outline" onClick={leave}>
                <LogOut className="mr-1.5 h-4 w-4" /> Leave team
              </Button>
            )}
            {isCaptain && !team.locked && (
              <Button variant="destructive" onClick={disband}>
                Disband team
              </Button>
            )}
          </div>
          {team.locked && (
            <p className="text-xs text-muted-foreground">
              Roster actions are disabled because the team has submitted a stage.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TeamFormation({ onDone }: { onDone: () => void }) {
  return (
    <div className="space-y-5">
      <header>
        <p className="eyebrow">Team formation</p>
        <h1 className="font-display mt-1.5 text-2xl font-semibold leading-tight text-forest sm:text-3xl">Build your team</h1>
        <p className="mt-1 text-sm text-muted-foreground">Teams of 2–3 students. One track per team.</p>
      </header>
      <Tabs defaultValue="create">
        <TabsList className="w-full">
          <TabsTrigger value="create" className="flex-1">
            Create a team
          </TabsTrigger>
          <TabsTrigger value="join" className="flex-1">
            Join a team
          </TabsTrigger>
        </TabsList>
        <TabsContent value="create">
          <CreateTeamForm onDone={onDone} />
        </TabsContent>
        <TabsContent value="join">
          <JoinTeamForm onDone={onDone} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function CreateTeamForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [trackId, setTrackId] = useState("");
  const [clusterId, setClusterId] = useState("");
  const [busy, setBusy] = useState(false);
  const { data: tracks } = useQuery({
    queryKey: ["public-tracks"],
    queryFn: async () => {
      const { data } = await supabase.from("tracks").select("id,name,slug").order("name");
      return data ?? [];
    },
  });
  const { data: clusters } = useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
    staleTime: 60_000,
  });
  const { data: schoolCluster } = useQuery({
    queryKey: ["school-cluster"],
    queryFn: async () => (await getAuthContext())?.school_cluster ?? null,
    staleTime: 60_000,
  });
  const clusterRequired = (clusters ?? []).length > 0;
  const lockedCluster = schoolCluster?.id ? schoolCluster : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!trackId) { toast.error("Choose an innovation track"); return; }
    if (clusterRequired && !lockedCluster && !clusterId) {
      toast.error("Choose your cluster");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc("create_team", {
      p_name: name,
      p_track_id: trackId,
      ...(clusterRequired && !lockedCluster && clusterId ? { p_cluster_id: clusterId } : {}),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Team created — join code ${data?.join_code ?? "generated"}`);
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-1.5">
        <Label>Team name</Label>
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Verdant Minds" />
      </div>
      <div className="space-y-1.5">
        <Label>Innovation track</Label>
        <Select value={trackId} onValueChange={setTrackId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a track" />
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
      {clusterRequired && (
        lockedCluster ? (
          <div className="space-y-1.5">
            <Label>Cluster</Label>
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              <span className="font-semibold text-forest">{lockedCluster.name}</span>{" "}
              <span className="text-xs text-muted-foreground">· set by your school coordinator</span>
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Cluster</Label>
            <Select value={clusterId} onValueChange={setClusterId}>
              <SelectTrigger>
                <SelectValue placeholder="Pick your cluster" />
              </SelectTrigger>
              <SelectContent>
                {(clusters ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )
      )}
      <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
        {busy ? "Creating…" : "Create team (you become captain)"}
      </Button>
    </form>
  );
}

function JoinTeamForm({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("join_team", { p_code: code.trim() });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Welcome to the team!");
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5">
      <div className="space-y-1.5">
        <Label>6-digit join code</Label>
        <Input
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. 482913"
          className="font-mono text-lg tracking-widest"
          maxLength={6}
          inputMode="numeric"
        />
      </div>
      <Button type="submit" className="w-full bg-clay hover:bg-clay/90" disabled={busy}>
        {busy ? "Joining…" : "Join team"}
      </Button>
    </form>
  );
}

/**
 * Cluster gate: while clusters exist, the captain of a cluster-less team picks
 * one here — submissions stay blocked until the team belongs to a cluster.
 */
function ClusterGate({
  team,
  onChanged,
}: {
  team: NonNullable<Awaited<ReturnType<typeof fetchMyTeam>>>;
  onChanged: () => void;
}) {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: getSessionUser });
  const { data: clusters } = useQuery({
    queryKey: ["clusters"],
    queryFn: fetchClusters,
    staleTime: 60_000,
    enabled: !team.cluster,
  });
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  if (team.cluster || (clusters ?? []).length === 0) return null;
  const isCaptain = !!team.captain_id && team.captain_id === user?.id;

  async function save() {
    if (!value) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_team_cluster", { p_cluster_id: value });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Cluster saved for your team");
    onChanged();
  }

  return (
    <div className="rounded-xl border border-ochre/40 bg-ochre/10 p-4">
      <p className="text-sm font-semibold text-ochre">Choose your team's cluster</p>
      <p className="mt-1 text-sm text-foreground/90">
        {isCaptain
          ? "Every team belongs to a competition cluster. Pick yours — the submission form stays locked until you do."
          : "Every team belongs to a competition cluster. Your captain picks it on this page — the submission form stays locked until then."}
      </p>
      {isCaptain && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger className="w-48" aria-label="Team cluster">
              <SelectValue placeholder="Pick a cluster" />
            </SelectTrigger>
            <SelectContent>
              {(clusters ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" className="bg-clay hover:bg-clay/90" onClick={save} disabled={busy || !value}>
            {busy ? "Saving…" : "Save cluster"}
          </Button>
        </div>
      )}
    </div>
  );
}
