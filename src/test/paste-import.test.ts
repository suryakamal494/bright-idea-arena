import { describe, expect, it } from "vitest";
import { buildRows, parsePastedTable } from "@/lib/paste-import";

describe("paste-import parser", () => {
  it("maps an Excel tab-paste with a header row", () => {
    const text = [
      "Student Name\tClass\tUsername\tPassword\tEmail\tMobile",
      "Surya Kumar\t10\tsurya.k\tsecret123\tsurya@school.in\t9876543210",
      "Meena R\t9\tmeena.r\tsecret456\tmeena@school.in\t9876543211",
    ].join("\n");
    const parsed = parsePastedTable(text);
    expect(parsed.headers).not.toBeNull();
    expect(parsed.matrix).toHaveLength(2);
    expect(parsed.mapping).toEqual(["full_name", "grade", "username", "password", "email", "mobile"]);
    const rows = buildRows(parsed.matrix, parsed.mapping);
    expect(rows[0]!).toEqual({
      full_name: "Surya Kumar",
      username: "surya.k",
      password: "secret123",
      grade: 10,
      email: "surya@school.in",
      mobile: "9876543210",
    });
  });

  it("maps a comma paste without a header row using content heuristics", () => {
    const text = ["Surya Kumar,surya.k,secret123,10,surya@school.in", "Meena R,meena.r,secret456,9,meena@school.in"].join("\n");
    const parsed = parsePastedTable(text);
    expect(parsed.headers).toBeNull();
    const rows = buildRows(parsed.matrix, parsed.mapping);
    expect(rows[0]!.full_name).toBe("Surya Kumar");
    expect(rows[0]!.email).toBe("surya@school.in");
    expect(rows[0]!.grade).toBe(10);
    expect(rows[0]!.password).toBe("secret123");
    expect(rows[0]!.username).toBe("surya.k");
  });

  it("tolerates messy header spellings", () => {
    const text = "name of student\tstandard\tlogin id\tpassword\tmail id\nAmit Verma\tGrade 11\tamit.v\tlongpass1\tamit@x.in";
    const parsed = parsePastedTable(text);
    const rows = buildRows(parsed.matrix, parsed.mapping);
    expect(rows[0]!.full_name).toBe("Amit Verma");
    expect(rows[0]!.username).toBe("amit.v");
    expect(rows[0]!.email).toBe("amit@x.in");
    expect(rows[0]!.grade).toBe(0); // "Grade 11" is not a bare number — flagged for manual fix
  });

  it("normalizes usernames and emails", () => {
    const parsed = parsePastedTable("Name\tUsername\tPassword\tClass\tEmail\nRiya P\tRiya.P 9\tgoodpass9\t10\tRIYA@School.IN ");
    const rows = buildRows(parsed.matrix, parsed.mapping);
    expect(rows[0]!.username).toBe("riya.p9");
    expect(rows[0]!.email).toBe("riya@school.in");
  });

  it("returns no rows for an empty paste", () => {
    const parsed = parsePastedTable("   \n  ");
    expect(parsed.matrix).toHaveLength(0);
    expect(buildRows(parsed.matrix, parsed.mapping)).toHaveLength(0);
  });
});
