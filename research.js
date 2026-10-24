export function normalizeDoi(value) {
  const doi = String(value)
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "");
  if (!/^10\.\d{4,9}\/\S+$/i.test(doi) || doi.length > 500)
    throw new Error("Enter a valid DOI or doi.org URL.");
  return doi;
}
export function validateRequest(input) {
  if (!input || typeof input !== "object") throw new Error("Invalid request.");
  for (const key of ["context", "data"])
    if (
      typeof input[key] !== "string" ||
      !input[key].trim() ||
      input[key].length > 20000
    )
      throw new Error(
        "Provide research context and organized findings (up to 20,000 characters each).",
      );
  if (!["find", "analyze"].includes(input.mode))
    throw new Error("Choose a research purpose.");
  if (
    input.mode === "find" &&
    (!Number.isInteger(input.count) || input.count < 1 || input.count > 50)
  )
    throw new Error("Choose between 1 and 50 articles.");
  if (input.mode === "analyze") {
    if (
      !Array.isArray(input.dois) ||
      !input.dois.length ||
      input.dois.length > 20
    )
      throw new Error("Provide between 1 and 20 DOIs.");
    input.dois.forEach(normalizeDoi);
  }
  for (const key of ["from", "to"])
    if (
      input[key] &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(input[key]) ||
        !Number.isFinite(Date.parse(input[key])))
    )
      throw new Error("Use valid dates.");
  if (input.from && input.to && input.from > input.to)
    throw new Error("The start date must precede the end date.");
  if (
    input.type &&
    ![
      "journal-article",
      "dissertation",
      "book",
      "proceedings-article",
    ].includes(input.type)
  )
    throw new Error("Unsupported resource type.");
  if (input.peerReviewed)
    throw new Error(
      "Crossref does not verify peer review. Use publisher information to check review status.",
    );
}
const plain = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
export function normalizeWork(work) {
  const abstract = plain(work.abstract);
  return {
    doi: work.DOI,
    title: plain(work.title?.[0]) || "Untitled",
    authors:
      work.author
        ?.map((a) => [a.given, a.family].filter(Boolean).join(" "))
        .join(", ") || "Authors unavailable",
    year: work.published?.["date-parts"]?.[0]?.[0] || null,
    url: `https://doi.org/${encodeURI(work.DOI)}`,
    keywords: work.subject || [],
    type: work.type || "Unknown",
    peerReview: work.peerReview || {
      status: "unverified",
      label: "Peer review unverified",
      detail:
        "No journal-policy evidence available. This does not mean the article was not peer reviewed.",
      sourceUrl: null,
    },
    abstract,
    summary: abstract
      ? abstract.slice(0, 1000) + (abstract.length > 1000 ? "…" : "")
      : "No abstract available in Crossref. Open the publisher page to read the article.",
    summarySource:
      "Extract from publisher-deposited abstract; not a full-text summary.",
  };
}
const terms = (text) =>
  new Set(
    (text.toLowerCase().match(/[a-z]{4,}/g) || []).filter(
      (t) =>
        ![
          "that",
          "with",
          "from",
          "this",
          "were",
          "have",
          "their",
          "which",
          "using",
          "study",
          "data",
        ].includes(t),
    ),
  );

const sentences = (text) =>
  text
    .match(/[^]+?(?:[.!?](?=\s+[A-Z\d])|$)/g)
    ?.map((s) => s.trim())
    .filter(Boolean) || [];
