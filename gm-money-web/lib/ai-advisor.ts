import { getEnv } from "./env";
import { getDashboardData } from "./dashboard";
import { getScheduledTransactions } from "./scheduled";
import { getBusinessId, getSupabaseServerClient } from "./supabase";

export type AiAdviceResult = {
  answer: string;
  priorities: string[];
  actions: string[];
  risks: string[];
  confidence: "high" | "medium" | "low";
  model: string;
};

export type AiAdviceHistoryItem = {
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

const DEFAULT_HISTORY_LIMIT = 6;

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 6);
}

function clip(text: string, max = 1200): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function normalizeConfidence(value: unknown): "high" | "medium" | "low" {
  const raw = String(value ?? "medium").toLowerCase();
  if (raw === "high" || raw === "low") return raw;
  return "medium";
}

function isMissingAdviceLogTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string; details?: string };
  const text = `${maybe.code ?? ""} ${maybe.message ?? ""} ${maybe.details ?? ""}`.toLowerCase();
  return text.includes("ai_advice_log") && (text.includes("does not exist") || text.includes("not found") || text.includes("42p01") || text.includes("pgrst"));
}

function isAdviceLogAccessDenied(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string; details?: string };
  const text = `${maybe.code ?? ""} ${maybe.message ?? ""} ${maybe.details ?? ""}`.toLowerCase();
  return text.includes("ai_advice_log") && (text.includes("permission denied") || text.includes("42501"));
}

function isAdviceLogColumnMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; message?: string; details?: string };
  const text = `${maybe.code ?? ""} ${maybe.message ?? ""} ${maybe.details ?? ""}`.toLowerCase();
  return text.includes("42703") || text.includes("outcome_note") || text.includes("outcome_updated_at") || text.includes("followed");
}

function buildSystemPrompt(): string {
  return [
    "You are GM Money's AI co-CFO for a small business.",
    "Give practical financial guidance, not generic budgeting advice.",
    "Ground every recommendation in the provided metrics and schedule context.",
    "Use advisor outcome feedback to adapt recommendations toward tactics that were followed and avoid repeating tactics marked not followed unless context materially changed.",
    "Prioritize cashflow, risk reduction, and near-term execution.",
    "Return ONLY valid JSON with keys: answer, priorities, actions, risks, confidence.",
    "confidence must be one of: high, medium, low.",
    "Each priorities/actions/risks entry should be concise and specific.",
  ].join(" ");
}

function buildOutcomeFeedback(history: AiAdviceHistoryItem[]) {
  const tracked = history.filter((item) => item.followed !== null);
  const followed = tracked.filter((item) => item.followed === true);
  const notFollowed = tracked.filter((item) => item.followed === false);

  const positiveNotes = followed
    .map((item) => item.outcomeNote)
    .filter((note): note is string => typeof note === "string" && note.trim().length > 0)
    .slice(0, 4)
    .map((note) => clip(note, 180));

  const negativeNotes = notFollowed
    .map((item) => item.outcomeNote)
    .filter((note): note is string => typeof note === "string" && note.trim().length > 0)
    .slice(0, 4)
    .map((note) => clip(note, 180));

  return {
    trackedCount: tracked.length,
    followedCount: followed.length,
    notFollowedCount: notFollowed.length,
    followRate: tracked.length > 0 ? Number((followed.length / tracked.length).toFixed(3)) : null,
    positiveOutcomeNotes: positiveNotes,
    negativeOutcomeNotes: negativeNotes,
  };
}

export async function getRecentAiAdvice(limit = DEFAULT_HISTORY_LIMIT): Promise<AiAdviceHistoryItem[]> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const maxRows = Math.max(1, Math.min(limit, 20));

  const { data, error } = await supabase
    .from("ai_advice_log")
    .select("id, created_at, question, answer, confidence, model, followed, outcome_note, outcome_updated_at")
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(maxRows);

  if (error) {
    if (isAdviceLogColumnMissing(error)) {
      const fallback = await supabase
        .from("ai_advice_log")
        .select("id, created_at, question, answer, confidence, model")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false })
        .limit(maxRows);
      if (fallback.error) {
        if (isMissingAdviceLogTable(fallback.error) || isAdviceLogAccessDenied(fallback.error)) return [];
        throw new Error(fallback.error.message);
      }

      return (fallback.data ?? []).map((row) => ({
        id: row.id as string,
        createdAt: String(row.created_at),
        question: String(row.question ?? ""),
        answer: String(row.answer ?? ""),
        confidence: normalizeConfidence(row.confidence),
        model: String(row.model ?? "unknown"),
        followed: null,
        outcomeNote: null,
        outcomeUpdatedAt: null,
      }));
    }
    if (isMissingAdviceLogTable(error) || isAdviceLogAccessDenied(error)) return [];
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: String(row.created_at),
    question: String(row.question ?? ""),
    answer: String(row.answer ?? ""),
    confidence: normalizeConfidence(row.confidence),
    model: String(row.model ?? "unknown"),
    followed: row.followed == null ? null : Boolean(row.followed),
    outcomeNote: row.outcome_note == null ? null : String(row.outcome_note),
    outcomeUpdatedAt: row.outcome_updated_at == null ? null : String(row.outcome_updated_at),
  }));
}

