const unverified = (
  reason = "No matching journal-policy evidence was found.",
) => ({
  status: "unverified",
  label: "Peer review unverified",
  detail: `${reason} This does not mean the article was not peer reviewed. Check the publisher's article and journal policy.`,
  sourceUrl: null,
});
const issns = (work) => [
  ...new Set(
    (work.ISSN || [])
      .filter((id) => /^\d{4}-\d{3}[\dX]$/i.test(id))
      .map((id) => id.toUpperCase()),
  ),
];
export async function enrichPeerReview(works, fetcher = fetch) {
  // A request-scoped cache deduplicates journals without retaining experimental context.
  const cache = new Map();
  const deadline = AbortSignal.timeout(6000);
  let cursor = 0;
  const journals = [
    ...new Set(
      works
        .filter((w) => w.type === "journal-article")
        .map((w) => issns(w).sort().join("|"))
        .filter(Boolean),
    ),
  ];
  async function worker() {
    while (cursor < journals.length) {
      const key = journals[cursor++];
      if (deadline.aborted) {
        cache.set(key, unverified("The journal-policy lookup timed out."));
        continue;
      }
      const ids = key.split("|");
      try {
        const query = ids.map((id) => `issn:${id}`).join(" OR ");
        const response = await fetcher(
          `https://doaj.org/api/search/journals/${encodeURIComponent(query)}?pageSize=5`,
          {
            signal: deadline,
            headers: { "User-Agent": "CandleLit/0.1" },
          },
        );
        if (!response.ok) throw new Error("Journal registry unavailable");
        const body = await response.json();
        const registryIssns = (record) =>
          [
            record.bibjson?.eissn,
            record.bibjson?.pissn,
            ...(record.bibjson?.identifier || []).map((item) => item.id),
          ]
            .filter(Boolean)
            .map((id) => String(id).toUpperCase());
        const match = body.results?.find((record) =>
          registryIssns(record).some((id) => ids.includes(id)),
        );
        const processes = match?.bibjson?.editorial?.review_process;
        if (!Array.isArray(processes) || !processes.length) {
          cache.set(key, unverified());
          continue;
        }
        const peer = processes.some(
          (p) =>
            /peer review/i.test(p) &&
            !/\b(no|not|without)\b.*peer review/i.test(p),
        );
        cache.set(key, {
          status: peer ? "journal-policy" : "editorial-policy",
          label: peer
            ? "Peer reviewed (journal policy)"
            : "Editorial review (journal policy)",
          detail: `DOAJ reports ${processes.join(", ")} for this journal. This is current journal-level policy evidence, not article-level verification; individual content types may follow different processes.`,
          sourceUrl: `https://doaj.org/toc/${ids.find((id) => registryIssns(match).includes(id))}`,
        });
      } catch {
        cache.set(
          key,
          unverified("The journal registry could not be reached."),
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, journals.length) }, worker),
  );
  return works.map((work) => ({
    ...work,
    peerReview:
      work.type === "posted-content" && work.subtype === "preprint"
        ? {
            status: "preprint",
            label: "Preprint · peer review unverified",
            detail:
              "Crossref identifies this version as a preprint. Review of this version has not been verified.",
            sourceUrl: null,
          }
        : (work.type === "journal-article"
            ? cache.get(issns(work).sort().join("|"))
            : null) || unverified(),
  }));
}
