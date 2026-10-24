import { compare } from '/research.js';
const $ = id => document.getElementById(id);
let articles = [], experiment, selected = new Set();
const el = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
function addDoi() {
  if ($('doi-list').children.length >= 20) return;
  const row = el('div', '', 'doi-row'), label = el('label', 'Article DOI'), input = el('input');
  input.placeholder = '10.1234/example or https://doi.org/…'; input.maxLength = 500; label.append(input);
  const remove = el('button', 'Remove', 'secondary'); remove.type = 'button'; remove.onclick = () => { row.remove(); if (!$('doi-list').children.length) addDoi(); };
  row.append(label, remove); $('doi-list').append(row);
}
addDoi(); $('add-doi').onclick = addDoi;
document.querySelectorAll('[name=mode]').forEach(input => input.onchange = () => {
  const analyze = input.value === 'analyze'; $('doi-section').hidden = !analyze; $('count-section').hidden = analyze; $('filters').hidden = analyze;
  $('count').disabled = analyze;
  $('submit').textContent = analyze ? 'Analyze my articles →' : 'Find research connections →';
});
$('file').onchange = async () => {
  const file = $('file').files[0]; if (!file) return;
  if (file.size > 20000) { $('error').textContent = 'Choose a file smaller than 20 KB.'; return; }
  $('data').value = await file.text();
};
$('research-form').onsubmit = async event => {
  event.preventDefault(); $('error').textContent = ''; $('submit').disabled = true; $('submit').textContent = 'Searching literature…';
  const mode = document.querySelector('[name=mode]:checked').value;
  experiment = Object.fromEntries(['context','data','statistics','type','keywords','from','to'].map(key => [key, $(key).value]));
  experiment.mode = mode; experiment.count = Number($('count').value); experiment.dois = [...$('doi-list').querySelectorAll('input')].map(n => n.value.trim()).filter(Boolean);
  try {
    // Keep organized findings and statistics local. The server needs context only for discovery.
    const payload = { ...experiment, data: 'Organized findings retained in browser.', statistics: '' };
    if (mode === 'analyze') { payload.context = 'User-provided DOI lookup'; payload.type = ''; payload.from = ''; payload.to = ''; payload.keywords = ''; }
    const response = await fetch('/api/articles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error);
    articles = result.articles; selected = new Set(mode === 'analyze' ? articles.map(a => a.doi) : []);
    $('setup').hidden = true; $('results').hidden = false; $('comparisons').replaceChildren(); $('sort').value = 'relevance'; render();
    if (mode === 'analyze') match(); window.scrollTo(0, 0);
  } catch (error) { $('error').textContent = error.message || 'Unable to retrieve articles. Please try again.'; }
  finally { $('submit').disabled = false; $('submit').textContent = mode === 'analyze' ? 'Analyze my articles →' : 'Find research connections →'; }
};
function render() {
  $('articles').replaceChildren(); $('result-status').textContent = `${articles.length} articles from Crossref. ${selected.size} selected.`;
  const ordered = [...articles]; if ($('sort').value === 'title') ordered.sort((a,b) => a.title.localeCompare(b.title)); if ($('sort').value === 'date') ordered.sort((a,b) => (b.year || 0) - (a.year || 0));
  for (const article of ordered) {
    const card = el('article', '', 'card'), label = el('label'), box = el('input'); box.type = 'checkbox'; box.checked = selected.has(article.doi); box.onchange = () => { box.checked ? selected.add(article.doi) : selected.delete(article.doi); $('result-status').textContent = `${articles.length} articles from Crossref. ${selected.size} selected.`; };
    label.append(box, document.createTextNode(' Select article: ' + article.title));
    const link = el('a', 'View publisher source ↗'); link.href = article.url; link.target = '_blank'; link.rel = 'noopener noreferrer';
    card.append(label, el('h2', article.title), el('p', `${article.authors} · ${article.year || 'Date unavailable'}`), link, el('p', `Resource: ${article.type} · Peer review: unknown`, 'note'));
    for (const keyword of article.keywords) card.append(el('span', keyword, 'tag'));
    if (!article.keywords.length) card.append(el('p', 'Keywords not supplied by publisher.', 'note'));
    card.append(el('h3', 'Abstract summary'), el('p', article.summary), el('small', article.summarySource)); $('articles').append(card);
  }
}
function panel(title, result) {
  const card = el('article', '', 'card'); card.append(el('h2', title), el('p', 'Shared terms: ' + (result.sharedTerms.join(', ') || 'No shared terms detected.')),
    el('p', 'Evidence available: ' + result.evidence), el('p', 'Analysis context: ' + result.statistics), el('p', result.limitation, 'note')); return card;
}
function match() {
  const chosen = articles.filter(a => selected.has(a.doi)); $('comparisons').replaceChildren(el('h2', 'Literature and your findings'));
  if (!chosen.length) { $('comparisons').append(el('p', 'Select at least one article.')); return; }
  $('comparisons').append(el('p', 'Your organized findings'), el('pre', experiment.data));
  for (const article of chosen) $('comparisons').append(panel(article.title, compare(article, experiment.context, experiment.data, experiment.statistics)));
}
$('match').onclick = match;
$('compare').onclick = () => {
  const chosen = articles.filter(a => selected.has(a.doi)); $('comparisons').replaceChildren(el('h2', 'Article-to-article comparison'));
  if (chosen.length < 2) { $('comparisons').append(el('p', 'Select at least two articles.')); return; }
  for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++) $('comparisons').append(panel(`${chosen[i].title} ↔ ${chosen[j].title}`, compare(chosen[i], chosen[j].title, chosen[j].abstract)));
};
$('sort').onchange = render;
$('back').onclick = () => { $('results').hidden = true; $('setup').hidden = false; };
