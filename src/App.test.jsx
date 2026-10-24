import { test, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
test("switches purpose and adds accessible DOI inputs", async () => {
  render(<App />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("radio", { name: /Analyze and compare/ }));
  expect(screen.queryByLabelText(/Suggested articles/)).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Add another article/ }));
  expect(screen.getAllByLabelText(/Article DOI/)).toHaveLength(2);
});
test("searches, selects a result and opens experiment comparison", async () => {
  const request = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({
        articles: [
          {
            doi: "10.1234/test",
            title: "Plant growth",
            authors: "A. Researcher",
            year: 2024,
            keywords: ["growth"],
            summary: "Growth increased.",
            abstract: "Plant growth increased.",
            url: "https://doi.org/10.1234/test",
            type: "journal-article",
          },
        ],
      }),
    });
  vi.stubGlobal("fetch", request);
  render(<App />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Title, topic/), "Plant growth");
  await user.type(
    screen.getByLabelText(/Organized findings/),
    "Plant growth: 4 cm",
  );
  await user.click(
    screen.getByRole("button", { name: /Find research connections/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "Plant growth" }),
  ).toBeInTheDocument();
  const payload = JSON.parse(request.mock.calls[0][1].body);
  expect(payload.data).not.toContain("4 cm");
  await user.click(
    screen.getByRole("checkbox", { name: /Select Plant growth/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Compare with my findings/ }),
  );
  expect(await screen.findByRole("dialog")).toHaveTextContent(
    "Plant growth: 4 cm",
  );
  vi.unstubAllGlobals();
});
