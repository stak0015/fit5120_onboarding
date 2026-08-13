import { type FormEvent, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";


export type ActionProfile = {
  ageGroup: string;
  sex: string;
  ethnicity: string;
  state: string;
  activity: string;
  smoking: string;
  alcohol: string;
  diet: string;
  familyHistory: string;
  sleepQuality: string;
  stressLevel: string;
};

type GoalStatus = "not_started" | "in_progress" | "completed";
type GoalSource = "user" | "ai";

type PopulationContextItem = {
  cause_of_death: string;
  death_count: number;
};

type ActionSuggestion = {
  suggestion_id: string;
  category: string;
  title: string;
  action: string;
  target: string;
  timeframe_weeks: number;
  rationale: string;
  lifestyle_basis: string[];
  population_basis: string[];
  professional_support_note: string | null;
};

type ActionSuggestionResponse = {
  request_id: string;
  generation_mode: "ai" | "curated" | "curated_fallback";
  fallback_reason:
    | "not_configured"
    | "provider_connection"
    | "provider_timeout"
    | "provider_rate_limited"
    | "provider_rejected_request"
    | "invalid_output"
    | "safety_rejected"
    | "unexpected_error"
    | null;
  model: string | null;
  provider_processing: boolean;
  comparison_group: string;
  population_context: PopulationContextItem[];
  suggestions: ActionSuggestion[];
  notice: string;
  disclaimer: string;
};

type StoredGoal = {
  id: string;
  source: GoalSource;
  sourceSuggestionId: string | null;
  title: string;
  target: string;
  timeframe: string;
  notes: string;
  status: GoalStatus;
  createdAt: string;
  sourceProfileFingerprint: string | null;
  sourceModel: string | null;
  generationMode: ActionSuggestionResponse["generation_mode"] | null;
};

type SuggestionCache = {
  profileFingerprint: string;
  response: ActionSuggestionResponse;
  dismissedSuggestionIds: string[];
};

type ActionPlanStore = {
  version: 1;
  providerConsent: boolean;
  goals: StoredGoal[];
  suggestionCache: SuggestionCache | null;
};

type GoalForm = {
  title: string;
  target: string;
  timeframe: string;
  notes: string;
};

const STORAGE_KEY = "wiseage.actionPlan.v1";
const EMPTY_STORE: ActionPlanStore = {
  version: 1,
  providerConsent: false,
  goals: [],
  suggestionCache: null,
};
const EMPTY_GOAL_FORM: GoalForm = {
  title: "",
  target: "",
  timeframe: "4 weeks",
  notes: "",
};
const STATUS_LABELS: Record<GoalStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};
const STATUS_STYLES: Record<GoalStatus, string> = {
  not_started: "border-slate-400/30 bg-slate-400/10 text-slate-300",
  in_progress: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  completed: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
};
const STATUS_DOT_STYLES: Record<GoalStatus, string> = {
  not_started: "bg-slate-400",
  in_progress: "bg-sky-400",
  completed: "bg-emerald-400",
};
const STATUS_OPTION_STYLES: Record<
  GoalStatus,
  { backgroundColor: string; color: string }
> = {
  not_started: { backgroundColor: "#1e293b", color: "#e2e8f0" },
  in_progress: { backgroundColor: "#0c4a6e", color: "#e0f2fe" },
  completed: { backgroundColor: "#064e3b", color: "#d1fae5" },
};
function loadStore(): ActionPlanStore {
  if (typeof window === "undefined") return EMPTY_STORE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_STORE;
    const parsed = JSON.parse(raw) as Partial<ActionPlanStore>;
    if (parsed.version !== 1 || !Array.isArray(parsed.goals)) return EMPTY_STORE;
    return {
      version: 1,
      providerConsent: parsed.providerConsent === true,
      goals: parsed.goals,
      suggestionCache: parsed.suggestionCache ?? null,
    };
  } catch {
    return EMPTY_STORE;
  }
}

