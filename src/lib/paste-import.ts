/**
 * Flexible table parser for the coordinator "Paste from Excel" box.
 * Schools copy a table straight out of Excel (tab-separated) or a CSV file;
 * this detects the delimiter, optionally the header row, and maps columns to
 * student fields with fuzzy header names plus content heuristics.
 */

export type ImportedStudent = {
  full_name: string;
  username: string;
  password: string;
  grade: number;
  email: string;
  mobile: string;
};

export type ColumnKind =
  | "full_name"
  | "username"
  | "password"
  | "grade"
  | "email"
  | "mobile"
  | "ignore";

export const COLUMN_KINDS: { value: ColumnKind; label: string }[] = [
  { value: "full_name", label: "Student name" },
  { value: "username", label: "Username" },
  { value: "password", label: "Password" },
  { value: "grade", label: "Class / grade" },
  { value: "email", label: "Student email" },
  { value: "mobile", label: "Mobile number" },
  { value: "ignore", label: "Ignore this column" },
];

export type ParsedTable = {
  headers: string[] | null;
  matrix: string[][];
  mapping: ColumnKind[];
};

const HEADER_PATTERNS: [ColumnKind, RegExp][] = [
  ["email", /e[-\s]?mail|mail\s*id|^mail$/i],
  ["mobile", /mobile|phone|contact|whatsapp|cell/i],
  ["grade", /class|grade|standard|std/i],
  ["password", /pass/i],
  ["username", /user\s*(name|id)?|login\s*id|^user$/i],
  ["full_name", /(student|full)?\s*name|name\s*of\s*student/i],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GRADE_RE = /^(8|9|10|11|12)$/;
const MOBILE_RE = /^(\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}$/;

function detectDelimiter(lines: string[]): string {
  const sample = lines.slice(0, 5);
  const counts = (ch: string) =>
    sample.reduce((max, l) => Math.max(max, (l.match(new RegExp(`\\${ch}`, "g")) ?? []).length), 0);
  if (counts("\t") >= 1) return "\t";
  if (counts(";") >= 2) return ";";
  if (counts(",") >= 2) return ",";
  return "\t"; // single-column paste — one field per line, mapped manually
}

/**
 * RFC-4180-style tokenizer: a cell wrapped in double quotes may contain the
 * delimiter, doubled quotes ("") and even line breaks, without splitting the
 * row in the wrong places.
 */
function splitDelimitedLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

function countQuotes(s: string): number {
  return (s.match(/"/g) ?? []).length;
}

/** Join lines whose quotes never close (a quoted cell spanning lines). */
function joinQuotedLines(lines: string[]): string[] {
  const out: string[] = [];
  let open: string | null = null;
  for (const line of lines) {
    if (open !== null) {
      const joined: string = `${open}\n${line}`;
      if (countQuotes(joined) % 2 === 0) {
        out.push(joined);
        open = null;
      } else {
        open = joined;
      }
    } else if (countQuotes(line) % 2 === 1) {
      open = line;
    } else {
      out.push(line);
    }
  }
  if (open !== null) out.push(open); // unterminated quote — keep as one row
  return out;
}

function looksLikeHeader(row: string[]): boolean {
  const hits = row.filter((cell) =>
    HEADER_PATTERNS.some(([, re]) => re.test(cell.trim())),
  ).length;
  return hits >= 2;
}

function guessMapping(headers: string[] | null, matrix: string[][]): ColumnKind[] {
  const cols = headers ? headers.length : Math.max(1, ...matrix.map((r) => r.length));
  const mapping: ColumnKind[] = new Array(cols).fill("ignore");
  const used = new Set<ColumnKind>();
  let heuristicHit = false;

  if (headers) {
    headers.forEach((h, i) => {
      const cell = h.trim();
      if (!cell) return;
      const hit = HEADER_PATTERNS.find(([, re]) => re.test(cell));
      if (hit && !used.has(hit[0])) {
        mapping[i] = hit[0];
        used.add(hit[0]);
      }
    });
  }

  // Content heuristics fill in whatever the headers left unmapped. They run
  // even on a single data row — a one-row paste has no other signal to go by.
  const sample = matrix.slice(0, 50);
  const majority = (i: number, test: (v: string) => boolean) => {
    const vals = sample.map((r) => (r[i] ?? "").trim()).filter(Boolean);
    if (vals.length < 1) return false;
    return vals.filter(test).length / vals.length > 0.6;
  };
  for (let i = 0; i < cols; i++) {
    const kind = mapping[i] ?? "ignore";
    if (kind !== "ignore") continue;
    if (!used.has("email") && majority(i, (v) => EMAIL_RE.test(v))) {
      mapping[i] = "email";
    } else if (!used.has("grade") && majority(i, (v) => GRADE_RE.test(v))) {
      mapping[i] = "grade";
    } else if (
      !used.has("mobile") &&
      majority(i, (v) => MOBILE_RE.test(v.replace(/\s/g, "")))
    ) {
      mapping[i] = "mobile";
    } else {
      continue;
    }
    const assigned = mapping[i];
    if (assigned) {
      used.add(assigned);
      heuristicHit = true;
    }
  }

  // Remaining text columns map in order: name → username → password.
  const order: ColumnKind[] = ["full_name", "username", "password"];
  for (let i = 0; i < cols; i++) {
    const kind = mapping[i] ?? "ignore";
    if (kind !== "ignore") continue;
    const next = order.find((k) => !used.has(k));
    if (!next) break;
    mapping[i] = next;
    used.add(next);
  }

  // A headerless paste with the advertised 5/6-column layout but no content
  // signal (grades written as "Grade 10", emails missing…) still maps to the
  // advertised order: Name, Class, Username, Password, Email[, Mobile].
  if (!headers && !heuristicHit && (cols === 5 || cols === 6)) {
    return cols === 5
      ? ["full_name", "grade", "username", "password", "email"]
      : ["full_name", "grade", "username", "password", "email", "mobile"];
  }
  return mapping;
}

export function parsePastedTable(text: string): ParsedTable {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (rawLines.length === 0) return { headers: null, matrix: [], mapping: [] };

  const delim = detectDelimiter(rawLines);
  const rows = joinQuotedLines(rawLines).map((l) => splitDelimitedLine(l, delim));

  const first = rows[0];
  if (first && rows.length > 1 && looksLikeHeader(first)) {
    const matrix = rows.slice(1);
    return { headers: first, matrix, mapping: guessMapping(first, matrix) };
  }
  // A lone row of header-like labels with no data is still treated as a header.
  if (first && rows.length === 1 && looksLikeHeader(first)) {
    return { headers: first, matrix: [], mapping: guessMapping(first, []) };
  }
  return { headers: null, matrix: rows, mapping: guessMapping(null, rows) };
}

/**
 * Minimum-signal guard: at least one column header or one cell must look like
 * real student data (an email, a class 8–12 or a mobile number). A paste that
 * fails this — a free-text list, a copy of the wrong sheet — is refused
 * instead of silently turning into meaningless student rows.
 */
export function tableHasSignal(table: ParsedTable): boolean {
  if (table.headers && table.headers.some((h) => HEADER_PATTERNS.some(([, re]) => re.test(h.trim())))) {
    return true;
  }
  // A headerless paste shaped exactly like the advertised layout (5 or 6
  // columns, name-like first column) counts as a signal too.
  const cols = table.headers
    ? table.headers.length
    : Math.max(0, ...table.matrix.map((r) => r.length));
  if (!table.headers && (cols === 5 || cols === 6)) {
    const nameLike = (v: string) => /^[\p{L}.'-]+( [\p{L}.'-]+)+$/u.test(v.trim());
    if (table.matrix.some((r) => nameLike(r[0] ?? ""))) return true;
  }
  for (const row of table.matrix.slice(0, 100)) {
    for (const cell of row) {
      const v = (cell ?? "").trim();
      if (!v) continue;
      if (EMAIL_RE.test(v) || GRADE_RE.test(v)) return true;
      if (MOBILE_RE.test(v.replace(/\s/g, ""))) return true;
    }
  }
  return false;
}

function normalizeUsername(v: string): string {
  return v.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

export function buildRows(matrix: string[][], mapping: ColumnKind[]): ImportedStudent[] {
  const rows: ImportedStudent[] = [];
  for (const cells of matrix) {
    const row: ImportedStudent = {
      full_name: "",
      username: "",
      password: "",
      grade: 8,
      email: "",
      mobile: "",
    };
    cells.forEach((cell, i) => {
      const kind = mapping[i];
      if (!kind || kind === "ignore") return;
      const v = (cell ?? "").trim();
      if (kind === "full_name") row.full_name = v;
      else if (kind === "username") row.username = normalizeUsername(v);
      else if (kind === "password") row.password = v;
      else if (kind === "grade") row.grade = Number(v) || 0;
      else if (kind === "email") row.email = v.trim().toLowerCase();
      else if (kind === "mobile") row.mobile = v.replace(/[^\d+]/g, "");
    });
    if (row.full_name || row.email || row.username) rows.push(row);
  }
  return rows;
}
