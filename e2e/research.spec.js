import { test, expect } from "@playwright/test";
const article = {
  doi: "10.1234/test",
  title: "Plant growth under drought",
  authors: "A. Researcher",
  year: 2024,
  type: "journal-article",
  keywords: ["Growth", "Drought"],
  fullText: {
    status: "available",
    sections: [
      {
        heading: "Methods",
        text: "Plant growth was measured under drought and treatment.",
      },
    ],
  },
  abstract: "Plant growth under drought and treatment.",
  summary: "Plant growth under drought and treatment.",
  url: "https://doi.org/10.1234/test",
};
test("search, expand summary, select, compare and close with keyboard", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/articles", (route) =>
    route.fulfill({
      json: {
        articles: [
          article,
          { ...article, doi: "10.1234/other", title: "Drought and treatment" },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Put your findings/ }),
  ).toBeVisible();
  await page
    .getByLabel("Title, topic, materials, and methods")
    .fill("Plant growth and treatment");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Treatment: plant growth 4 cm");
  await page.getByRole("button", { name: /Find research connections/ }).click();
  await expect(
    page.getByRole("heading", { name: article.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(article.summary, { exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Abstract summary" }).first().click();
  await expect(page.getByText(article.summary, { exact: true })).toBeVisible();
  await page
    .locator("label")
    .filter({
      has: page.getByRole("checkbox", {
        name: `Select ${article.title}`,
        exact: true,
      }),
    })
    .click();
  await page.getByRole("button", { name: "Compare with my findings" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Treatment: plant growth 4 cm",
  );
  await page.getByRole("tab", { name: "Evidence & limits" }).click();
  await expect(page.getByRole("tabpanel")).toContainText(
    "do not establish scientific agreement",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Select all" }).click();
  await page
    .getByRole("button", { name: "Compare articles", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Articles in conversation",
  );
  expect(errors).toEqual([]);
});
test("DOI mode adds and removes rows and automatically compares results on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/articles", (route) =>
    route.fulfill({ json: { articles: [article] } }),
  );
  await page.goto("/");
  await page
    .getByLabel("Title, topic, materials, and methods")
    .fill("Plant growth");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Growth: 4 cm");
  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name: /Analyze and compare/ }) })
    .click();
  await page.getByRole("button", { name: "Add another article" }).click();
  await expect(page.getByLabel(/Article DOI/)).toHaveCount(2);
  await page.getByRole("button", { name: "Remove article DOI 2" }).click();
  await page.getByLabel("Article DOI 1", { exact: true }).fill("10.1234/test");
  await page.getByRole("button", { name: "Analyze my articles" }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "Literature and your findings",
  );
  await page.getByRole("button", { name: "Close comparison" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("provider errors preserve form and permit retry", async ({ page }) => {
  await page.route("**/api/articles", (route) =>
    route.fulfill({
      status: 502,
      json: { error: "Crossref is temporarily unavailable." },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Title, topic, materials, and methods")
    .fill("Plant research");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Growth: 4 cm");
  await page.getByRole("button", { name: /Find research connections/ }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Crossref is temporarily unavailable.",
  );
  await expect(
    page.getByLabel("Organized findings", { exact: true }),
  ).toHaveValue("Growth: 4 cm");
  await expect(
    page.getByRole("button", { name: /Find research connections/ }),
  ).toBeEnabled();
});

test("mobile article comparison shows distinct evidence, peer-review provenance and missing abstracts", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const records = [
    {
      ...article,
      abstract: "Abstract-only detail must not appear in comparisons.",
      fullText: {
        status: "available",
        sections: [
          {
            heading: "Methods",
            text: "We randomized 40 plants to drought treatment.",
          },
          { heading: "Results", text: "Growth increased by 12.5 cm." },
        ],
      },
      peerReview: {
        status: "journal-policy",
        label: "Peer reviewed (journal policy)",
        detail: "DOAJ policy, not article-level verification.",
        sourceUrl: "https://doaj.org/toc/1932-6203",
      },
    },
    {
      ...article,
      doi: "10.1234/b",
      title: "Microscopy plant study",
      abstract: "Abstract-only detail must not appear in comparisons.",
      fullText: {
        status: "available",
        sections: [
          { heading: "Methods", text: "We used microscopy on 25 plants." },
          { heading: "Results", text: "Growth decreased by 3 cm." },
        ],
      },
    },
    {
      ...article,
      doi: "10.1234/c",
      title: "Study without full text",
      fullText: {
        status: "unavailable",
        reason: "Full text unavailable.",
        sections: [],
      },
      abstract: "",
    },
  ];
  await page.route("**/api/articles", (route) =>
    route.fulfill({
      json: { articles: records.map((a) => ({ ...a, fullText: undefined })) },
    }),
  );
  await page.route("**/api/full-text", (route) =>
    route.fulfill({
      json: {
        fullText: records.find(
          (a) => a.doi === route.request().postDataJSON().doi,
        ).fullText,
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Title, topic, materials, and methods")
    .fill("Plant growth");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Growth: 4 cm");
  await page.getByRole("button", { name: /Find research connections/ }).click();
  await expect(
    page.getByText("Peer reviewed (journal policy)", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select all" }).click();
  await page
    .getByRole("button", { name: "Compare articles", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("table")).toContainText("randomized 40 plants");
  await expect(dialog.getByRole("table")).toContainText(
    "microscopy on 25 plants",
  );
  await expect(dialog).not.toContainText(
    "Abstract-only detail must not appear in comparisons.",
  );
  await expect(dialog.getByRole("table")).toContainText("12.5 cm");
  await expect(dialog.getByRole("table")).toContainText("3 cm");
  await page.getByLabel("Article B", { exact: true }).selectOption("10.1234/c");
  await expect(dialog).toContainText("full text unavailable");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("comparison excludes the removed full-text questions section", async ({
  page,
}) => {
  await page.route("**/api/articles", (route) =>
    route.fulfill({
      json: {
        articles: [
          article,
          { ...article, doi: "10.1234/b", title: "Second article" },
        ],
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Title, topic, materials, and methods")
    .fill("Plant growth");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Growth: 4 cm");
  await page.getByRole("button", { name: /Find research connections/ }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page
    .getByRole("button", { name: "Compare articles", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toContainText(
    "Questions to check in the full text",
  );
});

test("unavailable full text is not replaced with an abstract and can be retried", async ({
  page,
}) => {
  const records = [
    {
      ...article,
      fullText: undefined,
      title: "Article A",
      abstract: "ABSTRACT ONLY CLAIM",
    },
    { ...article, fullText: undefined, doi: "10.1234/b", title: "Article B" },
  ];
  let attempts = 0;
  await page.route("**/api/articles", (route) =>
    route.fulfill({ json: { articles: records } }),
  );
  await page.route("**/api/full-text", (route) => {
    const doi = route.request().postDataJSON().doi;
    const failed = doi === article.doi && ++attempts === 1;
    return route.fulfill({
      json: {
        fullText: failed
          ? {
              status: "unavailable",
              reason: "Full text unavailable. Please retry.",
              sections: [],
            }
          : {
              status: "available",
              sections: [
                {
                  heading: "Methods",
                  text: "We measured 75 plants in the complete article body.",
                },
                { heading: "Results", text: "Growth increased by 8 cm." },
              ],
            },
      },
    });
  });
  await page.goto("/");
  await page.getByLabel("Title, topic, materials, and methods").fill("Growth");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Growth 4 cm");
  await page.getByRole("button", { name: /Find research connections/ }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page
    .getByRole("button", { name: "Compare articles", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Retry full text for Article A", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("table")).toContainText(
    "75 plants",
  );
  await expect(page.getByRole("dialog")).not.toContainText(
    "ABSTRACT ONLY CLAIM",
  );
});

test("unavailable provider coverage can be resolved by importing full text privately", async ({
  page,
}) => {
  const requests = [];
  page.on("request", (r) => {
    if (r.method() === "POST") requests.push(r.postData() || "");
  });
  await page.route("**/api/articles", (route) =>
    route.fulfill({
      json: {
        articles: [
          { ...article, fullText: undefined, abstract: "ABSTRACT ONLY CLAIM" },
          { ...article, doi: "10.1234/b", title: "Second article" },
        ],
      },
    }),
  );
  await page.route("**/api/full-text", (route) =>
    route.fulfill({
      json: {
        fullText: {
          status: "unavailable",
          retryable: false,
          reason: "No downloadable full text is available.",
          sections: [],
        },
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Title, topic, materials, and methods").fill("Growth");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Growth 4 cm");
  await page.getByRole("button", { name: /Find research connections/ }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page
    .getByRole("button", { name: "Compare articles", exact: true })
    .click();
  const chooserPromise = page.waitForEvent("filechooser");
  await page
    .getByRole("button", {
      name: `Import full text for ${article.title}`,
      exact: true,
    })
    .click();
  const chooser = await chooserPromise;
  await chooser.setFiles({
    name: "article-body.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Abstract\nABSTRACT ONLY CLAIM\nIntroduction\nWe assessed growth.\nMethods\nWe measured 60 plants using calibrated sensors.\nResults\nGrowth increased by 8 cm.\nLimitations\nThe small sample limits generalization.\nReferences\nCITATION CLAIM",
    ),
  });
  const table = page.getByRole("dialog").getByRole("table");
  await expect(table).toContainText("60 plants");
  await expect(table).toContainText("8 cm");
  await expect(table).toContainText("User-provided full text");
  await expect(table).not.toContainText("ABSTRACT ONLY CLAIM");
  await expect(table).not.toContainText("CITATION CLAIM");
  expect(requests.join(" ")).not.toContain("calibrated sensors");
});
test("an outdated backend is reported as a server version issue", async ({
  page,
}) => {
  await page.route("**/api/articles", (route) =>
    route.fulfill({
      json: {
        articles: [
          { ...article, fullText: undefined },
          { ...article, doi: "10.1234/b", title: "Second article" },
        ],
      },
    }),
  );
  await page.route("**/api/full-text", (route) =>
    route.fulfill({ status: 404, json: { error: "Not found" } }),
  );
  await page.goto("/");
  await page.getByLabel("Title, topic, materials, and methods").fill("Growth");
  await page
    .getByLabel("Organized findings", { exact: true })
    .fill("Growth 4 cm");
  await page.getByRole("button", { name: /Find research connections/ }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page
    .getByRole("button", { name: "Compare articles", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "The running server does not support full-text retrieval.",
  );
});
