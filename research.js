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
export function compare(article, context, data, statistics = "") {
  const literature = terms(`${article.title} ${article.abstract}`);
  const experiment = terms(`${context} ${data}`);
  return {
    sharedTerms: [...experiment].filter((t) => literature.has(t)),
    statistics: statistics || "Not supplied",
    limitation:
      "This textual comparison does not validate or invalidate experimental findings, establish causality, or compare effect sizes. Review full methods, populations, units and uncertainty before interpreting differences.",
    article: articleEvidence(article),
    evidence: article.abstract
      ? "Title and deposited abstract only."
      : "Title only; abstract unavailable.",
  };
}

export function articleEvidence(article) {
  const abstract = article.abstract || "";
  const sentences =
    abstract
      .match(/[^]+?(?:[.!?](?=\s+[A-Z\d])|$)/g)
      ?.map((s) => s.trim())
      .filter(Boolean) || [];
  const extract = (pattern) =>
    sentences.filter((sentence) => pattern.test(sentence)).slice(0, 3);
  return {
    title: article.title,
    url: article.url,
    doi: article.doi,
    authors: article.authors || "Authors unavailable",
    year: article.year || "Date unavailable",
    peerReview: article.peerReview?.label || "Peer review unverified",
    focus: abstract ? [sentences[0] || abstract] : [],
    methods: extract(
      /\b(method|randomi[sz]|trial|assay|microscop|model|cohort|participant|sampled|measur|experiment|regression|anova|sequenc|survey|interview|used|analy[sz])/i,
    ),
    findings: extract(
      /\b(result|found|show|increas|decreas|associat|significan|conclu|suggest|observ|improv|reduc)/i,
    ),
    measurements: extract(
      /\d+(?:\.\d+)?\s*(?:%|cm\b|mm\b|mg\b|kg\b|ml\b|µ|μ|nm\b|°|plants?\b|patients?\b|participants?\b|subjects?\b)|\b(?:p\s*[<=>]|confidence interval|effect size|odds ratio)\b/i,
    ),
    limitations: extract(
      /\b(limit|small sample|uncertain|bias|caution|further research|future work)/i,
    ),
    hasAbstract: !!abstract,
  };
}
export function compareArticles(first, second) {
  const left = articleEvidence(first),
    right = articleEvidence(second);
  const a = terms(`${first.title} ${first.abstract || ""}`),
    b = terms(`${second.title} ${second.abstract || ""}`);
  return {
    left,
    right,
    sharedTerms: [...a].filter((term) => b.has(term)).slice(0, 16),
    differentTerms: {
      left: [...a].filter((term) => !b.has(term)).slice(0, 10),
      right: [...b].filter((term) => !a.has(term)).slice(0, 10),
    },
    coverage: [left, right]
      .filter((a) => !a.hasAbstract)
      .map(
        (a) =>
          `${a.title}: no abstract available. Methods, results and measurements cannot be compared from its title alone.`,
      ),
    limitation:
      "These are attributable abstract excerpts, selected with text patterns, not a full-text or semantic assessment. Different reported findings do not by themselves establish agreement or disagreement. Check methods, populations, controls, units and uncertainty in the original sources.",
  };
}
