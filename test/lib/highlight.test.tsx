import { describe, it, expect } from "vitest";
import { isValidElement } from "react";
import { highlightText } from "@/lib/highlight";

// Walk the ReactNode output and return the list of substrings that were wrapped
// in a <mark>. Lets us assert highlighting behavior without rendering a DOM.
function markedParts(node: React.ReactNode): string[] {
  const arr = Array.isArray(node) ? node : [node];
  const marks: string[] = [];
  for (const part of arr) {
    if (isValidElement(part)) {
      marks.push((part.props as { children: string }).children);
    }
  }
  return marks;
}

// Reconstruct the full visible text regardless of marking.
function fullText(node: React.ReactNode): string {
  if (typeof node === "string") return node;
  const arr = Array.isArray(node) ? node : [node];
  return arr
    .map((part) =>
      isValidElement(part) ? (part.props as { children: string }).children : String(part)
    )
    .join("");
}

describe("highlightText", () => {
  it("returns the original text unchanged when the query is empty/whitespace", () => {
    expect(highlightText("Hello world", "")).toBe("Hello world");
    expect(highlightText("Hello world", "   ")).toBe("Hello world");
  });

  it("highlights a single case-insensitive match while preserving original case", () => {
    const out = highlightText("Hello World", "world");
    expect(markedParts(out)).toEqual(["World"]);
    expect(fullText(out)).toBe("Hello World");
  });

  it("highlights ALL occurrences, including adjacent ones", () => {
    // "is" appears in This, the standalone "is", his, and list -> 4 matches.
    expect(markedParts(highlightText("This is his list", "is"))).toEqual(["is", "is", "is", "is"]);
    expect(markedParts(highlightText("aaa", "a"))).toEqual(["a", "a", "a"]);
  });

  it("does not lose text around matches", () => {
    const out = highlightText("foo bar foo", "bar");
    expect(fullText(out)).toBe("foo bar foo");
    expect(markedParts(out)).toEqual(["bar"]);
  });

  it("treats regex metacharacters in the query as literals", () => {
    expect(markedParts(highlightText("price is $5.00 (today)", "$5.00"))).toEqual(["$5.00"]);
    expect(markedParts(highlightText("a.b.c", "."))).toEqual([".", "."]);
    expect(markedParts(highlightText("use a+b", "a+b"))).toEqual(["a+b"]);
  });

  it("returns no marks when there is no match", () => {
    expect(markedParts(highlightText("nothing here", "zzz"))).toEqual([]);
    expect(fullText(highlightText("nothing here", "zzz"))).toBe("nothing here");
  });
});
