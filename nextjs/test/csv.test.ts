import { describe, it, expect } from "vitest";
import { parseSpreadsheet, baseNameForTable } from "@/lib/csv";

function csvBuf(text: string): Buffer {
  return Buffer.from(text, "utf-8");
}

describe("baseNameForTable", () => {
  it("strips the extension", () => {
    expect(baseNameForTable("orders.csv")).toBe("orders");
    expect(baseNameForTable("Orders 2024.xlsx")).toBe("Orders 2024");
    expect(baseNameForTable("noext")).toBe("noext");
  });
});

describe("parseSpreadsheet (CSV)", () => {
  it("infers integer / double / text columns from a small CSV", () => {
    const buf = csvBuf(
      [
        "id,name,score,active",
        "1,Alice,9.5,true",
        "2,Bob,7.25,false",
        "3,Carol,6,true",
      ].join("\n")
    );
    const parsed = parseSpreadsheet(buf, "test.csv");
    expect(parsed.columns.map((c) => c.name)).toEqual(["id", "name", "score", "active"]);
    expect(parsed.columns.find((c) => c.name === "id")?.type).toBe("integer");
    expect(parsed.columns.find((c) => c.name === "name")?.type).toBe("text");
    expect(parsed.columns.find((c) => c.name === "score")?.type).toBe("double precision");
    expect(parsed.columns.find((c) => c.name === "active")?.type).toBe("boolean");
    expect(parsed.rows.length).toBe(3);
  });

  it("sanitizes column names and de-dupes", () => {
    const buf = csvBuf("Order Date,Order Date,Total\n2024-01-01,2024-01-01,10");
    const parsed = parseSpreadsheet(buf, "test.csv");
    const names = parsed.columns.map((c) => c.name);
    expect(names[0]).toBe("order_date");
    expect(names[1]).toBe("order_date_2");
    expect(names[2]).toBe("total");
  });

  it("falls back to text when types mix", () => {
    const buf = csvBuf("col\n1\nfoo\n2");
    const parsed = parseSpreadsheet(buf, "test.csv");
    expect(parsed.columns[0].type).toBe("text");
  });

  it("handles empty cells as null", () => {
    const buf = csvBuf("a,b\n1,\n2,3");
    const parsed = parseSpreadsheet(buf, "test.csv");
    expect(parsed.rows[0][1]).toBe(null);
    expect(parsed.rows[1][1]).toBe(3);
  });
});
