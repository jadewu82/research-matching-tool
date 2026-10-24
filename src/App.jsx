import React, { useEffect, useRef, useState } from "react";
import {
  RadioGroup,
  Radio,
  Checkbox,
  Modal,
  ModalOverlay,
  Dialog,
  Heading,
  Button as AriaButton,
  FileTrigger,
} from "react-aria-components";
import {
  BookOpen,
  Search,
  ArrowRight,
  ArrowLeft,
  Plus,
  X,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  Check,
  LoaderCircle,
  Upload,
  GitCompareArrows,
  Library,
  ChevronRight,
} from "lucide-react";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "./components/ui/accordion";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { parseFullText, parseProvidedText } from "../full-text-parser.js";
import {
  articleEvidence,
  LANGUAGES,
  compare,
  compareArticles,
  validateRequest,
} from "../research.js";

const initial = {
  context: "",
  data: "",
  statistics: "",
  count: 10,
  type: "",
  keywords: "",
  from: "",
  to: "",
  language: "",
};
function Field({ label, id, children, hint }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
function Section({ title, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
function ComparisonCard({ title, result }) {
  return (
    <article className="comparison-card">
      <h3>{title}</h3>
      {result.article && (
        <>
          <p className="field-label">Research focus of the article</p>
          <EvidenceList items={result.article.focus} />
          <p className="field-label mt-4">Methods reported in the article</p>
          <EvidenceList items={result.article.methods} />
          <p className="field-label mt-4">Findings reported in the article</p>
          <EvidenceList items={result.article.findings} />
          <p className="field-label mt-4">
            Measurements reported in the article
          </p>
          <EvidenceList items={result.article.measurements} />
          <p className="field-label mt-4">
            Limitations reported in the article
          </p>
          <EvidenceList items={result.article.limitations} />
          <a
            className="evidence-link"
            href={result.article.fullTextSourceUrl || result.article.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read full-text source <ExternalLink size={12} />
          </a>
        </>
      )}
      <p className="field-label mt-4">Shared terms with your experiment</p>
      <div className="badges">
        {result.sharedTerms.length ? (
          result.sharedTerms.map((term) => (
            <Badge variant="secondary" key={term}>
              {term}
            </Badge>
          ))
        ) : (
          <p className="hint">No shared terms detected.</p>
        )}
      </div>
      <p className="hint">Evidence: {result.evidence}</p>
      <p className="hint">Analysis context: {result.statistics}</p>
      <p className="hint">{result.limitation}</p>
    </article>
  );
}
function PeerReviewLabel({ article }) {
  const review =
    article.peerReview && typeof article.peerReview === "object"
      ? article.peerReview
      : {
          status: "unverified",
          label: "Peer review unverified",
          detail:
            "No review-policy evidence available. This does not mean the article was not peer reviewed.",
        };
  return (
    <div className="review-status">
      <Badge
        variant={review.status === "journal-policy" ? "secondary" : "outline"}
      >
        {review.label}
      </Badge>
      <p className="hint">{review.detail}</p>
      {review.sourceUrl && (
        <a
          className="evidence-link"
          href={review.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          DOAJ journal-policy source <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
}
function EvidenceList({ items }) {
  return items?.length ? (
    <div className="section-summary">
      {items.map((item, i) => (
        <p key={i}>{item}</p>
      ))}
    </div>
  ) : (
    <p className="hint">No summary available from the retrieved full text.</p>
  );
}
function ArticleComparison({ first, second }) {
  if (!first || !second)
    return <p>Select at least two distinct articles to compare.</p>;
  const result = compareArticles(first, second);
  const rows = [
    ["Research focus", "focus"],
    ["Study methods", "methods"],
    ["Reported findings", "findings"],
    ["Reported measurements", "measurements"],
    ["Stated limitations", "limitations"],
  ];
  return (
    <section aria-label="Side-by-side article evidence">
      {result.coverage.length > 0 &&
        ![first, second].some(
          (a) => !a.fullText || a.fullText.status === "loading",
        ) && (
          <div className="evidence-warning" role="status">
            {result.coverage.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}
      {(result.left.isReview || result.right.isReview) && (
        <p className="hint">
          A selected source is a review article. Its methods, findings and
          measurements describe the literature it reviews and should not be
          treated as one original experiment.
        </p>
      )}
      <p className="hint">
        Section summaries use the retrieved full article body, including
        available tables and figure captions. Abstracts are excluded. Summaries
        are extractive; a missing summary means the section could not be
        identified.
      </p>
      <div
        className="comparison-table-wrapper"
        tabIndex={0}
        aria-label="Scrollable article comparison"
      >
        <table className="comparison-table">
          <caption>Full-text section summaries, side by side</caption>
          <thead>
            <tr>
              <th scope="col">Compare</th>
              {[result.left, result.right].map((a) => (
                <th key={a.doi} scope="col">
                  <h3>{a.title}</h3>
                  {a.sourceProvider && (
                    <p className="hint">{a.sourceProvider}</p>
                  )}
                  <p className="hint">
                    {a.authors} · {a.year}
                  </p>
                  <a
                    className="evidence-link"
                    href={a.fullTextSourceUrl || a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {a.hasFullText && !a.supplied
                      ? "Read full-text source"
                      : "Publisher source"}{" "}
                    <ExternalLink size={12} />
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Peer review</th>
              {[result.left, result.right].map((a) => (
                <td key={a.doi}>{a.peerReview}</td>
              ))}
            </tr>
            {rows.map(([label, key]) => (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td>
                  <EvidenceList items={result.left[key]} />
                  <p className="hint">
                    {result.left.sourceSections[key]?.join(" · ")}
                  </p>
                </td>
                <td>
                  <EvidenceList items={result.right[key]} />
                  <p className="hint">
                    {result.right.sourceSections[key]?.join(" · ")}
                  </p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">{result.limitation}</p>
    </section>
  );
}

function ArticleSectionSummary({ article, canCompare, onCompare }) {
  if (!article) return null;
  const evidence = articleEvidence(article);
  return (
    <section aria-label="Single article section summaries">
      <h2 className="serif text-2xl mt-5">{article.title}</h2>
      <Button
        variant="outline"
        className="mb-4"
        disabled={!canCompare}
        aria-label={`Compare ${article.title} with my findings`}
        onClick={() => onCompare(article.doi)}
      >
        Compare this article with my findings
      </Button>
      {!canCompare && (
        <p className="hint">
          Add organized findings to your research brief to compare this article
          with your own results.
        </p>
      )}
      {evidence.isReview && (
        <p className="hint">
          This is a review article. Its methods and findings describe the
          literature reviewed, rather than one original experiment.
        </p>
      )}
      {evidence.hasFullText && (
        <a
          className="evidence-link"
          href={evidence.fullTextSourceUrl || article.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          {evidence.supplied ? "Publisher source" : "Read full-text source"}{" "}
          <ExternalLink size={12} />
        </a>
      )}
      {[
        ["Research focus", "focus"],
        ["Study methods", "methods"],
        ["Reported findings", "findings"],
        ["Reported measurements", "measurements"],
        ["Limitations", "limitations"],
      ].map(([label, key]) => (
        <article className="comparison-card" key={key}>
          <h3>{label}</h3>
          <EvidenceList items={evidence[key]} />
          {evidence.sourceSections[key]?.length > 0 && (
            <p className="hint">
              Source sections: {evidence.sourceSections[key].join(" · ")}
            </p>
          )}
        </article>
      ))}
      <p className="hint">
        Section summaries are extractive and use full text only. Abstracts are
        not substituted.
      </p>
    </section>
  );
}

export default function App() {
  const [form, setForm] = useState(initial),
    [mode, setMode] = useState("find"),
    [dois, setDois] = useState([{ id: 0, value: "" }]);
  const nextDoi = useRef(1),
    resultHeading = useRef(null);
  const [page, setPage] = useState("setup"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [fileName, setFileName] = useState("");
  const [articles, setArticles] = useState([]),
    [selected, setSelected] = useState(new Set()),
    [sort, setSort] = useState("relevance"),
    [experiment, setExperiment] = useState(null),
    [comparison, setComparison] = useState(null);
  const [pair, setPair] = useState([null, null]);
  const [comparisonDoi, setComparisonDoi] = useState(null);
  const [summaryDoi, setSummaryDoi] = useState(null),
    [resultNote, setResultNote] = useState("");
  const fullTextCache = useRef(new Map());
  const [retryVersion, setRetryVersion] = useState(0);
  const [fullTextErrors, setFullTextErrors] = useState({});
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const input = (key, props = {}) => (
    <input
      className="input"
      id={key}
      value={form[key]}
      onChange={(e) => set(key, e.target.value)}
      {...props}
    />
  );
  const chosen = articles.filter((article) => selected.has(article.doi));
  const ordered = [...articles].sort((a, b) =>
    sort === "title"
      ? a.title.localeCompare(b.title)
      : sort === "date"
        ? (b.year || 0) - (a.year || 0)
        : 0,
  );
  async function submit(event) {
    event.preventDefault();
    setError("");
    const request = {
      ...form,
      mode,
      count: Number(form.count),
      dois: dois.map((row) => row.value.trim()).filter(Boolean),
    };
    if (mode === "analyze")
      Object.assign(request, {
        type: "",
        keywords: "",
        from: "",
        to: "",
        language: "",
      });
    try {
      validateRequest(request);
    } catch (err) {
      setError(err.message);
      return;
    }
    setBusy(true);
    try {
      const payload = {
        ...request,
        data: "Organized findings retained in browser.",
        statistics: "",
      };
      if (mode === "analyze") payload.context = "User-provided DOI lookup";
      const response = await fetch("/api/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Unable to retrieve articles.");
      setArticles(result.articles);
      setResultNote(result.note || "");
      setSelected(
        new Set(mode === "analyze" ? result.articles.map((a) => a.doi) : []),
      );
      setSort("relevance");
      setExperiment(request);
      setComparisonDoi(null);
      setPage("results");
      if (mode === "analyze" && result.articles.length) {
        if (request.data.trim()) setComparison("experiment");
        else {
          setSummaryDoi(result.articles[0].doi);
          setComparison("summary");
        }
      }
      setTimeout(() => resultHeading.current?.focus(), 0);
    } catch (err) {
      setError(err.message || "Unable to retrieve articles. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function upload(files) {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 20000 || !/\.(txt|csv|tsv)$/i.test(file.name)) {
      setError("Choose a .txt, .csv or .tsv file smaller than 20 KB.");
      return;
    }
    try {
      set("data", await file.text());
      setFileName(file.name);
      setError("");
    } catch {
      setError("Unable to read that file. Please try again.");
    }
  }
  function toggle(doi, value) {
    setSelected((previous) => {
      const next = new Set(previous);
      value ? next.add(doi) : next.delete(doi);
      return next;
    });
  }
  const experimentArticles = comparisonDoi
    ? articles.filter((a) => a.doi === comparisonDoi)
    : chosen;
  const panels = [];
  if (comparison === "experiment" && experiment)
    for (const article of experimentArticles)
      panels.push({
        key: article.doi,
        title: article.title,
        result: compare(
          article,
          experiment.context,
          experiment.data,
          experiment.statistics,
        ),
      });
  const first = chosen.find((a) => a.doi === pair[0]) || chosen[0];
  const second =
    chosen.find((a) => a.doi === pair[1] && a.doi !== first?.doi) ||
    chosen.find((a) => a.doi !== first?.doi);
  const activeArticles =
    comparison === "summary"
      ? articles.filter((a) => a.doi === summaryDoi)
      : comparison === "articles"
        ? [first, second].filter(Boolean)
        : comparison === "experiment"
          ? experimentArticles
          : [];
  const activeKey = activeArticles.map((a) => a.doi).join("|");
  useEffect(() => {
    let cancelled = false,
      cursor = 0;
    const pending = activeArticles.filter(
      (a) => !a.fullText || a.fullText.status === "loading",
    );
    async function worker() {
      while (!cancelled && cursor < pending.length) {
        const article = pending[cursor++];
        setArticles((current) =>
          current.map((a) =>
            a.doi === article.doi && !a.fullText?.supplied
              ? { ...a, fullText: { status: "loading", sections: [] } }
              : a,
          ),
        );
        if (!fullTextCache.current.has(article.doi))
          fullTextCache.current.set(
            article.doi,
            (async () => {
              try {
                const response = await fetch("/api/full-text", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ doi: article.doi }),
                });
                if (response.status === 404)
                  throw new Error(
                    "The running server does not support full-text retrieval. Pull the latest main branch and rebuild/restart your Codespace container.",
                  );
                if (!response.ok)
                  throw new Error(
                    `Full-text request failed (HTTP ${response.status}). Check the server log and retry.`,
                  );
                const result = await response.json();
                if (!result.fullText)
                  throw new Error(
                    "The server returned an invalid full-text response. Rebuild/restart your Codespace container.",
                  );
                return result.fullText;
              } catch (error) {
                return {
                  status: "unavailable",
                  retryable: true,
                  reason:
                    error.message ||
                    "Full text could not be retrieved. Please retry. Abstracts are not used for comparisons.",
                  sections: [],
                };
              }
            })(),
          );
        const fullText = await fullTextCache.current.get(article.doi);
        setArticles((current) =>
          current.map((a) =>
            a.doi === article.doi && !a.fullText?.supplied
              ? { ...a, fullText }
              : a,
          ),
        );
      }
    }
    Promise.all(Array.from({ length: Math.min(3, pending.length) }, worker));
    return () => {
      cancelled = true;
    };
    // Only selection changes or an explicit retry should schedule requests.
  }, [comparison, activeKey, retryVersion]);
  function retryFullText(doi) {
    fullTextCache.current.delete(doi);
    setArticles((current) =>
      current.map((a) => (a.doi === doi ? { ...a, fullText: undefined } : a)),
    );
    setRetryVersion((value) => value + 1);
  }
  async function importArticleFullText(article, files) {
    const file = files?.[0];
    if (!file) return;
    try {
      if (
        !/\.(txt|xml)$/i.test(file.name) ||
        file.size > (/\.xml$/i.test(file.name) ? 4000000 : 2000000)
      )
        throw new Error(
          "Choose a full article-body TXT file up to 2 MB or JATS XML file up to 4 MB. PDF files are not supported.",
        );
      const text = await file.text();
      const sections = /\.xml$/i.test(file.name)
        ? parseFullText(text)
        : parseProvidedText(text);
      if (!sections.length)
        throw new Error(
          "No article-body sections were found. Abstract-only files cannot be compared.",
        );
      const fullText = {
        status: "available",
        supplied: true,
        provider: "User-provided full text",
        fileName: file.name,
        sourceUrl: article.url,
        sections,
      };
      fullTextCache.current.set(article.doi, Promise.resolve(fullText));
      setArticles((current) =>
        current.map((a) => (a.doi === article.doi ? { ...a, fullText } : a)),
      );
      setFullTextErrors((current) => ({ ...current, [article.doi]: "" }));
    } catch (error) {
      setFullTextErrors((current) => ({
        ...current,
        [article.doi]: error.message,
      }));
    }
  }
  function openSummary(doi) {
    setSummaryDoi(doi);
    setComparison("summary");
  }
  function compareOneWithFindings(doi) {
    if (!experiment?.data?.trim()) return;
    setComparisonDoi(doi);
    setComparison("experiment");
  }
  function openComparison(kind) {
    setComparisonDoi(null);
    setPair([chosen[0]?.doi, chosen[1]?.doi]);
    setComparison(kind);
  }
  return (
    <>
      <header className="topbar">
        <div className="shell">
          <a
            className="brand"
            href="/"
            onClick={(event) => {
              event.preventDefault();
              setPage("setup");
            }}
          >
            <span className="brand-icon">
              <Library size={22} />
            </span>
            CandleLit
          </a>
          <span className="topnote">A LITTLE CONTEXT. A NEW CONNECTION.</span>
        </div>
      </header>
      <main className="shell">
        {page === "setup" ? (
          <>
            <div className="hero">
              <div>
                <p className="eyebrow">YOUR NEXT RESEARCH CONNECTION</p>
                <h1>
                  Put your findings
                  <br />
                  in context.
                </h1>
                <p className="intro">
                  Find relevant literature, explore published findings, and see
                  how your experiment connects. More time for discovery. Less
                  time searching.
                </p>
              </div>
              <aside className="insight">
                <Sparkles size={24} />
                <p className="serif text-xl!">
                  Good research starts
                  <br />
                  with better questions.
                </p>
                <p>
                  Explore the evidence around your work. This tool helps you
                  find and read sources, never write your paper.
                </p>
              </aside>
            </div>
            <div className="workspace">
              <aside className="steps" aria-label="Form sections">
                <p className="eyebrow">YOUR RESEARCH BRIEF</p>
                {[
                  "Research context",
                  "Your purpose",
                  "Organized findings",
                  "Analysis & filters",
                ].map((label, i) => (
                  <div
                    className={`step ${i === 0 || (form.context && i === 1) || (form.data && i === 2) ? "active" : ""}`}
                    key={label}
                  >
                    <span>{i + 1}</span>
                    {label}
                  </div>
                ))}
                <p className="hint mt-6">
                  No account required.
                  <br />
                  Your findings stay in this browser.
                </p>
              </aside>
              <form className="surface" onSubmit={submit} aria-busy={busy}>
                <Section title="01 · Tell us about your research">
                  <Field
                    label="Title, topic, materials, and methods"
                    id="context"
                    hint="Include the details that make your experiment distinct."
                  >
                    <textarea
                      className="textarea"
                      id="context"
                      required
                      maxLength={20000}
                      value={form.context}
                      onChange={(e) => set("context", e.target.value)}
                      placeholder="What are you investigating? Describe your research question, materials, and approach…"
                    />
                  </Field>
                </Section>
                <Section title="02 · What would you like to do?">
                  <RadioGroup
                    aria-label="Research purpose"
                    value={mode}
                    onChange={setMode}
                    className="mode-group"
                  >
                    <Radio value="find" className="mode-card">
                      <span className="radio-dot" />
                      <span>
                        Find articles
                        <small>
                          Discover literature relevant to your experiment
                        </small>
                      </span>
                    </Radio>
                    <Radio value="analyze" className="mode-card">
                      <span className="radio-dot" />
                      <span>
                        Analyze and compare articles
                        <small>Explore the articles you already have</small>
                      </span>
                    </Radio>
                  </RadioGroup>
                  {mode === "analyze" && (
                    <div>
                      <p className="hint mt-4">
                        Add up to 20 DOIs or doi.org URLs.
                      </p>
                      {dois.map((row, i) => (
                        <div className="doi-row" key={row.id}>
                          <Field
                            label={`Article DOI ${i + 1}`}
                            id={`doi-${row.id}`}
                          >
                            <input
                              className="input"
                              id={`doi-${row.id}`}
                              required
                              maxLength={500}
                              value={row.value}
                              onChange={(e) =>
                                setDois((rows) =>
                                  rows.map((item) =>
                                    item.id === row.id
                                      ? { ...item, value: e.target.value }
                                      : item,
                                  ),
                                )
                              }
                              placeholder="10.1234/example or https://doi.org/…"
                            />
                          </Field>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remove article DOI ${i + 1}`}
                            disabled={dois.length === 1}
                            onClick={() =>
                              setDois((rows) =>
                                rows.filter((item) => item.id !== row.id),
                              )
                            }
                          >
                            <X size={17} />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={dois.length >= 20}
                        onClick={() =>
                          setDois((rows) => [
                            ...rows,
                            { id: nextDoi.current++, value: "" },
                          ])
                        }
                      >
                        <Plus size={16} /> Add another article
                      </Button>
                    </div>
                  )}
                </Section>
                <Section title="03 · Share your organized findings (optional)">
                  <Field
                    label="Organized findings"
                    id="data"
                    hint="Paste a results table, graph description, or summarized findings. Use organized results rather than raw observations."
                  >
                    <textarea
                      className="textarea"
                      id="data"
                      maxLength={20000}
                      value={form.data}
                      onChange={(e) => set("data", e.target.value)}
                      placeholder={
                        "Treatment | Mean growth (cm) | SD | n\nControl | 12.4 | 1.8 | 20\nTreatment A | 15.2 | 2.1 | 20"
                      }
                    />
                  </Field>
                  <div className="upload">
                    <Upload size={19} />
                    <div>
                      <FileTrigger
                        acceptedFileTypes={[".txt", ".csv", ".tsv"]}
                        onSelect={upload}
                      >
                        <AriaButton className="text-sm font-medium underline underline-offset-4">
                          Import an organized data file
                        </AriaButton>
                      </FileTrigger>
                      <p className="hint">
                        {fileName || "TXT, CSV or TSV · up to 20 KB"}
                      </p>
                    </div>
                  </div>
                </Section>
                <Section title="04 · A little more context">
                  <Field
                    label="Statistical software and analysis methods (optional)"
                    id="statistics"
                  >
                    {input("statistics", {
                      maxLength: 2000,
                      placeholder: "e.g. R, two-way ANOVA, Tukey post-hoc test",
                    })}
                  </Field>
                  {mode === "find" && (
                    <>
                      <Field label="Suggested articles (1–50)" id="count">
                        {input("count", {
                          type: "number",
                          min: 1,
                          max: 50,
                          required: true,
                        })}
                      </Field>
                      <Accordion type="single" collapsible>
                        <AccordionItem value="filters">
                          <AccordionTrigger>
                            Refine your literature search
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="two-col">
                              <Field label="Resource type" id="type">
                                <select
                                  className="input"
                                  id="type"
                                  value={form.type}
                                  onChange={(e) => set("type", e.target.value)}
                                >
                                  <option value="">All resources</option>
                                  <option value="journal-article">
                                    Journal articles
                                  </option>
                                  <option value="review-article">
                                    Review articles
                                  </option>
                                  <option value="dissertation">
                                    Dissertations
                                  </option>
                                  <option value="book">Books</option>
                                  <option value="proceedings-article">
                                    Conference papers
                                  </option>
                                </select>
                              </Field>
                              <Field label="Keywords" id="keywords">
                                {input("keywords", {
                                  maxLength: 500,
                                  placeholder: "e.g. drought, chlorophyll",
                                })}
                              </Field>
                              <Field label="From year" id="from">
                                {input("from", {
                                  type: "number",
                                  min: 1000,
                                  max: 2999,
                                  step: 1,
                                  placeholder: "e.g. 2020",
                                })}
                              </Field>
                              <Field label="Through year" id="to">
                                {input("to", {
                                  type: "number",
                                  min: 1000,
                                  max: 2999,
                                  step: 1,
                                  placeholder: "e.g. 2026",
                                })}
                              </Field>
                              <Field label="Article language" id="language">
                                <select
                                  id="language"
                                  className="input"
                                  value={form.language}
                                  onChange={(e) =>
                                    set("language", e.target.value)
                                  }
                                >
                                  <option value="">All languages</option>
                                  {Object.entries(LANGUAGES).map(
                                    ([code, label]) => (
                                      <option key={code} value={code}>
                                        {label}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </Field>
                            </div>
                            <p className="hint">
                              Review and language filters use available
                              publication metadata. Records with unknown
                              language are excluded when a language is selected.
                              Some reviews may lack classification metadata.
                              DOAJ review-policy labels describe journal policy,
                              not article-level verification.
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    </>
                  )}
                </Section>
                <div className="section">
                  {error && (
                    <div className="error" role="alert">
                      {error}
                    </div>
                  )}
                  <div className="submit-row">
                    <span className="privacy">
                      <ShieldCheck size={16} /> Your findings stay private
                    </span>
                    <Button type="submit" size="lg" disabled={busy}>
                      {busy ? (
                        <>
                          <LoaderCircle className="spinner" size={17} />{" "}
                          Searching literature…
                        </>
                      ) : (
                        <>
                          {mode === "find"
                            ? "Find research connections"
                            : "Analyze my articles"}
                          <ArrowRight size={17} />
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="hint mt-4">
                    Only research context and keywords are sent to Crossref for
                    discovery. Article cards show abstracts; comparisons use
                    retrieved full text to guide reading, not scientific
                    conclusions.
                  </p>
                  {busy && (
                    <div role="status" className="hint">
                      Retrieving publisher metadata. This may take up to 40
                      seconds.
                    </div>
                  )}
                </div>
              </form>
            </div>
          </>
        ) : (
          <>
            <div className="hero">
              <div>
                <p className="eyebrow">YOUR LITERATURE WORKSPACE</p>
                <h1 tabIndex={-1} ref={resultHeading}>
                  Connections worth
                  <br />
                  exploring.
                </h1>
                <p className="intro">
                  Follow the evidence. Select useful references, explore their
                  abstracts, and compare perspectives with your findings.
                </p>
              </div>
              <aside className="insight">
                <BookOpen size={24} />
                <p className="serif text-xl!">
                  {articles.length} research connections
                </p>
                <p>
                  Results from Crossref. Relevance reflects your research brief,
                  not the strength of scientific evidence.
                </p>
              </aside>
            </div>
            <nav className="result-nav">
              <Button variant="ghost" onClick={() => setPage("setup")}>
                <ArrowLeft size={15} /> Edit research brief
              </Button>
              <ChevronRight size={13} /> Literature results
            </nav>
            <div className="result-toolbar">
              <p className="text-sm m-0" role="status">
                {articles.length} articles found · {selected.size} selected
              </p>
              <label className="sort">
                Sort by{" "}
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="relevance">Relevance</option>
                  <option value="date">Newest first</option>
                  <option value="title">Title A–Z</option>
                </select>
              </label>
            </div>
            {resultNote && (
              <p className="hint" role="status">
                {resultNote}
              </p>
            )}
            <div className="result-grid">
              <div>
                {!articles.length ? (
                  <div className="surface empty">
                    <Search size={35} />
                    <h2 className="serif text-2xl">No connections yet</h2>
                    <p className="hint">
                      Try broader keywords or a wider publication date range.
                    </p>
                    <Button
                      variant="outline"
                      className="mt-5"
                      onClick={() => setPage("setup")}
                    >
                      Adjust your research brief
                    </Button>
                  </div>
                ) : (
                  ordered.map((article) => (
                    <article
                      className={`surface article ${selected.has(article.doi) ? "selected" : ""}`}
                      key={article.doi}
                    >
                      <div className="article-top">
                        <Badge variant="secondary">
                          {article.resourceLabel ||
                            article.type?.replaceAll("-", " ") ||
                            "Research"}
                        </Badge>
                        <Checkbox
                          aria-label={`Select ${article.title}`}
                          isSelected={selected.has(article.doi)}
                          onChange={(value) => toggle(article.doi, value)}
                          className="check"
                        >
                          {({ isSelected }) => (
                            <>
                              <span className="check-box">
                                {isSelected && <Check size={13} />}
                              </span>
                              {isSelected ? "Selected" : "Select article"}
                            </>
                          )}
                        </Checkbox>
                      </div>
                      <h2>{article.title}</h2>
                      <p className="metadata">
                        {article.authors} · {article.year || "Date unavailable"}{" "}
                        · {article.languageLabel || "Language not supplied"}
                      </p>
                      <div className="badges">
                        {article.keywords?.map((keyword) => (
                          <Badge key={keyword} variant="outline">
                            {keyword}
                          </Badge>
                        ))}
                      </div>
                      <Accordion
                        type="single"
                        collapsible
                        defaultValue={
                          experiment.mode === "analyze" ? "abstract" : undefined
                        }
                      >
                        <AccordionItem value="abstract">
                          <AccordionTrigger>Abstract summary</AccordionTrigger>
                          <AccordionContent>
                            <p className="summary-text">{article.summary}</p>
                            <p className="hint">
                              {article.summarySource ||
                                "Extract from publisher-deposited abstract; not a full-text summary."}
                            </p>
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3"
                        aria-label={`View section summaries for ${article.title}`}
                        onClick={() => openSummary(article.doi)}
                      >
                        View section summaries
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 ml-2"
                        disabled={!experiment?.data?.trim()}
                        aria-label={`Compare ${article.title} with my findings`}
                        onClick={() => compareOneWithFindings(article.doi)}
                      >
                        Compare with my findings
                      </Button>
                      <div className="flex justify-between items-center mt-4 gap-3">
                        <PeerReviewLabel article={article} />
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Publisher source <ExternalLink size={14} />
                          </a>
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
              <aside className="surface selection-panel">
                <GitCompareArrows size={22} />
                <h2 className="mt-4">Your reading collection</h2>
                <p className="count">{selected.size}</p>
                <p className="hint">articles selected for comparison</p>
                <div className="flex gap-2 mt-4">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!articles.length}
                    onClick={() =>
                      setSelected(new Set(articles.map((a) => a.doi)))
                    }
                  >
                    Select all
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!selected.size}
                    onClick={() => setSelected(new Set())}
                  >
                    Clear
                  </Button>
                </div>
                <hr className="border-border my-5" />
                <Button
                  disabled={!chosen.length || !experiment?.data?.trim()}
                  onClick={() => openComparison("experiment")}
                >
                  Compare with my findings
                </Button>
                <Button
                  variant="outline"
                  disabled={chosen.length !== 1}
                  onClick={() => openSummary(chosen[0].doi)}
                >
                  View selected article summary
                </Button>
                {!experiment?.data?.trim() && (
                  <p className="hint">
                    Add organized findings to compare literature with your own
                    data. Article summaries and article-to-article comparisons
                    do not require a dataset.
                  </p>
                )}
                <Button
                  variant="outline"
                  disabled={chosen.length < 2}
                  onClick={() => openComparison("articles")}
                >
                  Compare articles
                </Button>
                <p className="hint mt-4">
                  Select two or more articles to compare them with each other.
                  Textual overlap is a starting point for reading, not evidence
                  of agreement.
                </p>
              </aside>
            </div>
          </>
        )}
      </main>
      <ModalOverlay
        isOpen={!!comparison}
        onOpenChange={(open) => {
          if (!open) setComparison(null);
        }}
        isDismissable
      >
        <Modal>
          <Dialog
            className="dialog"
            aria-label={
              comparison === "summary"
                ? "Article section summaries"
                : comparison === "articles"
                  ? "Article-to-article comparison"
                  : "Literature and your findings"
            }
          >
            <div className="dialog-header">
              <div>
                <p className="eyebrow">EXPLORE THE CONNECTIONS</p>
                <Heading slot="title">
                  {comparison === "summary"
                    ? "Article section summaries"
                    : comparison === "articles"
                      ? "Articles in conversation"
                      : "Literature and your findings"}
                </Heading>
              </div>
              <AriaButton
                className="rounded-md p-2 hover:bg-secondary"
                aria-label={
                  comparison === "summary"
                    ? "Close summary"
                    : "Close comparison"
                }
                onPress={() => setComparison(null)}
              >
                <X size={21} />
              </AriaButton>
            </div>
            <Tabs defaultValue="connections">
              <TabsList>
                <TabsTrigger value="connections">
                  {comparison === "summary"
                    ? "Section summaries"
                    : "Connections"}
                </TabsTrigger>
                <TabsTrigger value="evidence">Evidence & limits</TabsTrigger>
              </TabsList>
              <TabsContent value="connections">
                {activeArticles.some(
                  (a) => !a.fullText || a.fullText.status === "loading",
                ) && (
                  <p className="hint" role="status">
                    <LoaderCircle className="spinner inline mr-2" size={15} />
                    Retrieving full text for selected articles…
                  </p>
                )}
                {activeArticles.map((a) => (
                  <div className="comparison-card" key={a.doi}>
                    <h3>{a.title}</h3>
                    {a.fullText?.status === "unavailable" && (
                      <p className="font-medium">Full text unavailable</p>
                    )}
                    <p className="hint">
                      {a.fullText?.status === "available"
                        ? `Full text ready · ${a.fullText.provider || "Full article body"}${a.fullText.fileName ? " · " + a.fullText.fileName : ""}`
                        : a.fullText?.reason || "Retrieving full text…"}
                    </p>
                    <div className="flex flex-wrap gap-3 mt-3">
                      {a.fullText?.status === "unavailable" &&
                        a.fullText.retryable !== false && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => retryFullText(a.doi)}
                          >
                            Retry full text for {a.title}
                          </Button>
                        )}
                      <FileTrigger
                        acceptedFileTypes={[".txt", ".xml"]}
                        onSelect={(files) => importArticleFullText(a, files)}
                      >
                        <AriaButton className="text-sm underline underline-offset-4">
                          Import full text for {a.title}
                        </AriaButton>
                      </FileTrigger>
                    </div>
                    <p className="hint">
                      You can supply an article-body TXT (2 MB) or JATS XML (4
                      MB) file you have access to. TXT files need section
                      headings such as Introduction, Methods and Results. Files
                      stay in this browser; abstracts and references are
                      excluded.
                    </p>
                    {fullTextErrors[a.doi] && (
                      <p className="error" role="alert">
                        {fullTextErrors[a.doi]}
                      </p>
                    )}
                  </div>
                ))}
                {comparison === "experiment" && experiment && (
                  <>
                    <p className="field-label mt-5">Your organized findings</p>
                    <pre className="findings">{experiment.data}</pre>
                  </>
                )}
                {comparison === "summary" ? (
                  <>
                    <Field label="Article to summarize" id="summary-article">
                      <select
                        className="input"
                        id="summary-article"
                        value={summaryDoi || ""}
                        onChange={(e) => setSummaryDoi(e.target.value)}
                      >
                        {articles.map((a) => (
                          <option key={a.doi} value={a.doi}>
                            {a.title}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <ArticleSectionSummary
                      article={activeArticles[0]}
                      canCompare={!!experiment?.data?.trim()}
                      onCompare={compareOneWithFindings}
                    />
                  </>
                ) : comparison === "articles" ? (
                  <>
                    <div className="two-col mt-5">
                      {[
                        ["Article A", first, 0],
                        ["Article B", second, 1],
                      ].map(([label, article, index]) => (
                        <Field
                          key={label}
                          label={label}
                          id={`compare-${index}`}
                        >
                          <select
                            className="input"
                            id={`compare-${index}`}
                            value={article?.doi || ""}
                            onChange={(event) =>
                              setPair((current) => {
                                const next = [...current];
                                next[index] = event.target.value;
                                return next;
                              })
                            }
                          >
                            {chosen.map((a) => (
                              <option
                                key={a.doi}
                                value={a.doi}
                                disabled={
                                  a.doi ===
                                  (index === 0 ? second?.doi : first?.doi)
                                }
                              >
                                {a.title}
                              </option>
                            ))}
                          </select>
                        </Field>
                      ))}
                    </div>
                    <ArticleComparison first={first} second={second} />
                  </>
                ) : (
                  panels.map((panel) => (
                    <ComparisonCard key={panel.key} {...panel} />
                  ))
                )}
              </TabsContent>
              <TabsContent value="evidence">
                <div className="comparison-card">
                  <h3>What this comparison can tell you</h3>
                  <p className="summary-text">
                    Comparisons summarize sections from accessible full article
                    bodies. Abstracts are excluded. They help you find passages
                    worth investigating; they do not establish scientific
                    agreement, causality, or comparable effect sizes.
                  </p>
                  <p className="hint">
                    Coverage is currently limited to open-access full text
                    available through Europe PMC, supported Maximum Academic
                    Press article pages, or full text you import. Imported
                    content is provided by you and is not independently
                    verified. Section summaries are extractive and may omit
                    details. Check the linked full text before interpreting
                    differences. Statistical software is recorded as context and
                    is not executed.
                  </p>
                </div>
              </TabsContent>
            </Tabs>
          </Dialog>
        </Modal>
      </ModalOverlay>
      <footer>
        CandleLit · Find sources. Explore context. Keep your scientific
        judgment.
      </footer>
    </>
  );
}
