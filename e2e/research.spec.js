import { test, expect } from "@playwright/test";
const article = {
  doi: "10.1234/test",
  title: "Plant growth under drought",
  authors: "A. Researcher",
  year: 2024,
  type: "journal-article",
  keywords: ["Growth", "Drought"],
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
