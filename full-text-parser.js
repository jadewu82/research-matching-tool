import { SaxesParser } from "saxes";

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
      heading = title
        ? heading === "Article body"
          ? text(title)
          : `${heading} › ${text(title)}`
        : heading;
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

export function parseProvidedText(text) {
  if (typeof text !== "string" || text.length > 2000000)
    throw new Error("Choose a text file smaller than 2 MB.");
  const sections = [];
  let heading = "Article body",
    skip = false,
    foundBody = false,
    paragraph = [];
  const flush = () => {
    const content = paragraph.join(" ").replace(/\s+/g, " ").trim();
    if (content && !skip && foundBody)
      sections.push({ heading, type: "", text: content });
    paragraph = [];
  };
  const headings =
    /^(?:\d+(?:\.\d+)*[.)]?\s+)?(abstract|introduction|background|research focus|objectives?|materials?\s*(?:and|&)\s*methods?|methods?|methodology|experimental(?: procedures)?|results?(?:\s*(?:and|&)\s*discussion)?|findings|measurements|discussion|conclusions?|limitations?(?:\s*(?:and|&)\s*future (?:work|research))?|references|bibliography|acknowledg(?:e)?ments?)\s*:?$/i;
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    const match = line.trim().match(headings);
    if (match) {
      flush();
      heading = match[1];
      skip = /^(abstract|references|bibliography|acknowledg)/i.test(heading);
      if (!skip) foundBody = true;
    } else if (!line.trim()) flush();
    else paragraph.push(line.trim());
  }
  flush();
  if (!foundBody || !sections.length)
    throw new Error(
      "Include full article body sections with headings such as Introduction, Methods, Results and Discussion. Abstract-only text is not supported.",
    );
  return sections;
}
