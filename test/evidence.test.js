import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichPeerReview } from "../peer-review.js";
import { compareArticles } from "../research.js";

test("journal review labels have verifiable DOAJ policy evidence, not merely journal article type", async () => {
  const works = [
    { DOI: "10.1234/a", type: "journal-article", ISSN: ["1932-6203"] },
    { DOI: "10.1234/b", type: "journal-article", ISSN: ["1932-6203"] },
  ];
  let calls = 0;
  const records = await enrichPeerReview(works, async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({
        results: [
          {
            bibjson: {
              eissn: "1932-6203",
              editorial: { review_process: ["Single anonymous peer review"] },
            },
          },
        ],
      }),
    };
  });
  assert.equal(calls, 1);
  assert.equal(records[0].peerReview.status, "journal-policy");
  assert.match(records[0].peerReview.label, /Peer reviewed/);
  assert.match(records[0].peerReview.detail, /not article-level/);
  assert.match(records[0].peerReview.sourceUrl, /^https:\/\/doaj.org\//);
});
test("missing records and provider failure never become negative peer-review claims", async () => {
  const work = {
    DOI: "10.1234/a",
    type: "journal-article",
    ISSN: ["1234-567X"],
  };
  for (const fetcher of [
    async () => ({ ok: true, json: async () => ({ results: [] }) }),
    async () => {
      throw new Error("unavailable");
    },
  ]) {
    const [record] = await enrichPeerReview([work], fetcher);
    assert.equal(record.peerReview.status, "unverified");
    assert.match(record.peerReview.detail, /does not mean/);
  }
});
test("preprints and editorial-only review are not labeled peer reviewed", async () => {
  const works = [
    { type: "posted-content", subtype: "preprint", ISSN: ["1932-6203"] },
    { type: "journal-article", ISSN: ["1234-567X"] },
  ];
  const records = await enrichPeerReview(works, async () => ({
    ok: true,
    json: async () => ({
      results: [
        {
          bibjson: {
            identifier: [{ id: "1234-567X" }],
            editorial: { review_process: ["Editorial review"] },
          },
        },
      ],
    }),
  }));
  assert.equal(records[0].peerReview.status, "preprint");
  assert.equal(records[1].peerReview.status, "editorial-policy");
});
test("DOAJ record must match the requested ISSN", async () => {
  const [record] = await enrichPeerReview(
    [{ type: "journal-article", ISSN: ["1234-567X"] }],
    async () => ({
      ok: true,
      json: async () => ({
        results: [
          {
            bibjson: {
              identifier: [{ id: "9999-9999" }],
              editorial: { review_process: ["Peer review"] },
            },
          },
        ],
      }),
    }),
  );
  assert.equal(record.peerReview.status, "unverified");
});
test("article comparison preserves attributable methods, findings, measurements and missing evidence on both sides", () => {
  const a = {
    doi: "10.1234/a",
    title: "Plant drought trial",
    abstract:
      "We randomized 40 plants to drought treatment. Results showed growth increased by 12.5 cm. The small sample size is a limitation.",
    url: "https://doi.org/10.1234/a",
  };
  const b = {
    doi: "10.1234/b",
    title: "Plant growth microscopy",
    abstract:
      "We used microscopy on 25 plants. Results showed growth decreased by 3 cm.",
    url: "https://doi.org/10.1234/b",
  };
  a.fullText = {
    status: "available",
    sections: [
      {
        heading: "Methods",
        text: "We randomized 40 plants to drought treatment.",
      },
      { heading: "Results", text: "Growth increased by 12.5 cm." },
      {
        heading: "Limitations",
        text: "The small sample size is a limitation.",
      },
    ],
  };
  b.fullText = {
    status: "available",
    sections: [
      { heading: "Methods", text: "We used microscopy on 25 plants." },
      { heading: "Results", text: "Growth decreased by 3 cm." },
    ],
  };
  const result = compareArticles(a, b);
  assert.ok(result.sharedTerms.includes("growth"));
  assert.match(result.left.methods.join(" "), /randomized 40/);
  assert.match(result.right.methods.join(" "), /microscopy/);
  assert.match(result.left.measurements.join(" "), /12.5 cm/);
  assert.match(result.left.findings.join(" "), /increased/);
  assert.match(result.right.findings.join(" "), /decreased/);
  assert.match(result.left.limitations.join(" "), /small sample/);
  assert.equal(result.left.url, a.url);
  const missing = compareArticles(a, { title: "Unavailable", abstract: "" });
  assert.equal(missing.right.findings.length, 0);
  assert.match(missing.coverage.join(" "), /Unavailable.*full text/i);
});
