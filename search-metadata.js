import { maximumAcademicPressMetadata } from "./publisher-full-text.js";
const languageCodes = {
  eng: "en",
  spa: "es",
  fre: "fr",
  fra: "fr",
  ger: "de",
  deu: "de",
  por: "pt",
  chi: "zh",
  zho: "zh",
  jpn: "ja",
  ita: "it",
  kor: "ko",
  rus: "ru",
};
const language = (value) => {
  const code = String(value || "")
    .trim()
    .toLowerCase()
    .split(/[-_]/)[0];
  return languageCodes[code] || code;
};
export function initialSearchMetadata(work) {
  const explicit = String(work.subtype || work["article-type"] || "");
  const content = [
    ...(work.title || []),
    String(work.abstract || "").replace(/<[^>]+>/g, " "),
  ].join(" ");
  const review =
    /review|meta-analysis/i.test(explicit) ||
    /\b(?:systematic|scoping|narrative|literature|umbrella|comprehensive|critical|mini)[ -]?review\b|:\s*a review\b|^(?:a )?review (?:of|on)\b|\bmeta-analysis\b|\bthis review\b/i.test(
      content,
    );
  return {
    ...work,
    articleKind: review ? "review" : "unspecified",
    detectedLanguage: language(work.language),
    genreSource: review
      ? "Publisher title, abstract or subtype"
      : "Not supplied",
    languageSource: work.language ? "Crossref" : "Not supplied",
  };
}
export async function enrichSearchMetadata(works, fetcher = fetch) {
  const enriched = works.map(initialSearchMetadata),
    records = new Map(),
    batches = [];
  for (let i = 0; i < works.length; i += 10)
    batches.push(works.slice(i, i + 10));
  const signal = AbortSignal.timeout(6000);
  let cursor = 0;
  async function worker() {
    while (cursor < batches.length && !signal.aborted) {
      const batch = batches[cursor++];
      try {
        const query = batch
          .map((w) => `DOI:"${String(w.DOI).replaceAll('"', "")}"`)
          .join(" OR ");
        const params = new URLSearchParams({
          query,
          format: "json",
          resultType: "core",
          pageSize: "100",
        });
        const response = await fetcher(
          `https://www.ebi.ac.uk/europepmc/webservices/rest/search?${params}`,
          { signal },
        );
        if (!response.ok) continue;
        for (const record of (await response.json()).resultList?.result || [])
          if (record.doi) records.set(record.doi.toLowerCase(), record);
      } catch {
        /* Preserve available Crossref metadata when the optional provider fails. */
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, batches.length) }, worker),
  );
  const combined = enriched.map((work) => {
    const record = records.get(work.DOI?.toLowerCase());
    if (!record) return work;
    const types = record.pubTypeList?.pubType || [];
    return {
      ...work,
      detectedLanguage: record.language
        ? language(record.language)
        : work.detectedLanguage,
      languageSource: record.language ? "Europe PMC" : work.languageSource,
      articleKind: types.some((t) => /review|meta-analysis/i.test(t))
        ? "review"
        : types.length && work.articleKind !== "review"
          ? "article"
          : work.articleKind,
      genreSource: types.length
        ? "Europe PMC publication types"
        : work.genreSource,
    };
  });
  const publisherCandidates = combined.filter(
    (work) =>
      /^10\.48130\/[a-z0-9.-]+$/i.test(work.DOI) &&
      (!work.detectedLanguage || work.articleKind === "unspecified"),
  );
  let next = 0;
  async function publisherWorker() {
    while (next < publisherCandidates.length && !signal.aborted) {
      const work = publisherCandidates[next++];
      try {
        const url = `https://www.maxapress.com/article/doi/${work.DOI.split("/").map(encodeURIComponent).join("/")}`;
        const response = await fetcher(url, { signal, redirect: "error" });
        if (!response.ok) continue;
        const meta = maximumAcademicPressMetadata(
          await response.text(),
          work.DOI,
        );
        if (meta.language) {
          work.detectedLanguage = language(meta.language);
          work.languageSource = "Maximum Academic Press";
        }
        if (meta.isReview) {
          work.articleKind = "review";
          work.genreSource = "Maximum Academic Press full-text declaration";
        }
      } catch {
        /* Unknown metadata remains unknown. */
      }
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(3, publisherCandidates.length) },
      publisherWorker,
    ),
  );
  return combined;
}
export function matchesSearchFilters(work, input) {
  if (input.language && work.detectedLanguage !== input.language) return false;
  if (input.type === "review-article")
    return work.type === "journal-article" && work.articleKind === "review";
  if (input.type === "journal-article")
    return work.type === "journal-article" && work.articleKind !== "review";
  return !input.type || work.type === input.type;
}