export function articleEvidence(article) {
  const sections =
    article.fullText?.status === "available"
      ? article.fullText.sections || []
      : [];
  const full = sections.flatMap((section) =>
    sentences(section.text).map((text) => ({
      text,
      heading: section.heading,
      type: section.type,
    })),
  );
  const summary = (headingPattern, sentencePattern, fallback = false) => {
    const headed = full.filter((s) =>
      headingPattern.test(`${s.heading} ${s.type || ""}`),
    );
    const pool = headed.length
      ? headed
      : full.filter((s) => sentencePattern.test(s.text));
    const prioritized = pool
      .map((sentence, index) => ({
        ...sentence,
        index,
        score:
          (sentencePattern.test(sentence.text) ? 3 : 0) +
          (/\d/.test(sentence.text) ? 1 : 0),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, 3)
      .sort((a, b) => a.index - b.index);
    const picked = prioritized.length
      ? prioritized
      : fallback
        ? full.slice(0, 2)
        : [];
    return {
      summary: picked.length
        ? [
            picked
              .map((s) =>
                s.text.length > 450
                  ? s.text.slice(0, 450).replace(/\s+\S*$/, "") + "…"
                  : s.text,
              )
              .join(" "),
          ]
        : [],
      headings: [...new Set(picked.map((s) => s.heading))],
    };
  };
  const fields = {
    focus: summary(
      /intro|background|objective|aim/i,
      /\b(aim|objective|hypothes|investigat|purpose|research question)/i,
      true,
    ),
    methods: summary(
      /method|material|experimental|protocol/i,
      /\b(randomi[sz]|assay|microscop|cohort|regression|anova|survey|interview|we used|we analy[sz])/i,
    ),
    findings: summary(
      /result|finding|conclu/i,
      /\b(found|show|increas|decreas|associat|significan|observ|improv|reduc)/i,
    ),
    measurements: summary(
      /measure|table|outcome/i,
      /\d+(?:\.\d+)?\s*(?:%|cm\b|mm\b|mg\b|kg\b|ml\b|nm\b|°|plants?\b|patients?\b|participants?\b)|\bp\s*[<=>]\s*\d|confidence interval|effect size/i,
    ),
    limitations: summary(
      /limitation|caveat/i,
      /\b(limit|small sample|uncertain|bias|caution|further research|future work)/i,
    ),
  };
  return {
    title: article.title,
    url: article.url,
    doi: article.doi,
    authors: article.authors || "Authors unavailable",
    year: article.year || "Date unavailable",
    peerReview: article.peerReview?.label || "Peer review unverified",
    ...Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, value.summary]),
    ),
    sourceSections: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, value.headings]),
    ),
    hasFullText: sections.length > 0,
    fullTextSourceUrl: article.fullText?.sourceUrl,
    fullTextMessage:
      article.fullText?.reason ||
      "Full text unavailable. Retrieve accessible full text to populate section summaries.",
  };
}
export function compare(article, context, data, statistics = "") {
  const evidence = articleEvidence(article),
    text = Object.values(evidence).filter(Array.isArray).flat().join(" "),
    literature = terms(text),
    experiment = terms(`${context} ${data}`);
  return {
    sharedTerms: [...experiment].filter((t) => literature.has(t)),
    statistics: statistics || "Not supplied",
    article: evidence,
    evidence: evidence.hasFullText
      ? "Retrieved full article body; abstract excluded."
      : evidence.fullTextMessage,
    limitation:
      "Extractive full-text summaries provide literature context; this comparison does not validate or invalidate experimental findings or establish causality.",
  };
}
export function compareArticles(first, second) {
  const left = articleEvidence(first),
    right = articleEvidence(second);
  const body = (a) =>
    a.hasFullText
      ? [
          ...a.focus,
          ...a.methods,
          ...a.findings,
          ...a.measurements,
          ...a.limitations,
        ].join(" ")
      : "";
  const a = terms(body(left)),
    b = terms(body(right));
  return {
    left,
    right,
    sharedTerms: [...a].filter((t) => b.has(t)).slice(0, 16),
    differentTerms: {
      left: [...a].filter((t) => !b.has(t)).slice(0, 10),
      right: [...b].filter((t) => !a.has(t)).slice(0, 10),
    },
    coverage: [left, right]
      .filter((a) => !a.hasFullText)
      .map((a) => `${a.title}: full text unavailable. ${a.fullTextMessage}`),
    limitation:
      "Section summaries are extracted from the retrieved full article body, including available tables and figure captions. They are reading aids and do not establish scientific agreement or disagreement.",
  };
}
