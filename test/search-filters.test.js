import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRequest, normalizeWork } from "../research.js";
import {
  enrichSearchMetadata,
  matchesSearchFilters,
} from "../search-metadata.js";
test("data is optional and dates are years, with validated language and review filters", () => {
  const request = {
    mode: "find",
    context: "Raman spectroscopy",
    count: 10,
    type: "review-article",
    from: "2020",
    to: "2024",
    language: "en",
  };
  assert.doesNotThrow(() => validateRequest(request));
  assert.doesNotThrow(() => validateRequest({ ...request, data: "" }));
  for (const patch of [
    { from: "2020-01-01" },
    { from: "2025", to: "2020" },
    { language: "invented" },
    { data: 42 },
  ])
    assert.throws(() => validateRequest({ ...request, ...patch }));
});
test("review and language filters use metadata, not the article title as language detection", async () => {
  const works = [
    {
      DOI: "10.1234/a",
      type: "journal-article",
      title: ["A systematic review"],
      language: "fr",
    },
    {
      DOI: "10.1234/b",
      type: "journal-article",
      title: ["Plant experiment"],
      language: "en",
    },
    {
      DOI: "10.1234/c",
      type: "journal-article",
      title: ["English-looking title"],
    },
  ];
  const enriched = await enrichSearchMetadata(works, async () => ({
    ok: true,
    json: async () => ({
      resultList: {
        result: [
          {
            doi: "10.1234/a",
            language: "eng",
            pubTypeList: { pubType: ["Review", "Journal Article"] },
          },
        ],
      },
    }),
  }));
  assert.equal(enriched[0].articleKind, "review");
  assert.equal(enriched[0].detectedLanguage, "en");
  assert.ok(
    matchesSearchFilters(enriched[0], {
      type: "review-article",
      language: "en",
    }),
  );
  assert.equal(
    matchesSearchFilters(enriched[0], { type: "journal-article" }),
    false,
  );
  assert.equal(matchesSearchFilters(enriched[2], { language: "en" }), false);
  assert.equal(normalizeWork(enriched[0]).resourceLabel, "Review article");
});
test("unavailable metadata does not turn unknown languages or article types into matches", async () => {
  const [work] = await enrichSearchMetadata(
    [{ DOI: "10.1234/a", type: "journal-article", title: ["Study"] }],
    async () => {
      throw new Error("offline");
    },
  );
  assert.equal(matchesSearchFilters(work, { type: "review-article" }), false);
  assert.equal(matchesSearchFilters(work, { language: "en" }), false);
});

test("known publisher metadata resolves missing review and language fields for the reported DOI", async () => {
  const doi = "10.48130/fmr-0024-0018";
  const [work] = await enrichSearchMetadata(
    [{ DOI: doi, type: "journal-article", title: ["Recent advances in SERS"] }],
    async (url) =>
      url.startsWith("https://www.maxapress.com")
        ? {
            ok: true,
            text: async () =>
              `<meta name="citation_doi" content="${doi}"><meta name="citation_language" content="en"><ul id="htmlContent2"><figure><figcaption>Introduction</figcaption><p>This review focuses on SERS detection in meat.</p></figure></ul>`,
          }
        : { ok: true, json: async () => ({ resultList: { result: [] } }) },
  );
  assert.equal(work.articleKind, "review");
  assert.equal(work.detectedLanguage, "en");
  assert.ok(
    matchesSearchFilters(work, { type: "review-article", language: "en" }),
  );
});
