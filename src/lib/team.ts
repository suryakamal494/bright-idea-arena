import { supabase } from "@/integrations/supabase/client";

export type TeamRow = {
  id: string;
  name: string;
  join_code: string;
  team_code: string | null;
  locked: boolean;
  captain_id: string | null;
  track_id: string | null;
  track: { id: string; name: string; slug: string; description: string | null } | null;
};

export type TeamMemberRow = {
  user_id: string;
  is_captain: boolean;
  profile: { id: string; full_name: string; grade: number | null } | null;
};

export type StageSettingRow = {
  id: string;
  track_id: string | null;
  stage1_open: boolean;
  stage1_deadline: string | null;
  stage2_open: boolean;
  stage2_deadline: string | null;
};

export type SubmissionRow = {
  id: string;
  team_id: string;
  team_code: string | null;
  stage: number;
  status: string;
  title: string | null;
  sdg_tags: string[] | null;
  problem_statement: string | null;
  methodology: string | null;
  technical_reasoning: string | null;
  prototype_status: string | null;
  test_outcomes: string | null;
  links: string | null;
  evidence_links: string | null;
  sutra_ids: string[] | null;
  sutras_explanation: string | null;
  submitted_at: string | null;
};

/** Submission workspace unlocks only at this roster size. */
export const MIN_TEAM_SIZE = 3;

export type SutraRow = { id: string; name: string; description: string | null; sort_order: number };

let sutrasCache: SutraRow[] | null = null;
export async function fetchSutras(): Promise<SutraRow[]> {
  if (sutrasCache) return sutrasCache;
  const { data } = await supabase.from("sutras").select("*").order("sort_order");
  sutrasCache = (data ?? []) as SutraRow[];
  return sutrasCache;
}

export async function fetchMyTeam(userId: string): Promise<TeamRow | null> {
  const { data } = await supabase
    .from("team_members")
    .select("team:teams(*, track:tracks(*))")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.team) return null;
  return data.team as unknown as TeamRow;
}

export async function fetchTeamMembers(teamId: string): Promise<TeamMemberRow[]> {
  const { data } = await supabase
    .from("team_members")
    .select("user_id, is_captain, profile:profiles(id, full_name, grade)")
    .eq("team_id", teamId)
    .order("created_at");
  return (data ?? []) as unknown as TeamMemberRow[];
}

export async function fetchGlobalStageSettings(): Promise<StageSettingRow | null> {
  const { data } = await supabase
    .from("stage_settings")
    .select("*")
    .is("track_id", null)
    .maybeSingle();
  return (data as StageSettingRow) ?? null;
}

export function stageOpen(settings: StageSettingRow | null, stage: 1 | 2): boolean {
  if (!settings) return false;
  const open = stage === 1 ? settings.stage1_open : settings.stage2_open;
  const deadline = stage === 1 ? settings.stage1_deadline : settings.stage2_deadline;
  if (!open) return false;
  if (deadline && new Date(deadline).getTime() < Date.now()) return false;
  return true;
}
