export function normalizeDoi(value) {
  const doi = String(value).trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '').replace(/^doi:\s*/i, '');
  if (!/^10\.\d{4,9}\/\S+$/i.test(doi) || doi.length > 500) throw new Error('Enter a valid DOI or doi.org URL.');
  return doi;
}
export function validateRequest(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid request.');
  for (const key of ['context', 'data']) if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 20000) throw new Error('Provide research context and organized findings (up to 20,000 characters each).');
  if (!['find', 'analyze'].includes(input.mode)) throw new Error('Choose a research purpose.');
  if (input.mode === 'find' && (!Number.isInteger(input.count) || input.count < 1 || input.count > 50)) throw new Error('Choose between 1 and 50 articles.');
  if (input.mode === 'analyze') {
    if (!Array.isArray(input.dois) || !input.dois.length || input.dois.length > 20) throw new Error('Provide between 1 and 20 DOIs.');
    input.dois.forEach(normalizeDoi);
  }
  for (const key of ['from', 'to']) if (input[key] && (!/^\d{4}-\d{2}-\d{2}$/.test(input[key]) || !Number.isFinite(Date.parse(input[key])))) throw new Error('Use valid dates.');
  if (input.from && input.to && input.from > input.to) throw new Error('The start date must precede the end date.');
  if (input.type && !['journal-article', 'dissertation', 'book', 'proceedings-article'].includes(input.type)) throw new Error('Unsupported resource type.');
  if (input.peerReviewed) throw new Error('Crossref does not verify peer review. Use publisher information to check review status.');
}
const plain = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
export function normalizeWork(work) {
  const abstract = plain(work.abstract);
  return { doi: work.DOI, title: plain(work.title?.[0]) || 'Untitled', authors: work.author?.map(a => [a.given, a.family].filter(Boolean).join(' ')).join(', ') || 'Authors unavailable', year: work.published?.['date-parts']?.[0]?.[0] || null, url: `https://doi.org/${encodeURI(work.DOI)}`, keywords: work.subject || [], type: work.type || 'Unknown', peerReview: 'Unknown', abstract, summary: abstract ? abstract.slice(0, 1000) + (abstract.length > 1000 ? '…' : '') : 'No abstract available in Crossref. Open the publisher page to read the article.', summarySource: 'Extract from publisher-deposited abstract; not a full-text summary.' };
}
const terms = text => new Set((text.toLowerCase().match(/[a-z]{4,}/g) || []).filter(t => !['that', 'with', 'from', 'this', 'were', 'have', 'their', 'which', 'using', 'study', 'data'].includes(t)));
export function compare(article, context, data, statistics = '') {
  const literature = terms(`${article.title} ${article.abstract}`);
  const experiment = terms(`${context} ${data}`);
  return { sharedTerms: [...experiment].filter(t => literature.has(t)), statistics: statistics || 'Not supplied', limitation: 'This textual comparison does not validate or invalidate experimental findings, establish causality, or compare effect sizes. Review full methods, populations, units and uncertainty before interpreting differences.', evidence: article.abstract ? 'Title and deposited abstract only.' : 'Title only; abstract unavailable.' };
}
