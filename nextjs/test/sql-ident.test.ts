import { describe, it, expect } from "vitest";
import {
  sanitizeIdent,
  quoteIdent,
  qualifiedTable,
  uniqueTableName,
} from "@/lib/sql-ident";

describe("sanitizeIdent", () => {
  it("lowercases and replaces non-alphanumerics with underscores", () => {
    expect(sanitizeIdent("Order Date")).toBe("order_date");
    expect(sanitizeIdent("user@email.com")).toBe("user_email_com");
    expect(sanitizeIdent("Customer ID #")).toBe("customer_id");
  });

  it("collapses repeated underscores and trims edges", () => {
    expect(sanitizeIdent("__foo__bar__")).toBe("foo_bar");
    expect(sanitizeIdent("a   b   c")).toBe("a_b_c");
  });

  it("prepends an underscore for digit-leading names", () => {
    expect(sanitizeIdent("123abc")).toBe("_123abc");
    expect(sanitizeIdent("2024_q1")).toBe("_2024_q1");
  });

  it("prepends an underscore for reserved words", () => {
    expect(sanitizeIdent("select")).toBe("_select");
    expect(sanitizeIdent("FROM")).toBe("_from");
    expect(sanitizeIdent("Where")).toBe("_where");
  });

  it("returns 'col' for empty input", () => {
    expect(sanitizeIdent("")).toBe("col");
    expect(sanitizeIdent("   ")).toBe("col");
    expect(sanitizeIdent("!!!")).toBe("col");
  });

  it("truncates to 63 chars", () => {
    const long = "a".repeat(80);
    expect(sanitizeIdent(long).length).toBe(63);
  });
});

describe("quoteIdent", () => {
  it("wraps in double quotes", () => {
    expect(quoteIdent("foo")).toBe('"foo"');
  });

  it("escapes embedded quotes", () => {
    expect(quoteIdent('weird"name')).toBe('"weird""name"');
  });
});

describe("qualifiedTable", () => {
  it("joins schema and table with a dot", () => {
    expect(qualifiedTable("ws_abc", "orders")).toBe('"ws_abc"."orders"');
  });
});

describe("uniqueTableName", () => {
  it("returns the base name when not taken", () => {
    expect(uniqueTableName("orders", [])).toBe("orders");
    expect(uniqueTableName("orders", ["customers", "products"])).toBe("orders");
  });

  it("appends a counter when taken", () => {
    expect(uniqueTableName("orders", ["orders"])).toBe("orders_2");
    expect(uniqueTableName("orders", ["orders", "orders_2"])).toBe("orders_3");
    expect(uniqueTableName("orders", ["orders", "orders_2", "orders_3"])).toBe("orders_4");
  });

  it("sanitizes the base name first", () => {
    expect(uniqueTableName("Order Date", [])).toBe("order_date");
  });
});
