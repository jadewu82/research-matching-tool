import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFullText, retrieveFullText } from "../full-text.js";
import { articleEvidence, compareArticles } from "../research.js";
const xml = `<article><front><article-meta><abstract><p>ABSTRACT ONLY CLAIM.</p></abstract></article-meta></front><body><sec sec-type="intro"><title>Introduction</title><p>We aimed to assess plant growth under drought.</p></sec><sec sec-type="methods"><title>Materials and methods</title><p>We randomized 40 plants and measured stem length.</p><sec><title>Microscopy</title><p>Images were collected at 5 nm resolution.</p></sec></sec><sec sec-type="results"><title>Results</title><p>Growth increased by 12.5 cm.</p><table-wrap><caption><p>Growth measurements</p></caption><table><tr><th>Control</th><td>3 cm</td></tr></table></table-wrap></sec><sec sec-type="discussion"><title>Limitations</title><p>The small sample size limits generalization.</p></sec></body><back><ref-list><ref><p>REFERENCE CLAIM.</p></ref></ref-list></back></article>`;
test("full-text parser includes nested methods and tables, excluding abstract and reference claims", () => {
  const result = parseFullText(xml);
  assert.match(JSON.stringify(result), /5 nm/);
  assert.match(JSON.stringify(result), /3 cm/);
  assert.doesNotMatch(JSON.stringify(result), /ABSTRACT ONLY|REFERENCE CLAIM/);
  const evidence = articleEvidence({
    title: "Plants",
    abstract: "ABSTRACT ONLY CLAIM.",
    fullText: {
      status: "available",
      sections: result,
      sourceUrl: "https://europepmc.org/articles/PMC123",
    },
  });
  assert.match(evidence.methods.join(" "), /randomized 40/);
  assert.match(evidence.findings.join(" "), /12.5 cm/);
  assert.match(evidence.limitations.join(" "), /small sample/);
  assert.doesNotMatch(JSON.stringify(evidence), /ABSTRACT ONLY/);
});
test("abstract-only articles never populate comparison summaries", () => {
  const result = compareArticles(
    { title: "A", abstract: "We randomized 40 plants." },
    { title: "B", abstract: "Growth increased by 12 cm." },
  );
  assert.deepEqual(result.left.methods, []);
  assert.deepEqual(result.right.findings, []);
  assert.match(result.coverage.join(" "), /full text unavailable/i);
});
test("retrieval verifies DOI and open-access availability before fetching full text", async () => {
  const calls = [];
  const result = await retrieveFullText("10.1234/plants", async (url) => {
    calls.push(url);
    return {
      ok: true,
      json: async () => ({
        resultList: {
          result: [
            { doi: "10.1234/plants", pmcid: "PMC123", isOpenAccess: "Y" },
          ],
        },
      }),
      text: async () => xml,
    };
  });
  assert.equal(result.status, "available");
  assert.equal(calls.length, 2);
  assert.match(calls[1], /PMC123\/fullTextXML$/);
  for (const record of [
    { doi: "10.1234/other", pmcid: "PMC123", isOpenAccess: "Y" },
    { doi: "10.1234/plants", pmcid: "PMC123", isOpenAccess: "N" },
  ]) {
    let count = 0;
    const missing = await retrieveFullText("10.1234/plants", async () => {
      count++;
      return {
        ok: true,
        json: async () => ({ resultList: { result: [record] } }),
      };
    });
    assert.equal(missing.status, "unavailable");
    assert.equal(count, 1);
  }
});
test("provider failure and an empty body give unavailable full text, not fabricated summaries", async () => {
  const result = await retrieveFullText("10.1234/plants", async () => {
    throw new Error("offline");
  });
  assert.equal(result.status, "unavailable");
  assert.deepEqual(parseFullText("<article><body/></article>"), []);
});
test("parser rejects entity declarations instead of resolving external resources", () =>
  assert.throws(() =>
    parseFullText(
      '<!DOCTYPE article [<!ENTITY x SYSTEM "file:///etc/passwd">]><article><body><p>&x;</p></body></article>',
    ),
  ));
