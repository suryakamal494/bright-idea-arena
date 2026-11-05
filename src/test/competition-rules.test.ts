import { describe, expect, it } from "vitest";
import { judgingProgressPercent, shouldShowStage2Tab } from "@/lib/team";
import { normalizeUsername, studentAuthEmail, USERNAME_RE } from "@/lib/auth";
import { stageOpen } from "@/lib/team";

describe("student login identity", () => {
  it("normalizes a username and derives its internal sign-in address", () => {
    expect(normalizeUsername("  Alex_07 ")).toBe("alex_07");
    expect(studentAuthEmail("Alex_07")).toBe("alex_07@student.ideathon.local");
  });

  it("accepts only 3–30 safe username characters", () => {
    expect(USERNAME_RE.test("alex_07")).toBe(true);
    expect(USERNAME_RE.test("ab")).toBe(false);
    expect(USERNAME_RE.test("student name")).toBe(false);
  });
});

describe("competition rules", () => {
  it("hides Stage 2 after published Round 1 when a team is not shortlisted", () => {
    expect(shouldShowStage2Tab(true, true, false)).toBe(false);
  });

  it("shows Stage 2 before results or for shortlisted teams in a two-stage event", () => {
    expect(shouldShowStage2Tab(true, false, false)).toBe(true);
    expect(shouldShowStage2Tab(true, true, true)).toBe(true);
    expect(shouldShowStage2Tab(false, true, true)).toBe(false);
  });

  it("calculates judging coverage over eligible entries and never exceeds 100 percent", () => {
    expect(judgingProgressPercent(3, 10)).toBe(30);
    expect(judgingProgressPercent(12, 10)).toBe(100);
    expect(judgingProgressPercent(0, 0)).toBe(0);
  });

  it("honors a configured Stage 2 toggle and deadline", () => {
    expect(stageOpen({ id: "global", track_id: null, stage1_open: true, stage1_deadline: null, stage2_open: false, stage2_deadline: null }, 2)).toBe(false);
    expect(stageOpen({ id: "global", track_id: null, stage1_open: true, stage1_deadline: null, stage2_open: true, stage2_deadline: "2000-01-01T00:00:00Z" }, 2)).toBe(false);
  });
});