export async function recordAiAdviceOutcome(input: {
  id: string;
  followed: boolean;
  outcomeNote: string | null;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ai_advice_log")
    .update({
      followed: input.followed,
      outcome_note: input.outcomeNote ? clip(input.outcomeNote.trim(), 2000) : null,
      outcome_updated_at: now,
    })
    .eq("business_id", businessId)
    .eq("id", input.id);

  if (!error) return;
  if (isAdviceLogAccessDenied(error)) throw new Error("Advisor memory is read-only right now. Please grant write permission to ai_advice_log.");
  if (isAdviceLogColumnMissing(error)) throw new Error("Advisor outcome columns are missing. Run the latest ai_advice_log migration.");
  if (isMissingAdviceLogTable(error)) throw new Error("Advisor memory table is missing. Run the ai_advice_log migration.");
  throw new Error(error.message);
}

async function saveAiAdviceLog(input: {
  question: string;
  result: AiAdviceResult;
  contextJson: string;
}): Promise<void> {
  const supabase = getSupabaseServerClient();
  const businessId = await getBusinessId();
  const now = new Date().toISOString();
  const { error } = await supabase.from("ai_advice_log").insert({
    business_id: businessId,
    question: clip(input.question, 1200),
    answer: clip(input.result.answer, 6000),
    priorities: input.result.priorities,
    actions: input.result.actions,
    risks: input.result.risks,
    confidence: input.result.confidence,
    model: input.result.model,
    context_snapshot: clip(input.contextJson, 15000),
    created_at: now,
  });

  if (error && !isMissingAdviceLogTable(error) && !isAdviceLogAccessDenied(error)) {
    throw new Error(error.message);
  }
}

async function buildBusinessContext(question: string, history: AiAdviceHistoryItem[]): Promise<string> {
  const [dashboard, scheduled] = await Promise.all([getDashboardData(), getScheduledTransactions()]);
  const today = new Date();
  const plus14 = new Date(today);
  plus14.setDate(plus14.getDate() + 14);
  const plus14Key = `${plus14.getFullYear()}-${String(plus14.getMonth() + 1).padStart(2, "0")}-${String(plus14.getDate()).padStart(2, "0")}`;

  const dueSoon = scheduled
    .filter((s) => s.active && s.nextDue <= plus14Key)
    .slice(0, 12)
    .map((s) => ({
      payee: s.payee,
      due: s.nextDue,
      amount: s.amount,
      frequency: s.frequency,
      account: s.account,
      autoCreate: s.autoCreate,
    }));

  const outcomeFeedback = buildOutcomeFeedback(history);

  const context = {
    question: clip(question, 700),
    today: today.toISOString().slice(0, 10),
    headlineMetrics: {
      incomeThisMonth: dashboard.incomeThisMonth,
      expensesThisMonth: dashboard.expensesThisMonth,
      pendingReviewCount: dashboard.pendingReviewCount,
      unclearedCount: dashboard.unclearedCount,
      cashOnHand: dashboard.accounts.reduce((sum, a) => sum + a.balance, 0),
    },
    accounts: dashboard.accounts,
    topExpenseCategories: dashboard.spendingByCategory,
    recentTransactions: dashboard.recentTransactions.slice(0, 8),
    cashflowLast30Days: dashboard.cashflowSeries,
    scheduledDueWithin14Days: dueSoon,
    recentAdvisorHistory: history.slice(0, 4).map((item) => ({
      askedAt: item.createdAt,
      question: clip(item.question, 220),
      answer: clip(item.answer, 320),
      confidence: item.confidence,
      followed: item.followed,
      outcomeNote: item.outcomeNote ? clip(item.outcomeNote, 220) : null,
      outcomeUpdatedAt: item.outcomeUpdatedAt,
    })),
    advisorOutcomeFeedback: outcomeFeedback,
  };

  return JSON.stringify(context);
}

async function askOpenAI(question: string, contextJson: string): Promise<AiAdviceResult> {
  const apiKey = getEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const model = getEnv("OPENAI_MODEL") ?? "gpt-4o-mini";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildSystemPrompt() },
        {
          role: "user",
          content: `Business context JSON:\n${contextJson}\n\nRespond as instructed.`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI returned no content.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = { answer: content };
  }

  const obj = parsed as Record<string, unknown>;
  const confidence = normalizeConfidence(obj.confidence);

  return {
    answer:
      typeof obj.answer === "string" && obj.answer.trim().length > 0
        ? obj.answer.trim()
        : "I reviewed your current cashflow and schedule context. Prioritize the top actions below this week.",
    priorities: asStringArray(obj.priorities),
    actions: asStringArray(obj.actions),
    risks: asStringArray(obj.risks),
    confidence,
    model,
  };
}

export async function generateAiAdvice(question: string): Promise<AiAdviceResult> {
  const history = await getRecentAiAdvice();
  const contextJson = await buildBusinessContext(question, history);
  const result = await askOpenAI(question, contextJson);
  await saveAiAdviceLog({ question, result, contextJson });
  return result;
}