function profileIsReady(profile: ActionProfile) {
  return Boolean(
    profile.ageGroup &&
      profile.sex &&
      profile.ethnicity &&
      profile.state &&
      profile.activity &&
      profile.smoking &&
      profile.alcohol &&
      profile.diet &&
      profile.familyHistory
  );
}

function profileIsUnder20(ageGroup: string) {
  return ["0", "1-4", "5-9", "10-14", "15-19"].includes(ageGroup);
}

function fingerprintProfile(profile: ActionProfile, year: number) {
  const canonical = JSON.stringify({
    year,
    ageGroup: profile.ageGroup,
    sex: profile.sex,
    ethnicity: profile.ethnicity,
    state: profile.state,
    activity: profile.activity,
    smoking: profile.smoking,
    alcohol: profile.alcohol,
    diet: profile.diet,
    familyHistory: profile.familyHistory,
    sleepQuality: profile.sleepQuality || "Prefer not to say",
    stressLevel: profile.stressLevel || "Prefer not to say",
  });
  let first = 2166136261;
  let second = 2246822507;
  for (let index = 0; index < canonical.length; index += 1) {
    const code = canonical.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489909);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0)
    .toString(16)
    .padStart(8, "0")}`;
}

function newId() {
  if (typeof window.crypto?.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ActionPlanPage({
  profile,
  year,
  apiBaseUrl,
  hasInsights,
  onNavigate,
}: {
  profile: ActionProfile;
  year: number;
  apiBaseUrl: string;
  hasInsights: boolean;
  onNavigate: (screen: "profile" | "insights") => void;
}) {
  const [store, setStore] = useState<ActionPlanStore>(loadStore);
  const [loading, setLoading] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [storageError, setStorageError] = useState("");
  const [showDisclosure, setShowDisclosure] = useState(false);
  const [goalForm, setGoalForm] = useState<GoalForm>(EMPTY_GOAL_FORM);
  const [goalFormError, setGoalFormError] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [addMode, setAddMode] = useState<"suggestions" | "custom">("suggestions");

  const ready = profileIsReady(profile);
  const under20 = profileIsUnder20(profile.ageGroup);
  const currentFingerprint = ready ? fingerprintProfile(profile, year) : null;
  const activeCache =
    currentFingerprint && store.suggestionCache?.profileFingerprint === currentFingerprint
      ? store.suggestionCache
      : null;
  const visibleSuggestions =
    activeCache?.response.suggestions.filter(
      (suggestion) =>
        !activeCache.dismissedSuggestionIds.includes(suggestion.suggestion_id) &&
        !store.goals.some(
          (goal) =>
            goal.sourceSuggestionId === suggestion.suggestion_id ||
            (goal.source === "ai" &&
              goal.title.trim().toLocaleLowerCase() ===
                suggestion.title.trim().toLocaleLowerCase())
        )
    ) ?? [];
  const completedGoals = store.goals.filter((goal) => goal.status === "completed").length;

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      setStorageError("");
    } catch {
      setStorageError("This browser could not save your action plan locally.");
    }
  }, [store]);

  function updateStore(updater: (current: ActionPlanStore) => ActionPlanStore) {
    setStore((current) => updater(current));
  }

  async function requestSuggestions() {
    if (!ready || !currentFingerprint) {
      setRequestError("Create a complete profile before generating suggestions.");
      return;
    }
    setLoading(true);
    setRequestError("");
    try {
      const response = await fetch(`${apiBaseUrl}/api/v1/action-suggestions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year,
          age_group: profile.ageGroup,
          state: profile.state,
          sex: profile.sex,
          ethnicity: profile.ethnicity,
          activity: profile.activity,
          smoking: profile.smoking,
          alcohol: profile.alcohol,
          diet: profile.diet,
          family_history: profile.familyHistory,
          sleep_quality: profile.sleepQuality || "Prefer not to say",
          stress_level: profile.stressLevel || "Prefer not to say",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Suggestion requests are temporarily limited. Please try again in a few minutes.");
        }
        const detail = Array.isArray(payload?.detail)
          ? payload.detail.map((item: { msg?: string }) => item.msg).join(" ")
          : payload?.detail;
        throw new Error(detail || `The suggestion service returned HTTP ${response.status}.`);
      }
      if (!payload || !Array.isArray(payload.suggestions)) {
        throw new Error("The suggestion service returned an unexpected response.");
      }
      const suggestionResponse = payload as ActionSuggestionResponse;
      updateStore((current) => ({
        ...current,
        suggestionCache: {
          profileFingerprint: currentFingerprint,
          response: suggestionResponse,
          dismissedSuggestionIds: [],
        },
      }));
    } catch (error) {
      setRequestError(
        error instanceof TypeError
          ? `Could not reach the suggestion service at ${apiBaseUrl}. Make sure the API is running, then try again.`
          : error instanceof Error
            ? error.message
            : "Unable to generate suggestions."
      );
    } finally {
      setLoading(false);
    }
  }

  function beginSuggestionRequest() {
    if (!ready) {
      onNavigate("profile");
      return;
    }
    if (!under20 && !store.providerConsent) {
      setShowDisclosure(true);
      return;
    }
    void requestSuggestions();
  }

  function acceptDisclosure() {
    updateStore((current) => ({ ...current, providerConsent: true }));
    setShowDisclosure(false);
    void requestSuggestions();
  }

  function addSuggestion(suggestion: ActionSuggestion) {
    if (!activeCache || !currentFingerprint) return;
    const alreadyAdded = store.goals.some(
      (goal) =>
        goal.sourceSuggestionId === suggestion.suggestion_id ||
        (goal.source === "ai" &&
          goal.title.trim().toLocaleLowerCase() ===
            suggestion.title.trim().toLocaleLowerCase())
    );
    if (alreadyAdded) return;
    const supportNote = suggestion.professional_support_note
      ? `\n\nProfessional support: ${suggestion.professional_support_note}`
      : "";
    const goal: StoredGoal = {
      id: newId(),
      source: "ai",
      sourceSuggestionId: suggestion.suggestion_id,
      title: suggestion.title,
      target: suggestion.target,
      timeframe: `${suggestion.timeframe_weeks} weeks`,
      notes: `${suggestion.action}\n\nWhy suggested: ${suggestion.rationale}${supportNote}`,
      status: "not_started",
      createdAt: new Date().toISOString(),
      sourceProfileFingerprint: currentFingerprint,
      sourceModel: activeCache.response.model,
      generationMode: activeCache.response.generation_mode,
    };
    updateStore((current) => ({
      ...current,
      goals: [goal, ...current.goals],
      suggestionCache: current.suggestionCache
        ? {
            ...current.suggestionCache,
            dismissedSuggestionIds: [
              ...new Set([
                ...current.suggestionCache.dismissedSuggestionIds,
                suggestion.suggestion_id,
              ]),
            ],
          }
        : null,
    }));
  }

  function dismissSuggestion(suggestionId: string) {
    updateStore((current) => {
      if (!current.suggestionCache) return current;
      return {
        ...current,
        suggestionCache: {
          ...current.suggestionCache,
          dismissedSuggestionIds: [
            ...new Set([
              ...current.suggestionCache.dismissedSuggestionIds,
              suggestionId,
            ]),
          ],
        },
      };
    });
  }

  function submitGoal(event: FormEvent) {
    event.preventDefault();
    if (!goalForm.title.trim() || !goalForm.target.trim()) {
      setGoalFormError("Add a goal title and measurable target.");
      return;
    }
    if (editingGoalId) {
      updateStore((current) => ({
        ...current,
        goals: current.goals.map((goal) =>
          goal.id === editingGoalId
            ? {
                ...goal,
                title: goalForm.title.trim(),
                target: goalForm.target.trim(),
                timeframe: goalForm.timeframe,
                notes: goalForm.notes.trim(),
              }
            : goal
        ),
      }));
    } else {
      const goal: StoredGoal = {
        id: newId(),
        source: "user",
        sourceSuggestionId: null,
        title: goalForm.title.trim(),
        target: goalForm.target.trim(),
        timeframe: goalForm.timeframe,
        notes: goalForm.notes.trim(),
        status: "not_started",
        createdAt: new Date().toISOString(),
        sourceProfileFingerprint: null,
        sourceModel: null,
        generationMode: null,
      };
      updateStore((current) => ({ ...current, goals: [goal, ...current.goals] }));
    }
    setEditingGoalId(null);
    setGoalForm(EMPTY_GOAL_FORM);
    setGoalFormError("");
  }

  function editGoal(goal: StoredGoal) {
    setAddMode("custom");
    setEditingGoalId(goal.id);
    setGoalForm({
      title: goal.title,
      target: goal.target,
      timeframe: goal.timeframe,
      notes: goal.notes,
    });
    setGoalFormError("");
    window.requestAnimationFrame(() => {
      document.getElementById("goal-form")?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function deleteGoal(goalId: string) {
    if (!window.confirm("Delete this goal from this device?")) return;
    updateStore((current) => ({
      ...current,
      goals: current.goals.filter((goal) => goal.id !== goalId),
    }));
  }

  function updateGoalStatus(goalId: string, status: GoalStatus) {
    updateStore((current) => ({
      ...current,
      goals: current.goals.map((goal) =>
        goal.id === goalId ? { ...goal, status } : goal
      ),
    }));
  }

  function clearSavedData() {
    if (!window.confirm("Clear all saved goals, suggestions, and AI consent from this device?")) {
      return;
    }
    window.localStorage.removeItem(STORAGE_KEY);
    setStore(EMPTY_STORE);
    setGoalForm(EMPTY_GOAL_FORM);
    setEditingGoalId(null);
    setRequestError("");
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-28">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-start">
          <div>
            <div
              className="mb-1 text-xs text-primary"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              DEVICE-LOCAL ACTION PLAN
            </div>
            <h1
              className="text-3xl font-bold text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Your action plan
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Choose optional suggestions or create your own goals. Your plan and
              statuses stay in this browser and are not saved to an account.
            </p>
          </div>
          <button
            onClick={() => onNavigate(hasInsights ? "insights" : "profile")}
            className="shrink-0 rounded-xl border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
          >
            {hasInsights ? "← Back to insights" : ready ? "Edit saved profile" : "Create a profile"}
          </button>
        </div>

        {storageError && (
          <div className="mb-5 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
            {storageError}
          </div>
        )}

        <section className="mb-6 rounded-2xl border border-border bg-card p-6">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs text-primary">
                <Target size={14} /> MY ACTION PLAN
              </div>
              <h2 className="text-lg font-semibold">Goals saved on this device</h2>
            </div>
            <div className="text-xs text-muted-foreground">
              {completedGoals} of {store.goals.length} completed
            </div>
          </div>

          {store.goals.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-secondary/40 px-4 py-8 text-center">
              <Target size={22} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">No goals added yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a suggestion or create your own goal below.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {store.goals.map((goal) => {
                const fromPreviousProfile = Boolean(
                  currentFingerprint &&
                    goal.source === "ai" &&
                    goal.sourceProfileFingerprint &&
                    goal.sourceProfileFingerprint !== currentFingerprint
                );
                return (
                  <article key={goal.id} className="rounded-xl border border-border bg-secondary/50 p-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-border bg-card px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {goal.source === "ai" ? "Suggested" : "My goal"}
                          </span>
                          {fromPreviousProfile && (
                            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] text-amber-300">
                              From a previous profile
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold">{goal.title}</h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Target: {goal.target} · {goal.timeframe}
                        </p>
                        {goal.notes && (
                          <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                            {goal.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <div className="relative">
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none absolute left-3 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full ${STATUS_DOT_STYLES[goal.status]}`}
                          />
                          <select
                            aria-label={`Status for ${goal.title}`}
                            value={goal.status}
                            onChange={(event) =>
                              updateGoalStatus(goal.id, event.target.value as GoalStatus)
                            }
                            style={{ colorScheme: "dark" }}
                            className={`appearance-none rounded-lg border py-2 pl-7 pr-8 text-xs font-medium transition-colors focus:border-primary/50 focus:outline-none ${STATUS_STYLES[goal.status]}`}
                          >
                            {(Object.keys(STATUS_LABELS) as GoalStatus[]).map((status) => (
                              <option
                                key={status}
                                value={status}
                                style={STATUS_OPTION_STYLES[status]}
                              >
                                {STATUS_LABELS[status]}
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={12}
                            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                          />
                        </div>
                        <button
                          type="button"
                          aria-label={`Edit ${goal.title}`}
                          onClick={() => editGoal(goal)}
                          className="rounded-lg border border-border p-2 text-muted-foreground hover:text-foreground"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${goal.title}`}
                          onClick={() => deleteGoal(goal.id)}
                          className="rounded-lg border border-border p-2 text-muted-foreground hover:border-red-400/30 hover:text-red-300"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <div className="flex flex-col">
          <div className="rounded-t-2xl border border-b-0 border-border bg-card px-6 pt-6">
            <div className="mb-1 text-xs text-primary">ADD TO YOUR PLAN</div>
            <h2 className="text-lg font-semibold">Choose how to add a goal</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Start from an optional suggestion or write a goal that suits you.
            </p>
            <div
              className="mt-5 grid grid-cols-2 gap-1 rounded-xl bg-secondary p-1"
              role="tablist"
              aria-label="Ways to add a goal"
            >
              <button
                id="suggestions-tab"
                type="button"
                role="tab"
                aria-controls="suggestions-panel"
                aria-selected={addMode === "suggestions"}
                onClick={() => setAddMode("suggestions")}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  addMode === "suggestions"
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles size={14} /> Suggested actions
              </button>
              <button
                id="custom-goal-tab"
                type="button"
                role="tab"
                aria-controls="goal-form"
                aria-selected={addMode === "custom"}
                onClick={() => setAddMode("custom")}
                className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                  addMode === "custom"
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Plus size={14} /> {editingGoalId ? "Edit goal" : "Create my own"}
              </button>
            </div>
          </div>

          {addMode === "suggestions" && (
          <section
            id="suggestions-panel"
            role="tabpanel"
            aria-labelledby="suggestions-tab"
            className="mb-6 rounded-b-2xl border border-t-0 border-border bg-card p-6"
          >
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <div className="mb-1 flex items-center gap-2 text-xs text-primary">
                <Sparkles size={14} /> SUGGESTED FOR YOU
              </div>
              <h2 className="text-lg font-semibold">Optional wellness actions</h2>
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
                Suggestions use your living-habit answers and clearly labelled
                population statistics. They do not estimate your personal risk.
              </p>
            </div>
            <button
              type="button"
              onClick={beginSuggestionRequest}
              disabled={loading}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : activeCache ? (
                <RefreshCw size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              {loading ? "Preparing…" : activeCache ? "Regenerate" : "Generate suggestions"}
            </button>
          </div>

          {!ready && (
            <div className="rounded-xl border border-border bg-secondary px-4 py-4 text-sm text-muted-foreground">
              Create a profile to generate suggestions. You can still create and manage
              your own goals below.
            </div>
          )}

          {showDisclosure && (
            <div
              className="mb-5 rounded-xl border border-primary/30 bg-primary/5 p-5"
              role="dialog"
              aria-labelledby="provider-disclosure-title"
            >
              <div className="mb-2 flex items-center gap-2">
                <Lock size={15} className="text-primary" />
                <h3 id="provider-disclosure-title" className="text-sm font-semibold">
                  Before using AI-assisted suggestions
                </h3>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Your age band, selected living habits, comparison-group label, and top
                five population cause counts will be processed by Groq. Your name,
                contact details, ethnicity-specific all-cause count, custom goals, and
                goal progress are not sent. You can cancel and create goals manually.
                Groq documents its inference data controls in its{" "}
                <a
                  href="https://console.groq.com/docs/your-data"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline underline-offset-2"
                >
                  data guide
                </a>
                .
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={acceptDisclosure}
                  className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Continue and generate
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisclosure(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {requestError && (
            <div className="mb-5 flex items-start gap-2 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-xs text-red-200">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {requestError}
            </div>
          )}

          {activeCache && (
            <>
              <div className="mb-4 rounded-xl border border-border bg-secondary px-4 py-3">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {activeCache.response.notice}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground opacity-70">
                  Context: {activeCache.response.comparison_group} · Mode: {activeCache.response.generation_mode.replace(/_/g, " ")}
                </p>
              </div>

              <div className="space-y-4">
                {visibleSuggestions.map((suggestion) => {
                  const alreadyAdded = store.goals.some(
                    (goal) =>
                      goal.sourceSuggestionId === suggestion.suggestion_id ||
                      (goal.source === "ai" &&
                        goal.title.trim().toLocaleLowerCase() ===
                          suggestion.title.trim().toLocaleLowerCase())
                  );
                  return (
                    <article
                      key={suggestion.suggestion_id}
                      className="rounded-2xl border border-border bg-secondary/50 p-5"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] uppercase text-muted-foreground">
                          {suggestion.category.replace(/_/g, " ")}
                        </span>
                      </div>
                      <h3 className="text-sm font-semibold text-foreground">
                        {suggestion.title}
                      </h3>
                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {suggestion.action}
                      </p>
                      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                        <div className="rounded-lg bg-card px-3 py-2">
                          <span className="text-muted-foreground">Target: </span>
                          <span className="font-medium text-foreground">{suggestion.target}</span>
                        </div>
                        <div className="rounded-lg bg-card px-3 py-2">
                          <span className="text-muted-foreground">Timeframe: </span>
                          <span className="font-medium text-foreground">
                            {suggestion.timeframe_weeks} weeks
                          </span>
                        </div>
                      </div>
                      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-medium text-foreground">Why suggested: </span>
                        {suggestion.rationale}
                      </p>
                      {suggestion.population_basis.length > 0 && (
                        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground opacity-80">
                          Population context: {suggestion.population_basis.join(", ")}. This
                          does not indicate your personal risk.
                        </p>
                      )}
                      {suggestion.professional_support_note && (
                        <div className="mt-3 flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-muted-foreground">
                          <Shield size={13} className="mt-0.5 shrink-0 text-primary" />
                          {suggestion.professional_support_note}
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={() => addSuggestion(suggestion)}
                          disabled={alreadyAdded}
                          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-default disabled:opacity-60"
                        >
                          {alreadyAdded ? <Check size={13} /> : <Plus size={13} />}
                          {alreadyAdded ? "Added to plan" : "Add to my plan"}
                        </button>
                        <button
                          type="button"
                          onClick={() => dismissSuggestion(suggestion.suggestion_id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          <X size={13} /> Dismiss
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {visibleSuggestions.length === 0 && (
                <div className="rounded-xl border border-border bg-secondary px-4 py-5 text-center text-xs text-muted-foreground">
                  All current suggestions were added or dismissed. You can regenerate a
                  new set when ready.
                </div>
              )}

              <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground opacity-70">
                {activeCache.response.disclaimer}
              </p>
            </>
          )}
          </section>
          )}

          {addMode === "custom" && (
          <section
            id="goal-form"
            role="tabpanel"
            aria-labelledby="custom-goal-tab"
            className="mb-6 rounded-b-2xl border border-t-0 border-border bg-card p-6"
          >
          <div className="mb-5">
            <div className="mb-1 flex items-center gap-2 text-xs text-primary">
              <Plus size={14} /> CREATE YOUR OWN GOAL
            </div>
            <h2 className="text-lg font-semibold">
              {editingGoalId ? "Edit goal" : "Add a goal"}
            </h2>
          </div>

          <form onSubmit={submitGoal} className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="goal-title" className="mb-2 block text-xs font-medium">
                Goal title
              </label>
              <input
                id="goal-title"
                maxLength={120}
                value={goalForm.title}
                onChange={(event) =>
                  setGoalForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Take a walk after lunch"
                className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="goal-target" className="mb-2 block text-xs font-medium">
                Measurable target
              </label>
              <input
                id="goal-target"
                maxLength={160}
                value={goalForm.target}
                onChange={(event) =>
                  setGoalForm((current) => ({ ...current, target: event.target.value }))
                }
                placeholder="20 minutes, 3 times per week"
                className="w-full rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="goal-timeframe" className="mb-2 block text-xs font-medium">
                Timeframe
              </label>
              <div className="relative">
                <select
                  id="goal-timeframe"
                  value={goalForm.timeframe}
                  onChange={(event) =>
                    setGoalForm((current) => ({ ...current, timeframe: event.target.value }))
                  }
                  className="w-full appearance-none rounded-xl border border-border bg-input-background px-4 py-3 pr-10 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                >
                  {["1 week", "2 weeks", "4 weeks", "8 weeks", "12 weeks", "Ongoing"].map(
                    (option) => (
                      <option key={option}>{option}</option>
                    )
                  )}
                </select>
                <ChevronDown
                  size={14}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
              </div>
            </div>
            <div>
              <label htmlFor="goal-notes" className="mb-2 block text-xs font-medium">
                Notes (optional)
              </label>
              <textarea
                id="goal-notes"
                maxLength={600}
                rows={3}
                value={goalForm.notes}
                onChange={(event) =>
                  setGoalForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Why this matters or how you plan to do it"
                className="w-full resize-none rounded-xl border border-border bg-input-background px-4 py-3 text-sm text-foreground focus:border-primary/50 focus:outline-none"
              />
            </div>

            {goalFormError && (
              <div className="rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-xs text-red-200 md:col-span-2">
                {goalFormError}
              </div>
            )}

            <div className="flex flex-wrap gap-3 md:col-span-2">
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground"
              >
                {editingGoalId ? <Check size={14} /> : <Plus size={14} />}
                {editingGoalId ? "Save changes" : "Add goal"}
              </button>
              {editingGoalId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingGoalId(null);
                    setGoalForm(EMPTY_GOAL_FORM);
                    setGoalFormError("");
                  }}
                  className="rounded-xl border border-border px-5 py-3 text-sm font-medium text-muted-foreground"
                >
                  Cancel edit
                </button>
              )}
            </div>
          </form>
          </section>
          )}
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-border bg-secondary p-5 sm:flex-row sm:items-center">
          <div className="flex items-start gap-3">
            <Shield size={16} className="mt-0.5 shrink-0 text-primary" />
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Goals are stored only in this browser. Clearing browser storage or using
              another device will not carry them across. This action plan is general
              information and does not replace professional care.
            </p>
          </div>
          <button
            type="button"
            onClick={clearSavedData}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-4 py-2 text-xs font-medium text-muted-foreground hover:border-red-400/30 hover:text-red-300"
          >
            <Trash2 size={13} /> Clear saved data
          </button>
        </div>
      </div>
    </div>
  );
}
