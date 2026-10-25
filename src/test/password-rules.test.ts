import { describe, expect, it } from "vitest";
import { validateNewPassword } from "@/components/change-password-dialog";

describe("password rules", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(validateNewPassword("short7!", "short7!")).toMatch(/8 characters/);
  });
  it("rejects mismatched confirmation", () => {
    expect(validateNewPassword("longenough1", "longenough2")).toMatch(/match/);
  });
  it("rejects reusing the current password", () => {
    expect(validateNewPassword("samepass123", "samepass123", "samepass123")).toMatch(/differ/);
  });
  it("accepts a valid new password", () => {
    expect(validateNewPassword("newpass123", "newpass123", "oldpass123")).toBeNull();
  });
});
