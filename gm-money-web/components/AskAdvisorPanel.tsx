"use client";

import { useState } from "react";
import { useEffect } from "react";

type AdviceResult = {
  answer: string;
  priorities: string[];
  actions: string[];
  risks: string[];
  confidence: "high" | "medium" | "low";
  model: string;
};

type AdviceHistoryItem = {
  id: string;
  createdAt: string;
  question: string;
  answer: string;
  confidence: "high" | "medium" | "low";
  model: string;
  followed: boolean | null;
  outcomeNote: string | null;
  outcomeUpdatedAt: string | null;
};

const STARTER_QUESTIONS = [
  "What should I focus on this week to improve cashflow?",
  "Where are we most likely to overspend this month?",
  "What can I cut in the next 14 days without hurting growth?",
  "How should I sequence outgoing payments this week?",
];

export function AskAdvisorPanel() {
  const [question, setQuestion] = useState(STARTER_QUESTIONS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AdviceResult | null>(null);
  const [history, setHistory] = useState<AdviceHistoryItem[]>([]);
  const [savingOutcomeId, setSavingOutcomeId] = useState<string | null>(null);
  const [outcomeDraftById, setOutcomeDraftById] = useState<Record<string, string>>({});

  function syncOutcomeDrafts(items: AdviceHistoryItem[]) {
    setOutcomeDraftById((prev) => {
      const next: Record<string, string> = { ...prev };
      for (const item of items) {
        if (!(item.id in next)) {
          next[item.id] = item.outcomeNote ?? "";
        }
      }
      return next;
    });
  }

  useEffect(() => {
    let active = true;

    async function loadHistory() {
      const response = await fetch("/api/ai/advice", { method: "GET", cache: "no-store" });
      const payload = (await response.json()) as
        | { ok: true; history: AdviceHistoryItem[] }
        | { ok: false; error?: string };
      if (!active || !response.ok || !payload.ok) return;
      setHistory(payload.history);
      syncOutcomeDrafts(payload.history);
    }

    void loadHistory();

    return () => {
      active = false;
    };
  }, []);

  async function ask() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/ai/advice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });

    const payload = (await response.json()) as
      | { ok: true; result: AdviceResult; history: AdviceHistoryItem[] }
      | { ok: false; error?: string };

    setLoading(false);

    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "AI request failed." : payload.error || "AI request failed.");
      return;
    }

    setResult(payload.result);
    setHistory(payload.history);
    syncOutcomeDrafts(payload.history);
  }

  async function saveOutcome(item: AdviceHistoryItem, followed: boolean) {
    setSavingOutcomeId(item.id);
    setError("");

    const response = await fetch("/api/ai/advice", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, followed, outcomeNote: outcomeDraftById[item.id] ?? "" }),
    });

    const payload = (await response.json()) as
      | { ok: true; history: AdviceHistoryItem[] }
      | { ok: false; error?: string };

    setSavingOutcomeId(null);

    if (!response.ok || !payload.ok) {
      setError(payload.ok ? "Could not save advisor outcome." : payload.error || "Could not save advisor outcome.");
      return;
    }

    setHistory(payload.history);
    syncOutcomeDrafts(payload.history);
  }

  return (
    <section className="gm-ai-ask" style={{ maxWidth: 1200, margin: "14px auto 0" }}>
      <div className="gm-ai-ask__head">
        <h2>Ask GM Money</h2>
        <p>Ask strategy questions and get co-CFO guidance tied to your live books.</p>
      </div>

      <div className="gm-ai-ask__quick">
        {STARTER_QUESTIONS.map((prompt) => (
          <button key={prompt} type="button" onClick={() => setQuestion(prompt)}>
            {prompt}
          </button>
        ))}
      </div>

      <div className="gm-ai-ask__composer">
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} placeholder="Ask about cashflow, risk, spend controls, or growth decisions..." />
        <button type="button" className="gm-button gm-button--glow" disabled={loading || !question.trim()} onClick={() => void ask()}>
          {loading ? "Analyzing..." : "Ask AI"}
        </button>
      </div>

      {error && <p className="gm-error">{error}</p>}

      {result && (
        <div className="gm-ai-ask__result">
          <div className="gm-ai-ask__answer">
            <h3>Guidance</h3>
            <p>{result.answer}</p>
            <small>
              Confidence: {result.confidence} · Model: {result.model}
            </small>
          </div>

          <div className="gm-ai-ask__columns">
            <div>
              <h4>Priorities</h4>
              {result.priorities.length === 0 ? <p className="gm-register-note">No priorities returned.</p> : null}
              {result.priorities.map((item) => (
                <p key={item}>• {item}</p>
              ))}
            </div>
            <div>
              <h4>Recommended actions</h4>
              {result.actions.length === 0 ? <p className="gm-register-note">No actions returned.</p> : null}
              {result.actions.map((item) => (
                <p key={item}>• {item}</p>
              ))}
            </div>
            <div>
              <h4>Risks to watch</h4>
              {result.risks.length === 0 ? <p className="gm-register-note">No risks returned.</p> : null}
              {result.risks.map((item) => (
                <p key={item}>• {item}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div className="gm-ai-ask__history">
          <h3>Recent advisor memory</h3>
          <div className="gm-ai-ask__history-list">
            {history.map((item) => (
              <article key={item.id} className="gm-ai-ask__history-item">
                <p className="gm-ai-ask__history-question">Q: {item.question}</p>
                <p className="gm-ai-ask__history-answer">A: {item.answer}</p>
                <p className={item.followed == null ? "gm-ai-ask__history-status" : item.followed ? "gm-ai-ask__history-status gm-ai-ask__history-status--followed" : "gm-ai-ask__history-status gm-ai-ask__history-status--not-followed"}>
                  {item.followed == null ? "Outcome: not tracked yet" : item.followed ? "Outcome: marked followed" : "Outcome: marked not followed"}
                </p>
                <textarea
                  className="gm-ai-ask__history-note"
                  value={outcomeDraftById[item.id] ?? ""}
                  onChange={(e) => setOutcomeDraftById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="What happened after this advice?"
                  rows={2}
                />
                <div className="gm-ai-ask__history-actions">
                  <button
                    type="button"
                    className="gm-link-button"
                    disabled={savingOutcomeId === item.id}
                    onClick={() => void saveOutcome(item, true)}
                  >
                    {savingOutcomeId === item.id ? "Saving..." : "Mark Followed"}
                  </button>
                  <button
                    type="button"
                    className="gm-link-button"
                    disabled={savingOutcomeId === item.id}
                    onClick={() => void saveOutcome(item, false)}
                  >
                    {savingOutcomeId === item.id ? "Saving..." : "Mark Not Followed"}
                  </button>
                </div>
                <small>
                  {new Date(item.createdAt).toLocaleString()} · {item.confidence} confidence · {item.model}
                  {item.outcomeUpdatedAt ? ` · outcome updated ${new Date(item.outcomeUpdatedAt).toLocaleDateString()}` : ""}
                </small>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
