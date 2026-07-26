import type { AdvisorBrief } from "@/lib/advisor";

type Props = {
  brief: AdvisorBrief;
};

export function AdvisorPanel({ brief }: Props) {
  return (
    <section className="gm-ai-panel" style={{ maxWidth: 1200, margin: "18px auto 0" }}>
      <div className="gm-ai-panel__head">
        <h2>Co-CFO Insights</h2>
        <p>{brief.headline}</p>
      </div>

      <div className="gm-ai-panel__grid">
        {brief.insights.map((insight) => (
          <article
            key={insight.id}
            className={
              insight.tone === "alert"
                ? "gm-ai-card gm-ai-card--alert"
                : insight.tone === "watch"
                  ? "gm-ai-card gm-ai-card--watch"
                  : "gm-ai-card gm-ai-card--good"
            }
          >
            <h3>{insight.title}</h3>
            <p>{insight.message}</p>
            <strong>{insight.action}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}
