/**
 * CSV / Excel parser → typed columns + rows.
 *
 * Uses the `xlsx` package (already a dep) so the same code path handles
 * .csv, .tsv, .xls, .xlsx. Type inference looks at every value in a column
 * and picks the narrowest Postgres type that fits.
 */
import * as XLSX from "xlsx";
import { sanitizeIdent } from "./sql-ident";

export type ColType = "integer" | "double precision" | "timestamptz" | "boolean" | "text";

export type ParsedColumn = {
  /** Sanitized column name, safe to use as a Postgres identifier. */
  name: string;
  /** Original header from the file, preserved for display. */
  originalName: string;
  type: ColType;
};

export type ParsedDataset = {
  columns: ParsedColumn[];
  /** Rows as arrays in column order. Cell values are typed-coerced (number, Date, boolean, string, null). */
  rows: (string | number | boolean | Date | null)[][];
};

const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const US_DATE_RE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/;

function inferCellType(v: unknown): ColType | "null" {
  if (v === null || v === undefined || v === "") return "null";
  if (typeof v === "boolean") return "boolean";
  if (typeof v === "number") {
    return Number.isInteger(v) ? "integer" : "double precision";
  }
  if (v instanceof Date) return "timestamptz";
  const s = String(v).trim();
  if (s === "") return "null";
  // Boolean-ish
  if (/^(true|false)$/i.test(s)) return "boolean";
  // Number-ish
  if (/^-?\d+$/.test(s)) {
    // Avoid bigint overflow → fall back to double precision
    const n = Number(s);
    return Number.isSafeInteger(n) ? "integer" : "double precision";
  }
  if (/^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s)) return "double precision";
  // Date-ish
  if (ISO_DATE_RE.test(s) || US_DATE_RE.test(s)) {
    if (!isNaN(Date.parse(s))) return "timestamptz";
  }
  return "text";
}

/** Pick the most permissive type from a column's observed types. */
function unifyTypes(types: Set<ColType>): ColType {
  if (types.size === 0) return "text";
  if (types.has("text")) return "text";
  if (types.has("timestamptz")) {
    // Mixed dates + numbers → fall back to text
    if (types.has("integer") || types.has("double precision") || types.has("boolean")) return "text";
    return "timestamptz";
  }
  if (types.has("double precision")) return "double precision";
  if (types.has("integer")) return "integer";
  if (types.has("boolean")) return "boolean";
  return "text";
}

function coerceCell(v: unknown, type: ColType): string | number | boolean | Date | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return type === "timestamptz" ? v : v.toISOString();
  switch (type) {
    case "integer": {
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return Number.isFinite(n) ? Math.trunc(n) : null;
    }
    case "double precision": {
      const n = typeof v === "number" ? v : Number(String(v).trim());
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      if (typeof v === "boolean") return v;
      const s = String(v).trim().toLowerCase();
      if (s === "true" || s === "1" || s === "yes" || s === "y") return true;
      if (s === "false" || s === "0" || s === "no" || s === "n") return false;
      return null;
    }
    case "timestamptz": {
      const d = v instanceof Date ? v : new Date(String(v));
      return isNaN(d.getTime()) ? null : d;
    }
    case "text":
    default:
      return String(v);
  }
}

/**
 * Parse a buffer (any format xlsx supports) into typed columns + rows.
 * Throws if the file is empty or has no header row.
 */
export function parseSpreadsheet(buf: ArrayBuffer | Buffer, filename: string): ParsedDataset {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error("File has no sheets");
  const sheet = wb.Sheets[sheetName];

  // header: 1 → return array of arrays so we control naming
  const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  if (aoa.length === 0) throw new Error("File is empty");
  const headerRow = aoa[0];
  if (!headerRow || headerRow.length === 0) throw new Error("File has no header row");

  // De-duplicate sanitized column names
  const seen = new Set<string>();
  const columns: ParsedColumn[] = headerRow.map((h, i) => {
    const orig = h == null || h === "" ? `col_${i + 1}` : String(h);
    let name = sanitizeIdent(orig);
    if (seen.has(name)) {
      let k = 2;
      while (seen.has(`${name}_${k}`)) k++;
      name = `${name}_${k}`;
    }
    seen.add(name);
    return { name, originalName: orig, type: "text" };
  });

  // Infer types from a sample of up to 1000 rows for speed
  const dataRows = aoa.slice(1);
  const sample = dataRows.slice(0, 1000);
  const colTypeSets: Set<ColType>[] = columns.map(() => new Set());
  for (const row of sample) {
    for (let i = 0; i < columns.length; i++) {
      const t = inferCellType(row[i]);
      if (t !== "null") colTypeSets[i].add(t);
    }
  }
  for (let i = 0; i < columns.length; i++) {
    columns[i].type = unifyTypes(colTypeSets[i]);
  }

  // Coerce all rows to the inferred type
  const rows = dataRows.map((row) =>
    columns.map((c, i) => coerceCell(row[i], c.type))
  );

  return { columns, rows };
}

/** Strip the file extension and return a base name suitable for sanitizing. */
export function baseNameForTable(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}
