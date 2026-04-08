/**
 * Postgres identifier helpers.
 *
 * Anything that becomes a table name or column name in user-facing data
 * MUST go through `sanitizeIdent` first, then `quoteIdent` when interpolated
 * into raw SQL. Drizzle's parameterized API only handles VALUES, not idents.
 */

const RESERVED = new Set([
  // not exhaustive — just the ones that are easy to type by accident
  "select",
  "from",
  "where",
  "table",
  "user",
  "group",
  "order",
  "join",
  "left",
  "right",
  "inner",
  "outer",
  "and",
  "or",
  "not",
  "null",
  "as",
  "in",
  "is",
  "case",
  "when",
  "then",
  "else",
  "end",
  "limit",
  "offset",
  "by",
  "asc",
  "desc",
  "having",
  "union",
  "all",
  "distinct",
  "into",
  "values",
  "insert",
  "update",
  "delete",
  "drop",
  "create",
  "alter",
]);

/**
 * Convert any user-supplied string into a safe Postgres identifier.
 * - lowercase
 * - non-alphanumeric → underscore
 * - collapse repeated underscores
 * - strip leading/trailing underscores
 * - prepend `_` if it starts with a digit
 * - prepend `_` if it collides with a reserved word
 * - truncate to 63 chars (PG NAMEDATALEN limit)
 * - empty input becomes `col`
 *
 * The result is always non-empty and matches /^[a-z_][a-z0-9_]*$/.
 */
export function sanitizeIdent(input: string): string {
  let s = (input ?? "").toString().toLowerCase();
  s = s.replace(/[^a-z0-9_]+/g, "_");
  s = s.replace(/_+/g, "_");
  s = s.replace(/^_+|_+$/g, "");
  if (!s) s = "col";
  if (/^[0-9]/.test(s)) s = "_" + s;
  if (RESERVED.has(s)) s = "_" + s;
  if (s.length > 63) s = s.slice(0, 63);
  return s;
}

/**
 * Wrap a sanitized identifier in double quotes for interpolation into raw SQL.
 * Always pass through `sanitizeIdent` first.
 */
export function quoteIdent(name: string): string {
  // Defensive: re-escape any embedded double-quotes (should not happen
  // post-sanitize, but cheap insurance against bugs upstream).
  return `"${name.replace(/"/g, '""')}"`;
}

/** Build a fully qualified `"schema"."table"` reference. */
export function qualifiedTable(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`;
}

/**
 * Generate a unique table name from a desired base name and a list of
 * existing names. Appends `_2`, `_3`, ... if the base is taken.
 */
export function uniqueTableName(base: string, existing: Iterable<string>): string {
  const taken = new Set(existing);
  const baseSan = sanitizeIdent(base);
  if (!taken.has(baseSan)) return baseSan;
  let i = 2;
  while (taken.has(`${baseSan}_${i}`)) i++;
  return `${baseSan}_${i}`;
}
