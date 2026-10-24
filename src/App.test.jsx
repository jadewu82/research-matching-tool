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
  const request = vi.fn().mockResolvedValue({
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

test("shows sourced peer-review labels and compares distinct methods and findings for selected articles", async () => {
  const fixtures = [
    {
      doi: "10.1234/a",
      title: "Plant treatment trial",
      fullText: {
        status: "available",
        sections: [
          { heading: "Methods", text: "We randomized 40 plants to treatment." },
          { heading: "Results", text: "Growth increased by 12.5 cm." },
        ],
      },
      authors: "Author A",
      year: 2024,
      url: "https://doi.org/10.1234/a",
      keywords: [],
      abstract:
        "We randomized 40 plants to treatment. Results showed growth increased by 12.5 cm.",
      peerReview: {
        status: "journal-policy",
        label: "Peer reviewed (journal policy)",
        detail: "DOAJ journal policy, not article-level verification.",
        sourceUrl: "https://doaj.org/toc/1932-6203",
      },
    },
    {
      doi: "10.1234/b",
      title: "Microscopy growth study",
      fullText: {
        status: "available",
        sections: [
          { heading: "Methods", text: "We used microscopy on 25 plants." },
          { heading: "Results", text: "Growth decreased by 3 cm." },
        ],
      },
      authors: "Author B",
      year: 2023,
      url: "https://doi.org/10.1234/b",
      keywords: [],
      abstract:
        "We used microscopy on 25 plants. Results showed growth decreased by 3 cm.",
      peerReview: {
        status: "unverified",
        label: "Peer review unverified",
        detail: "Not verified.",
      },
    },
    {
      doi: "10.1234/c",
      title: "Missing abstract study",
      fullText: {
        status: "unavailable",
        reason: "Full text unavailable.",
        sections: [],
      },
      authors: "Author C",
      url: "https://doi.org/10.1234/c",
      keywords: [],
      abstract: "",
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ articles: fixtures }),
    }),
  );
  render(<App />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/Title, topic/), "Plant growth");
  await user.type(screen.getByLabelText(/Organized findings/), "Growth: 4 cm");
  await user.click(
    screen.getByRole("button", { name: /Find research connections/ }),
  );
  expect(
    await screen.findByText("Peer reviewed (journal policy)"),
  ).toBeInTheDocument();
  for (const a of fixtures)
    await user.click(
      screen.getByRole("checkbox", { name: `Select ${a.title}`, exact: true }),
    );
  await user.click(
    screen.getByRole("button", { name: "Compare articles", exact: true }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(dialog).toHaveTextContent("We randomized 40 plants");
  expect(dialog).toHaveTextContent("We used microscopy");
  expect(dialog).toHaveTextContent("Growth increased by 12.5 cm");
  expect(dialog).toHaveTextContent("Growth decreased by 3 cm");
  await user.selectOptions(screen.getByLabelText("Article B"), "10.1234/c");
  expect(dialog).toHaveTextContent("full text unavailable");
  expect(dialog).not.toHaveTextContent("We used microscopy");
  vi.unstubAllGlobals();
});
