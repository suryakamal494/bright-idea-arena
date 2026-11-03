import { describe, expect, it } from "vitest";
import { buildRows, parsePastedTable, tableHasSignal } from "@/lib/paste-import";

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

  it("keeps quoted names with commas in one cell (C01)", () => {
    const text = [
      '"Kumar, Surya",10,surya.k,secret123,surya@school.in',
      '"Anand-Rao, Priya M.",9,meena.r,secret456,meena@school.in',
    ].join("\n");
    const parsed = parsePastedTable(text);
    const rows = buildRows(parsed.matrix, parsed.mapping);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.full_name).toBe("Kumar, Surya");
    expect(rows[0]!.grade).toBe(10);
    expect(rows[0]!.email).toBe("surya@school.in");
    expect(rows[0]!.username).toBe("surya.k");
    expect(rows[1]!.full_name).toBe("Anand-Rao, Priya M.");
    expect(rows[1]!.email).toBe("meena@school.in");
  });

  it("keeps a quoted cell that spans multiple lines in one row (C01)", () => {
    const text = '"Surya\nKumar",10,surya.k,secret123,surya@school.in';
    const parsed = parsePastedTable(text);
    expect(parsed.matrix).toHaveLength(1);
    const rows = buildRows(parsed.matrix, parsed.mapping);
    expect(rows[0]!.full_name).toBe("Surya\nKumar");
    expect(rows[0]!.email).toBe("surya@school.in");
  });

  it("rejects a paste with no recognizable student data (C02)", () => {
    const parsed = parsePastedTable("apple\nbanana cherry\nmango");
    expect(parsed.matrix.length).toBeGreaterThan(0);
    expect(tableHasSignal(parsed)).toBe(false);
  });

  it("accepts a paste with a real student signal (C02)", () => {
    const parsed = parsePastedTable("Surya Kumar,surya.k,secret123,10,surya@school.in");
    expect(tableHasSignal(parsed)).toBe(true);
  });

  it("maps a single-row headerless paste with no header to detect (C03)", () => {
    const text = "Surya Kumar\t10\tsurya.k\tsecret123\tsurya@school.in\t9876543210";
    const parsed = parsePastedTable(text);
    expect(parsed.headers).toBeNull();
    expect(parsed.mapping).toEqual(["full_name", "grade", "username", "password", "email", "mobile"]);
    const rows = buildRows(parsed.matrix, parsed.mapping);
    expect(rows[0]!.full_name).toBe("Surya Kumar");
    expect(rows[0]!.grade).toBe(10);
    expect(rows[0]!.password).toBe("secret123");
    expect(rows[0]!.email).toBe("surya@school.in");
    expect(rows[0]!.mobile).toBe("9876543210");
  });

  it("defaults a headerless 5-column paste to the advertised order (C03)", () => {
    const parsed = parsePastedTable("Amit Verma\tStd 10\tamit.v\tlongpass1\troom 12");
    expect(parsed.headers).toBeNull();
    expect(parsed.mapping).toEqual(["full_name", "grade", "username", "password", "email"]);
    expect(tableHasSignal(parsed)).toBe(true); // name-like first column, 5-column shape
  });

  it("rejects an arbitrary word list pasted as a table (C02)", () => {
    const parsed = parsePastedTable("apple,banana,cherry,dates,elderberry\nfig,guava,kiwi,lemon,mango");
    expect(tableHasSignal(parsed)).toBe(false);
  });
});
