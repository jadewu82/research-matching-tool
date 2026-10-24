import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMaximumAcademicPress } from "../publisher-full-text.js";
import { retrieveFullText } from "../full-text.js";
import { articleEvidence } from "../research.js";
const doi = "10.48130/fmr-0024-0018";
const html = `<!doctype html><html><head><meta name="citation_doi" content="${doi}"></head><body><nav>UNRELATED NAVIGATION</nav><section id="Abstract"><p>ABSTRACT ONLY CLAIM</p></section><ul id="htmlContent2"><h3>HTML</h3><figure vid="s01"><figcaption class="navTitle">Introduction</figcaption><ul><li><p>This review focuses on SERS detection in meat products.</p><!-- DUPLICATED COMMENT --></li></ul></figure><figure vid="s02"><figcaption class="navTitle">SERS detection modes</figcaption><ul><li><p>Labeled detection uses antibodies and SERS tags to capture target molecules.</p><h4>Label-free detection</h4><p>Label-free detection measures intrinsic Raman signals.</p></li></ul></figure><figure vid="s03"><figcaption>Results and applications</figcaption><p>Detection improved sensitivity to 1 μg/mL.</p><table><tr><th>Target</th><th>Detection limit</th></tr><tr><td>Sodium nitrite</td><td>3.75 mg/kg</td></tr></table></figure><figure vid="s04"><figcaption>Limitations and future perspectives</figcaption><p>Reproducibility and matrix interference limit practical detection.</p></figure></ul><section id="References"><p>REFERENCE ONLY CLAIM</p></section></body></html>`;
test("publisher HTML extraction verifies DOI and extracts only full article sections and tables", () => {
  const sections = parseMaximumAcademicPress(html, doi);
  assert.match(JSON.stringify(sections), /3.75 mg\/kg/);
  assert.doesNotMatch(
    JSON.stringify(sections),
    /ABSTRACT ONLY|REFERENCE ONLY|UNRELATED NAVIGATION|DUPLICATED COMMENT/,
  );
  assert.match(
    sections.find((s) => s.text.includes("intrinsic Raman")).heading,
    /SERS detection modes.*Label-free detection/,
  );
  const summary = articleEvidence({
    title: "SERS review",
    fullText: { status: "available", sections },
  });
  assert.equal(summary.isReview, true);
  assert.match(summary.methods.join(" "), /antibodies|intrinsic Raman/);
  assert.match(summary.measurements.join(" "), /1 μg\/mL|3.75 mg\/kg/);
  assert.match(summary.limitations.join(" "), /Reproducibility/);
});
test("retrieval supports the failing DOI directly from its public publisher page", async () => {
  const calls = [];
  const result = await retrieveFullText(doi, async (url, options) => {
    calls.push(url);
    assert.equal(options.redirect, "error");
    return { ok: true, text: async () => html };
  });
  assert.equal(result.status, "available");
  assert.equal(result.provider, "Maximum Academic Press");
  assert.equal(calls.length, 1);
  assert.equal(calls[0], `https://www.maxapress.com/article/doi/${doi}`);
});
test("wrong article and abstract-only pages are rejected", () => {
  assert.throws(() => parseMaximumAcademicPress(html, "10.48130/other"));
  assert.throws(() =>
    parseMaximumAcademicPress(
      `<meta name="citation_doi" content="${doi}"><div id="Abstract">Abstract only</div>`,
      doi,
    ),
  );
});
test("publisher failure remains explicit and cannot silently return an abstract", async () => {
  const result = await retrieveFullText(doi, async () => ({
    ok: false,
    status: 503,
  }));
  assert.equal(result.status, "unavailable");
  assert.match(result.reason, /publisher|Maximum Academic Press/i);
  assert.deepEqual(result.sections, []);
});
