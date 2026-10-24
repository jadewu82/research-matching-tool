export const LANGUAGES = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  zh: "Chinese",
  ja: "Japanese",
  it: "Italian",
  ko: "Korean",
  ru: "Russian",
};
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
  if (
    typeof input.context !== "string" ||
    !input.context.trim() ||
    input.context.length > 20000
  )
    throw new Error("Provide research context (up to 20,000 characters).");
  if (
    input.data !== undefined &&
    (typeof input.data !== "string" || input.data.length > 20000)
  )
    throw new Error("Organized findings must be text up to 20,000 characters.");
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
      input[key] !== undefined &&
      input[key] !== "" &&
      (!/^\d{4}$/.test(String(input[key])) ||
        Number(input[key]) < 1000 ||
        Number(input[key]) > 2999)
    )
      throw new Error("Enter a four-digit publication year.");
  if (input.from && input.to && Number(input.from) > Number(input.to))
    throw new Error("The start year must precede the end year.");
  if (input.language && !LANGUAGES[input.language])
    throw new Error("Choose a supported language.");
  if (
    input.type &&
    ![
      "journal-article",
      "review-article",
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
    resourceLabel:
      work.articleKind === "review"
        ? "Review article"
        : work.type === "journal-article"
          ? "Journal article"
          : (work.type || "Unknown").replaceAll("-", " "),
    language: work.detectedLanguage || work.language || "",
    languageLabel:
      LANGUAGES[work.detectedLanguage || work.language] ||
      work.detectedLanguage ||
      work.language ||
      "Not supplied",
    genreSource: work.genreSource || "Not supplied",
    languageSource:
      work.languageSource || (work.language ? "Crossref" : "Not supplied"),
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
    sentences(section.text)
      .filter((text) => !/^(?:Figure|Fig\.?|Table)\s+\d+\.?$/i.test(text))
      .map((text) => ({
        text,
        heading: section.heading,
        type: section.type,
      })),
  );
  const summary = (
    headingPattern,
    sentencePattern,
    fallback = false,
    excludePattern = /$^/,
    preferNumbers = true,
  ) => {
    const headed = full.filter((s) =>
      headingPattern.test(`${s.heading} ${s.type || ""}`),
    );
    const matchingHeaded = headed.filter((s) => sentencePattern.test(s.text));
    let pool = headed.length
      ? matchingHeaded.length
        ? matchingHeaded
        : headed
      : full.filter(
          (s) =>
            !excludePattern.test(`${s.heading} ${s.type || ""}`) &&
            sentencePattern.test(s.text),
        );
    if (
      fallback &&
      pool.some((sentence) => sentencePattern.test(sentence.text))
    )
      pool = pool.filter((sentence) => sentencePattern.test(sentence.text));
    const prioritized = pool
      .map((sentence, index) => ({
        ...sentence,
        index,
        score:
          (sentencePattern.test(sentence.text) ? 3 : 0) +
          (/\b(we (?:aim|hypothes|investigat|evaluat|assess)|(?:this|our) (?:study|review|work|paper)|our (?:objective|aim)|we note.*limitation)/i.test(
            sentence.text,
          )
            ? 7
            : 0) +
          (preferNumbers && /\d/.test(sentence.text) ? 1 : 0),
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
      /\b(this review|this study|this work|aim|objective|hypothes|investigat|purpose|research question)/i,
      true,
    ),
    methods: summary(
      /method|material|experimental|protocol|data extraction|eligibility|statistical analysis|detection mode|detection strateg|label.free detection|labeled detection/i,
      /\b(method|technique|strateg|labeled|label.free|recognition|Raman signals|randomi[sz]|assay|microscop|cohort|regression|anova|survey|interview|we used|we analy[sz])/i,
      false,
      /result|discussion|conclu|intro|background/i,
      false,
    ),
    findings: summary(
      /result|finding|conclu|^summary\b/i,
      /\b(found|show|increas|decreas|associat|significan|observ|improv|reduc|predominant|summari[sz]|demonstrat)/i,
    ),
    measurements: summary(
      /measure|table|outcome/i,
      /\d+(?:\.\d+)?\s*(?:%|cm\b|mm\b|mg\b|kg\b|ml\b|nm\b|°|plants?\b|patients?\b|participants?\b)|\bp\s*[<=>]\s*\d|confidence interval|effect size/i,
    ),
    limitations: summary(
      /limitation|caveat|challenge|future perspective|^summary\b/i,
      /\b(limitations?|(?:is|are|was|were) limited by|limits? (?:generalization|practical|clinical|the|its|their|our|application)|small sample|uncertain|bias|caution|challenge|bottleneck|drawback|lack|poor|weak|difficulty|existing problems|further research|future work)/i,
      false,
      /intro|background/i,
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
    sourceProvider: article.fullText?.provider || "",
    supplied: !!article.fullText?.supplied,
    isReview: full.some(
      (s) =>
        /intro|article body/i.test(s.heading) &&
        /\bthis review\b/i.test(s.text),
    ),
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
