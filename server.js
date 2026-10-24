import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeDoi, normalizeWork, validateRequest } from "./research.js";

import {
  enrichSearchMetadata,
  initialSearchMetadata,
  matchesSearchFilters,
} from "./search-metadata.js";
import { retrieveFullText } from "./full-text.js";
import { enrichPeerReview } from "./peer-review.js";

export function createServer(fetcher = fetch) {
  return http.createServer(async (req, res) => {
    const send = (status, data) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    if (req.method === "GET" && req.url === "/api/health") {
      send(200, { status: "ok", fullTextApiVersion: 2 });
      return;
    }
    if (req.method === "POST" && req.url === "/api/full-text") {
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 2000) {
            send(413, { error: "Request too large." });
            return;
          }
        }
        const input = JSON.parse(body);
        const doi = normalizeDoi(input.doi);
        send(200, { doi, fullText: await retrieveFullText(doi, fetcher) });
      } catch (error) {
        send(400, { error: error.message });
      }
      return;
    }
    if (req.method === "POST" && req.url === "/api/articles") {
      let input;
      try {
        let body = "";
        for await (const chunk of req) {
          body += chunk;
          if (Buffer.byteLength(body) > 100000) {
            send(413, { error: "Request too large." });
            return;
          }
        }
        input = JSON.parse(body);
        validateRequest(input);
      } catch (error) {
        send(400, { error: error.message });
        return;
      }
      try {
        const get = async (path) => {
          const response = await fetcher(
            `https://api.crossref.org/works${path}`,
            {
              headers: {
                "User-Agent": "ResearchMatchingTool/0.1 (research discovery)",
              },
              signal: AbortSignal.timeout(20000),
            },
          );
          if (!response.ok)
            throw new Error(
              response.status === 404
                ? "A DOI was not found in Crossref."
                : `Literature provider returned ${response.status}. Try again later.`,
            );
          return (await response.json()).message;
        };
        let works;
        if (input.mode === "analyze")
          works = await Promise.all(
            [...new Set(input.dois.map(normalizeDoi))].map((doi) =>
              get("/" + encodeURIComponent(doi)),
            ),
          );
        else {
          const params = new URLSearchParams({
            "query.bibliographic": [
              input.context.slice(0, 3000),
              input.keywords || "",
              input.type === "review-article" ? "review" : "",
            ].join(" "),
            rows: String(
              input.language ||
                input.type === "review-article" ||
                input.type === "journal-article"
                ? Math.min(100, input.count * 5)
                : input.count,
            ),
          });
          const filters = [];
          if (input.type)
            filters.push(
              `type:${input.type === "review-article" ? "journal-article" : input.type}`,
            );
          if (input.from) filters.push(`from-pub-date:${input.from}-01-01`);
          if (input.to) filters.push(`until-pub-date:${input.to}-12-31`);
          if (filters.length) params.set("filter", filters.join(","));
          works = (await get("?" + params)).items;
        }
        const classified =
          input.mode === "find" &&
          (input.language ||
            ["review-article", "journal-article"].includes(input.type))
            ? await enrichSearchMetadata(works, fetcher)
            : works.map(initialSearchMetadata);
        const matching =
          input.mode === "find"
            ? classified
                .filter((work) => matchesSearchFilters(work, input))
                .slice(0, input.count)
            : classified;
        const enriched = await enrichPeerReview(matching, fetcher);
        send(200, {
          articles: enriched.map(normalizeWork),
          source:
            "Crossref; Europe PMC metadata and DOAJ journal policies where available",
          note:
            input.mode === "find" &&
            (input.language ||
              ["review-article", "journal-article"].includes(input.type))
              ? `Showing ${matching.length} matches from ${works.length} screened candidates. Review and language filters depend on available publication metadata; unknown languages are excluded from language-specific results.`
              : "",
        });
      } catch (error) {
        send(502, {
          error:
            error.name === "TimeoutError"
              ? "Crossref timed out. Please try again."
              : error.message === "fetch failed"
                ? "Cannot connect to Crossref. Check network access to api.crossref.org and try again."
                : error.message,
        });
      }
      return;
    }
    const pathname = new URL(req.url, "http://localhost").pathname;
    const asset = /^\/assets\/[a-zA-Z0-9_-]+\.(js|css)$/.exec(pathname);
    if (req.method !== "GET" || (pathname !== "/" && !asset)) {
      send(404, { error: "Not found" });
      return;
    }
    try {
      const path = pathname === "/" ? "index.html" : pathname.slice(1);
      const type =
        pathname === "/"
          ? "text/html"
          : asset[1] === "css"
            ? "text/css"
            : "text/javascript";
      const nonce = randomBytes(18).toString("base64");
      let content = await readFile(new URL("./dist/" + path, import.meta.url));
      if (pathname === "/")
        content = content.toString().replace("{{CSP_NONCE}}", nonce);
      res.writeHead(200, {
        "Content-Type": type,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": `default-src 'self'; style-src 'self' 'nonce-${nonce}'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'`,
        "Referrer-Policy": "no-referrer",
      });
      res.end(content);
    } catch (error) {
      send(error.code === "ENOENT" ? 404 : 500, {
        error:
          "Unable to load application. Run npm run build before starting the server.",
      });
    }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  createServer().listen(Number(process.env.PORT || 3000), "0.0.0.0", () =>
    console.log(
      "Research Matching Tool listening on port " + (process.env.PORT || 3000),
    ),
  );
