# Research Matching Tool

Discover research and explore how published literature relates to organized experimental findings. This tool assists source discovery and reading; it does not write papers or validate experimental results.

## Run

Requires Node.js 24+; no external packages or API keys are required. Startup respects the environment's HTTPS proxy.

```sh
npm test
npm run check
npm start
```

The server uses port 3000 (override with `PORT`). Open the application in your local browser. The server requires HTTPS access to `api.crossref.org`.

## Workflow

1. Enter research context and organized findings, optionally importing a text/CSV/TSV file. Describe graphs in text.
2. Find articles using keywords, resource type and date filters, or resolve known DOIs/doi.org URLs.
3. Sort results, select references, compare their textual overlap with the experiment, or compare articles pairwise. DOI mode automatically displays summaries and experiment comparisons.

Summaries are publisher-deposited abstract extracts, capped at 1,000 characters. Missing abstracts are explicitly identified. Comparisons use shared terms from titles and abstracts, not semantic inference or quantitative scientific analysis. Statistical software is recorded as context, not executed. Relevance order comes from Crossref. Peer-review status and review-article classification cannot be reliably filtered with this provider. Arbitrary publisher URLs, PDFs, image graphs and full-text analysis are not yet supported; use DOIs or doi.org URLs.

Organized findings and statistics remain in browser memory; search context and keywords are sent through the server to Crossref. There is no database, account, analytics or persistent experiment storage. Reloading clears the workspace. No credentials should be entered into the form.

## Development

Use feature branches and pull requests; keep main protected in repository settings. Add a failing behavioral test first, implement the change, then run tests and syntax checks before review. CI runs the same checks. Current tests cover validation, metadata, comparison limits and HTTP/provider behavior using deterministic fixtures. Live provider checks are separate from automated tests.

Before public deployment add rate limiting, operational monitoring and a privacy review. Richer evidence-based summaries and method/effect-size comparison require a separate full-text retrieval and analysis design with source attribution.
