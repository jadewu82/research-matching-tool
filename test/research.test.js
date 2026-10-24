import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeDoi,
  validateRequest,
  normalizeWork,
  compare,
} from "../research.js";

test("accepts DOI identifiers and DOI URLs without accepting arbitrary URLs", () => {
  assert.equal(
    normalizeDoi("https://doi.org/10.1234/example"),
    "10.1234/example",
  );
  assert.equal(normalizeDoi("10.1234/example"), "10.1234/example");
  assert.throws(() => normalizeDoi("https://example.com/paper"));
});
test("requires context, organized findings and valid purpose-specific inputs", () => {
  const input = {
    context: "Plant growth methods",
    data: "Control: 2 cm; treatment: 4 cm",
    mode: "find",
    count: 5,
  };
  assert.doesNotThrow(() => validateRequest(input));
  assert.throws(() => validateRequest({ ...input, context: "" }));
  assert.throws(() => validateRequest({ ...input, count: 101 }));
  assert.throws(() => validateRequest({ ...input, mode: "analyze", dois: [] }));
  assert.throws(() =>
    validateRequest({ ...input, from: "2025-01-01", to: "2020-01-01" }),
  );
});
test("normalizes metadata and never fabricates an unavailable abstract", () => {
  const article = normalizeWork({
    DOI: "10.1234/a",
    title: ["Study"],
    author: [{ given: "A", family: "Smith" }],
    published: { "date-parts": [[2024]] },
  });
  assert.equal(article.title, "Study");
  assert.equal(article.authors, "A Smith");
  assert.equal(article.year, 2024);
  assert.match(article.summary, /No abstract/);
  assert.equal(article.peerReview.status, "unverified");
});
test("comparison identifies textual overlap while stating evidence limits", () => {
  const result = compare(
    { title: "Plant growth", abstract: "Treatment improves plant growth." },
    "Plant treatment growth",
    "Plant growth: 4 cm",
    "R",
  );
  assert.ok(result.sharedTerms.includes("growth"));
  assert.match(result.limitation, /does not validate/);
  assert.equal(result.statistics, "R");
});
