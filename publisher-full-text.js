import { parse } from "parse5";

export function parseMaximumAcademicPress(html, doi) {
  if (html.length > 4000000) throw new Error("Publisher response too large.");
  const document = parse(html);
  const attribute = (node, name) =>
    node.attrs?.find((a) => a.name === name)?.value || "";
  const classes = (node) => attribute(node, "class").split(/\s+/);
  const skip = (node) =>
    ["script", "style", "nav", "noscript", "button"].includes(node.tagName) ||
    classes(node).includes("xref");
  const text = (node) =>
    skip(node)
      ? ""
      : node.nodeName === "#text"
        ? node.value
        : (node.childNodes || [])
            .map(text)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();
  function find(node, predicate) {
    if (predicate(node)) return node;
    for (const child of node.childNodes || []) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  const metadata = find(
    document,
    (node) =>
      node.tagName === "meta" &&
      attribute(node, "name").toLowerCase() === "citation_doi",
  );
  if (
    attribute(metadata || {}, "content")
      .trim()
      .toLowerCase() !== doi.toLowerCase()
  )
    throw new Error("Publisher article DOI does not match.");
  const body = find(
    document,
    (node) => attribute(node, "id") === "htmlContent2",
  );
  if (!body) throw new Error("Publisher full article body not found.");
  const sections = [];
  function headingOf(context) {
    return [context.base, ...context.levels.filter(Boolean)].join(" › ");
  }
  function walk(node, context = { base: "Article body", levels: [] }) {
    if (skip(node)) return;
    if (node.tagName === "figure") {
      const caption = (node.childNodes || []).find(
        (child) => child.tagName === "figcaption",
      );
      if (caption) {
        const title = text(caption);
        if (
          /^(abstract|references|bibliography|acknowledg|author contributions|conflicts? of interest|data availability|rights and permissions)/i.test(
            title,
          )
        )
          return;
        context = {
          base:
            context.base === "Article body"
              ? title
              : `${headingOf(context)} › ${title}`,
          levels: [],
        };
      }
    }
    if (/^h[4-6]$/.test(node.tagName)) {
      const depth = Number(node.tagName[1]) - 4;
      context.levels = context.levels.slice(0, depth);
      context.levels[depth] = text(node);
      return;
    }
    if (node.tagName === "table") {
      const rows = [];
      function collectRows(current) {
        if (current.tagName === "tr") {
          const cells = (current.childNodes || [])
            .filter((child) => ["td", "th"].includes(child.tagName))
            .map(text);
          if (cells.some(Boolean)) rows.push(cells.filter(Boolean).join(" | "));
          return;
        }
        for (const child of current.childNodes || []) collectRows(child);
      }
      collectRows(node);
      if (rows.length)
        sections.push({
          heading: `${headingOf(context)} › Table`,
          type: "table",
          text: rows.join(". "),
        });
      return;
    }
    if (node.tagName === "p") {
      const content = text(node);
      if (content && !/^(?:Figure|Fig\.?|Table)\s+\d+\.?$/i.test(content))
        sections.push({ heading: headingOf(context), type: "", text: content });
      return;
    }
    if (["figcaption", "h1", "h2", "h3"].includes(node.tagName)) return;
    for (const child of node.childNodes || []) walk(child, context);
  }
  walk(body);
  if (!sections.length)
    throw new Error("Publisher full article body is empty.");
  return sections;
}

export function maximumAcademicPressMetadata(html, doi) {
  const sections = parseMaximumAcademicPress(html, doi),
    document = parse(html);
  let language = "";
  function scan(node) {
    if (node.tagName === "meta") {
      const name = node.attrs
        ?.find((a) => a.name === "name")
        ?.value?.toLowerCase();
      if (name === "citation_language")
        language = node.attrs?.find((a) => a.name === "content")?.value || "";
    }
    for (const child of node.childNodes || []) scan(child);
  }
  scan(document);
  return {
    language,
    isReview: sections.some(
      (s) =>
        /intro|article body/i.test(s.heading) &&
        /\bthis review\b/i.test(s.text),
    ),
  };
}
