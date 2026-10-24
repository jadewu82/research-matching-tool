import { parseFullText } from "./full-text-parser.js";
export { parseFullText } from "./full-text-parser.js";
import { parseMaximumAcademicPress } from "./publisher-full-text.js";
import { normalizeDoi } from "./research.js";

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
    unavailable = (reason, code = "provider_error", retryable = true) => ({
      status: "unavailable",
      reason,
      code,
      retryable,
      sections: [],
    });
  const signal = AbortSignal.timeout(20000);
  try {
    if (/^10\.48130\/[a-z0-9.-]+$/i.test(doi)) {
      const sourceUrl = `https://www.maxapress.com/article/doi/${doi.split("/").map(encodeURIComponent).join("/")}`;
      try {
        const response = await fetcher(sourceUrl, {
          signal,
          redirect: "error",
        });
        if (!response.ok)
          return unavailable(
            `Maximum Academic Press full-text download failed (HTTP ${response.status}). Please retry.`,
            "publisher_download_error",
          );
        const sections = parseMaximumAcademicPress(
          await limitedText(response),
          doi,
        );
        return {
          status: "available",
          provider: "Maximum Academic Press",
          sourceUrl,
          retrievedAt: new Date().toISOString(),
          sections,
        };
      } catch {
        return unavailable(
          "Maximum Academic Press full text could not be downloaded or its article body could not be verified. Please retry or import your article-body file.",
          "publisher_full_text_error",
        );
      }
    }
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
    if (!search.ok)
      return unavailable(
        `Europe PMC lookup failed (HTTP ${search.status}). Please retry.`,
        "registry_error",
      );
    const body = await search.json();
    const record = body.resultList?.result?.find(
      (record) => record.doi?.toLowerCase() === doi.toLowerCase(),
    );
    if (!record)
      return unavailable(
        "This DOI is not indexed by the current full-text provider. Import an article-body TXT or JATS XML file you have access to; no abstract fallback will be used.",
        "not_indexed",
        false,
      );
    if (record.isOpenAccess !== "Y" || !/^PMC\d+$/.test(record.pmcid))
      return unavailable(
        "The provider has no downloadable open-access full text for this article. Import an article-body TXT or JATS XML file you have access to; no abstract fallback will be used.",
        "access_unavailable",
        false,
      );
    const match = record;
    const response = await fetcher(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/${match.pmcid}/fullTextXML`,
      { signal },
    );
    if (!response.ok)
      return unavailable(
        `The full-text download failed (HTTP ${response.status}). Please retry or import your article-body file.`,
        "download_error",
      );
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
