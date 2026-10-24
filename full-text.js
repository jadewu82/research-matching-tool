import { SaxesParser } from "saxes";
import { normalizeDoi } from "./research.js";

export function parseFullText(xml) {
  if (xml.length > 4000000 || /<!ENTITY/i.test(xml))
    throw new Error("Unsupported or oversized article XML.");
  const root = { tag: "root", children: [] },
    stack = [root];
  const parser = new SaxesParser();
  parser.on("opentag", (tag) => {
    const node = {
      tag: tag.name.split(":").pop(),
      type: tag.attributes["sec-type"] || "",
      children: [],
    };
    stack.at(-1).children.push(node);
    stack.push(node);
  });
  parser.on("text", (text) => stack.at(-1).children.push(text));
  parser.on("cdata", (text) => stack.at(-1).children.push(text));
  parser.on("closetag", () => stack.pop());
  parser.write(xml).close();
  const text = (node) =>
    typeof node === "string"
      ? node
      : node.children.map(text).join(" ").replace(/\s+/g, " ").trim();
  const find = (node, tag) =>
    typeof node === "string"
      ? null
      : node.tag === tag
        ? node
        : node.children.map((child) => find(child, tag)).find(Boolean);
  const body = find(root, "body");
  if (!body) return [];
  const sections = [];
  function walk(node, heading = "Article body", type = "") {
    if (typeof node === "string") return;
    if (["ref-list", "abstract", "supplementary-material"].includes(node.tag))
      return;
    if (node.tag === "sec") {
      const title = node.children.find(
        (child) => typeof child !== "string" && child.tag === "title",
      );
      heading = title ? text(title) : heading;
      type = node.type || type;
    }
    if (["p", "table-wrap", "fig"].includes(node.tag)) {
      const content = text(node);
      if (content) sections.push({ heading, type, text: content });
      return;
    }
    for (const child of node.children) walk(child, heading, type);
  }
  walk(body);
  return sections;
}
async function limitedText(response) {
  if (!response.body) {
    const text = await response.text();
    if (text.length > 4000000) throw new Error("Article too large");
    return text;
  }
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4000000) throw new Error("Article too large");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return Buffer.concat(chunks).toString("utf8");
}
export async function retrieveFullText(value, fetcher = fetch) {
  const doi = normalizeDoi(value),
    unavailable = (reason) => ({ status: "unavailable", reason, sections: [] });
  const signal = AbortSignal.timeout(20000);
  try {
    const params = new URLSearchParams({
      query: `DOI:"${doi.replaceAll('"', "")}"`,
      format: "json",
      resultType: "core",
      pageSize: "5",
    });
    const search = await fetcher(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`,
      { signal },
    );
    if (!search.ok) throw new Error("Full-text registry unavailable");
    const body = await search.json();
    const match = body.resultList?.result?.find(
      (record) =>
        record.doi?.toLowerCase() === doi.toLowerCase() &&
        record.isOpenAccess === "Y" &&
        /^PMC\d+$/.test(record.pmcid),
    );
    if (!match)
      return unavailable(
        "No accessible open-access full text was found in Europe PMC for this DOI. Abstracts are not used for comparisons.",
      );
    const response = await fetcher(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/${match.pmcid}/fullTextXML`,
      { signal },
    );
    if (!response.ok) throw new Error("Full text unavailable");
    const sections = parseFullText(await limitedText(response));
    if (!sections.length)
      return unavailable(
        "The full-text response did not contain a readable article body.",
      );
    return {
      status: "available",
      provider: "Europe PMC",
      sourceUrl: `https://europepmc.org/articles/${match.pmcid}`,
      retrievedAt: new Date().toISOString(),
      sections,
    };
  } catch {
    return unavailable(
      "Full text could not be retrieved. Please retry. Abstracts are not used for comparisons.",
    );
  }
}
