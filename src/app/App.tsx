import { useEffect, useState } from "react";
import {
  ActionPlanPage as DeviceActionPlanPage,
  type ActionProfile,
} from "./ActionPlanPage";
import {
  Activity,
  Heart,
  Brain,
  Shield,
  ArrowRight,
  ChevronRight,
  Check,
  Zap,
  TrendingUp,
  Users,
  BarChart2,
  Target,
  ChevronDown,
  Info,
} from "lucide-react";

type Screen =
  | "landing"
  | "profile"
  | "analysing"
  | "insights"
  | "action-plan";

type ProfileForm = ActionProfile;

type CauseStat = {
  display_rank: number;
  cause_of_death: string;
  death_count: number;
  percentage: number | null;
};

type ComparisonRow = {
  group: string;
  death_count: number;
  percentage: number | null;
};

type ComparisonView = {
  available: boolean;
  dimension_type: string;
  cause_of_death: string;
  selected_group: string | null;
  percentage_basis: string;
  scope_note: string;
  missing_groups: string[];
  rows: ComparisonRow[];
};

type InsightsResponse = {
  profile: {
    year: number;
    age_group: string;
    state: string;
    sex: string;
    ethnicity: string;
  };
  data_year: number;
  match: {
    dimension_type: string;
    comparison_group: string;
    matching_method: string;
    source_tables: string[];
    selected_cause: string;
    percentage_basis: string;
    causes: CauseStat[];
  };
  all_cause_context: {
    available: boolean;
    death_count: number | null;
    unit: string;
    is_age_specific: boolean;
    scope: string;
    matching_method: string;
    note: string;
  };
  comparisons: Record<"age" | "state" | "sex", ComparisonView>;
  comparisons_by_cause?: Record<
    string,
    Record<"age" | "state" | "sex", ComparisonView>
  >;
  source: string;
  limitations: string[];
  disclaimer: string;
};

type MetadataResponse = {
  years: number[];
  states: string[];
  age_groups: string[];
  sexes: string[];
  ethnicities: string[];
  primary_match_dimensions: string[];
  source: string;
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000").replace(/\/$/, "");
const EMPTY_PROFILE: ProfileForm = {
  ageGroup: "",
  sex: "",
  ethnicity: "",
  state: "",
  activity: "",
  smoking: "",
  alcohol: "",
  diet: "",
  familyHistory: "",
  sleepQuality: "",
  stressLevel: "",
};
const PROFILE_STORAGE_KEY = "wiseage.profile.v1";
const PROFILE_FIELDS: (keyof ProfileForm)[] = [
  "ageGroup",
  "sex",
  "ethnicity",
  "state",
  "activity",
  "smoking",
  "alcohol",
  "diet",
  "familyHistory",
  "sleepQuality",
  "stressLevel",
];

type StoredProfile = {
  version: 1;
  profile: ProfileForm;
  savedAt: string;
};

function loadSavedProfile(): StoredProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredProfile>;
    if (parsed.version !== 1 || !parsed.profile || typeof parsed.savedAt !== "string") {
      return null;
    }
    const profile = PROFILE_FIELDS.reduce<ProfileForm>(
      (result, field) => ({
        ...result,
        [field]: typeof parsed.profile?.[field] === "string" ? parsed.profile[field] : "",
      }),
      { ...EMPTY_PROFILE }
    );
    const requiredFields: (keyof ProfileForm)[] = [
      "ageGroup",
      "sex",
      "ethnicity",
      "state",
      "activity",
      "smoking",
      "alcohol",
      "diet",
      "familyHistory",
    ];
    if (!requiredFields.every((field) => profile[field])) return null;
    return { version: 1, profile, savedAt: parsed.savedAt };
  } catch {
    return null;
  }
}
const DEFAULT_METADATA: MetadataResponse = {
  years: [2024],
  states: [
    "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan",
    "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah",
    "Sarawak", "Selangor", "Terengganu", "W.P. Kuala Lumpur",
    "W.P. Labuan", "W.P. Putrajaya",
  ],
  age_groups: [
    "0", "1-4", "5-9", "10-14", "15-19", "20-24", "25-29",
    "30-34", "35-39", "40-44", "45-49", "50-54", "55-59",
    "60-64", "65-69", "70-74", "75-79", "80-84",
    "85 dan lebih 85 and over",
  ],
  sexes: ["Male", "Female", "Prefer not to say"],
  ethnicities: ["Malay", "Chinese", "Indian", "Other Bumiputera", "Other", "Prefer not to say"],
  primary_match_dimensions: ["state", "age_group"],
  source: "Department of Statistics Malaysia",
};

const CAUSE_COLORS = ["#ef4444", "#f59e0b", "#f59e0b", "#3b82f6", "#6b8099"];

function displayAgeGroup(ageGroup: string) {
  if (ageGroup === "0") return "Under 1";
  if (ageGroup === "85 dan lebih 85 and over") return "85 and over";
  return ageGroup.replace(/-/g, "–");
}

// ── Logo ─────────────────────────────────────────────────────────────
function LangkahSihatLogo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill="#00d4aa" fillOpacity="0.15" />
      <path
        d="M14 28 C14 28 18 20 24 20 C30 20 34 28 34 28"
        stroke="#00d4aa"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="24" cy="17" r="4" fill="#00d4aa" />
      <path
        d="M20 32 L22 29 L24 32 L26 27 L28 32"
        stroke="#00d4aa"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

// ── Shared Nav ────────────────────────────────────────────────────────
function Nav({
  onNavigate,
  current,
}: {
  onNavigate: (s: Screen) => void;
  current: Screen;
}) {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 border-b border-border bg-background/80 backdrop-blur-md">
      <button
        onClick={() => onNavigate("landing")}
        className="flex items-center gap-2.5 cursor-pointer"
      >
        <LangkahSihatLogo size={36} />
        <div>
          <div
            className="text-sm font-bold text-foreground"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            WiseAge Health
          </div>
        </div>
      </button>
      <div className="hidden md:flex items-center gap-1">
        {(
          [
            ["landing", "Home"],
            ["profile", "Profile"],
            ["insights", "Insights"],
            ["action-plan", "Action Plan"],
          ] as [Screen, string][]
        ).map(([screen, label]) => (
          <button
            key={screen}
            onClick={() => onNavigate(screen)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              current === screen
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            style={{ fontFamily: "'Inter', sans-serif" }}
          >
            {label}
          </button>
        ))}
      </div>
      <button
        onClick={() => onNavigate("profile")}
        className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
      >
        Get Started
      </button>
    </nav>
  );
}

// ── Landing Page ──────────────────────────────────────────────────────
function LandingPage({ onNavigate }: { onNavigate: (s: Screen) => void }) {
  const features = [
    {
      icon: Users,
      title: "Create your profile",
      desc: "Tell us your age group, ethnicity, state, and lifestyle habits in two quick steps.",
    },
    {
      icon: BarChart2,
      title: "Explore population-level health insights",
      desc: "See the leading causes of death for your demographic group, drawn from official DOSM data.",
    },
    {
      icon: Target,
      title: "Receive practical recommendations",
      desc: "Get straightforward, evidence-based actions you can start this week — no diagnosis, no alarm.",
    },
  ];

  const causePreview = [
    { name: "Ischaemic heart diseases", pct: 25, color: "#ef4444" },
    { name: "Pneumonia", pct: 16, color: "#f59e0b" },
    { name: "Diabetes mellitus", pct: 14, color: "#f59e0b" },
    { name: "Kidney failure", pct: 12, color: "#3b82f6" },
    { name: "Transport accidents", pct: 8, color: "#6b8099" },
  ];

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[700px] rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="max-w-6xl mx-auto grid md:grid-cols-2 gap-16 items-center relative">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 mb-6">
              <Shield size={12} className="text-primary" />
              <span
                className="text-xs text-primary font-medium"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                PREVENTIVE HEALTH · MALAYSIA
              </span>
            </div>
            <h1
              className="text-5xl md:text-6xl font-extrabold leading-tight mb-6 text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Understand your health context.{" "}
              <span className="text-primary">Take proactive steps.</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-8 max-w-md">
              Explore Malaysian mortality statistics based on your demographic profile and receive practical health actions — no diagnosis, no scaremongering.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => onNavigate("profile")}
                className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-all hover:scale-105"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Create my profile <ArrowRight size={16} />
              </button>
              <button
                onClick={() => onNavigate("insights")}
                className="flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
              >
                How it works
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-6 max-w-sm leading-relaxed">
              This tool provides population-level information and does not diagnose or predict individual health outcomes.
            </p>
          </div>

          {/* Sample insights preview card */}
          <div className="bg-card border border-border rounded-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div
                  className="text-xs text-primary mb-1"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  SAMPLE · ADULTS AGED 45–49 · SELANGOR
                </div>
                <div
                  className="text-base font-semibold text-foreground"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  Selected causes of death
                </div>
              </div>
              <span className="text-xs px-2 py-1 rounded-lg bg-secondary border border-border text-muted-foreground">
                Preview
              </span>
            </div>
            <div className="space-y-3 mb-5">
              {causePreview.map((c, i) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span
                    className="text-xs w-4 shrink-0 text-right"
                    style={{ color: c.color, fontFamily: "'DM Mono', monospace" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-foreground">{c.name}</span>
                      <span
                        className="text-xs font-semibold"
                        style={{ color: c.color, fontFamily: "'DM Mono', monospace" }}
                      >
                        {c.pct}%
                      </span>
                    </div>
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${(c.pct / 25) * 100}%`, background: c.color, opacity: 0.7 }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="pt-4 border-t border-border flex items-center justify-between">
              <div>
                <div
                  className="text-xs text-muted-foreground mb-0.5"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  LIVE INSIGHTS AVAILABLE AFTER PROFILE
                </div>
                <div
                  className="text-2xl font-extrabold text-foreground"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  —
                </div>
              </div>
              <div className="text-xs text-muted-foreground text-right max-w-[120px] leading-relaxed">
                Select your profile to load current DOSM values
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-6 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <div
              className="text-xs text-primary font-medium mb-3"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              HOW IT WORKS
            </div>
            <h2
              className="text-3xl md:text-4xl font-bold text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Three steps, practically useful
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <div
                key={f.title}
                className="p-6 rounded-2xl bg-card border border-border hover:border-primary/30 transition-colors group"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors shrink-0">
                    <f.icon size={18} className="text-primary" />
                  </div>
                  <span
                    className="text-xs text-primary font-medium"
                    style={{ fontFamily: "'DM Mono', monospace" }}
                  >
                    STEP 0{i + 1}
                  </span>
                </div>
                <h3
                  className="text-base font-semibold text-foreground mb-2"
                  style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                >
                  {f.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="py-20 px-6 bg-secondary/30 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <div
                className="text-xs text-primary font-medium mb-3"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                WHAT YOU GET
              </div>
              <h2
                className="text-3xl font-bold text-foreground mb-4"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Population context, not personal predictions
              </h2>
              <p className="text-muted-foreground leading-relaxed mb-6">
                WiseAge Health draws on the Department of Statistics Malaysia&apos;s cause-of-death data to show you what the health landscape looks like for people in your demographic group. You get context — not a verdict.
              </p>
              <div className="space-y-3">
                {[
                  "Leading causes of death for your age group and state",
                  "Side-by-side comparison across age, state, and sex",
                  "Practical preventive actions based on your lifestyle",
                  "No personal risk score, no alarming projections",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Check size={11} className="text-primary" />
                    </div>
                    <span className="text-sm text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-4">
              {[
                {
                  icon: Shield,
                  title: "Data from DOSM",
                  desc: "Statistics on Causes of Death, Malaysia 2024 — official government dataset.",
                },
                {
                  icon: Users,
                  title: "Built for Malaysians aged 40–60",
                  desc: "Designed around the demographic groups most represented in preventive-health decisions.",
                },
                {
                  icon: Heart,
                  title: "Not a medical device",
                  desc: "This is an educational decision-support tool. Always consult a healthcare professional for personal advice.",
                },
              ].map((card) => (
                <div key={card.title} className="flex gap-4 p-5 rounded-2xl bg-card border border-border">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <card.icon size={16} className="text-primary" />
                  </div>
                  <div>
                    <div
                      className="text-sm font-semibold text-foreground mb-1"
                      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
                    >
                      {card.title}
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6 border-t border-border text-center">
        <div className="max-w-xl mx-auto">
          <h2
            className="text-3xl md:text-4xl font-bold text-foreground mb-4"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Ready to understand your context?
          </h2>
          <p className="text-muted-foreground mb-8">
            Takes about two minutes. No account required. Your data is not stored.
          </p>
          <button
            onClick={() => onNavigate("profile")}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-lg hover:bg-primary/90 transition-all hover:scale-105"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            Create my profile <ArrowRight size={18} />
          </button>
          <div className="flex items-center justify-center gap-6 mt-8 text-xs text-muted-foreground">
            {["No account needed", "Takes 2 minutes", "Saved only on this device"].map((t) => (
              <div key={t} className="flex items-center gap-1.5">
                <Check size={12} className="text-primary" />
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}

// ── Personal Health Profile ────────────────────────────────────────────
function ProfilePage({
  initialProfile,
  metadata,
  onGenerate,
  hasSavedProfile,
  storageError,
  onClearSavedProfile,
}: {
  initialProfile: ProfileForm;
  metadata: MetadataResponse;
  onGenerate: (profile: ProfileForm) => void;
  hasSavedProfile: boolean;
  storageError: string;
  onClearSavedProfile: () => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileForm>(initialProfile);
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    setForm(initialProfile);
    setStep(0);
    setValidationMessage("");
  }, [initialProfile]);

  const steps = [
    {
      title: "Demographic Profile",
      subtitle: "Tell us about yourself so we can match you to the right comparison group.",
      fields: [
        {
          key: "ageGroup",
          label: "Age Group",
          type: "select",
          options: metadata.age_groups,
        },
        {
          key: "sex",
          label: "Sex",
          type: "select",
          options: metadata.sexes,
        },
        {
          key: "ethnicity",
          label: "Ethnicity",
          type: "select",
          options: metadata.ethnicities,
        },
        {
          key: "state",
          label: "State of Residence",
          type: "select",
          options: metadata.states,
        },
      ],
    },
    {
      title: "Lifestyle Information",
      subtitle: "This helps us provide relevant preventive-health recommendations.",
      fields: [
        {
          key: "activity",
          label: "Physical Activity",
          type: "select",
          options: ["Rarely", "Sometimes", "Regularly"],
        },
        {
          key: "smoking",
          label: "Smoking Status",
          type: "select",
          options: ["Current smoker", "Former smoker", "Non-smoker", "Prefer not to say"],
        },
        {
          key: "alcohol",
          label: "Alcohol Use",
          type: "select",
          options: ["None", "Occasionally", "Frequently", "Prefer not to say"],
        },
        {
          key: "diet",
          label: "Dietary Pattern",
          type: "select",
          options: ["Mostly balanced", "Mixed", "Often highly processed", "Prefer not to say"],
        },
        {
          key: "familyHistory",
          label: "Family History",
          type: "select",
          options: ["No known history", "Heart disease", "Diabetes", "Cancer", "Other", "Prefer not to say"],
        },
        {
          key: "sleepQuality",
          label: "Sleep Quality",
          type: "select",
          options: ["Poor", "Fair", "Good", "Prefer not to say"],
          optional: true,
        },
        {
          key: "stressLevel",
          label: "Stress Level",
          type: "select",
          options: ["Low", "Moderate", "High", "Prefer not to say"],
          optional: true,
        },
      ],
    },
  ];

  const currentStep = steps[step];
  const progress = ((step + 1) / steps.length) * 100;

  function update(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setValidationMessage("");
  }

  function handleNext() {
    const missingFields = currentStep.fields
      .filter(
        (field) =>
          !("optional" in field && field.optional) &&
          !form[field.key as keyof ProfileForm]
      )
      .map((field) => field.label);
    if (missingFields.length > 0) {
      setValidationMessage(`Please select: ${missingFields.join(", ")}.`);
      return;
    }
    if (step < steps.length - 1) setStep(step + 1);
    else onGenerate(form);
  }

  return (
    <div
      className="min-h-screen bg-background text-foreground flex flex-col"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="max-w-xl mx-auto w-full px-6 pt-32 pb-16 flex-1">
        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-xs text-muted-foreground"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              STEP {step + 1} OF {steps.length}
            </span>
            <span
              className="text-xs text-primary"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              {Math.round(progress)}%
            </span>
          </div>
          <div className="h-1 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex gap-2 mt-3">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className={`h-0.5 flex-1 rounded-full transition-colors ${i <= step ? "bg-primary" : "bg-border"}`}
              />
            ))}
          </div>
        </div>

        <div className="mb-8">
          <div
            className="text-xs text-primary mb-1"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            HEALTH PROFILE
          </div>
          <h2
            className="text-2xl font-bold text-foreground mb-1"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {currentStep.title}
          </h2>
          <p className="text-sm text-muted-foreground">{currentStep.subtitle}</p>
        </div>

        <div className="space-y-5">
          {currentStep.fields.map((field) => (
            <div key={field.key}>
              <label className="block text-sm font-medium text-foreground mb-2">
                {field.label}
                {"optional" in field && field.optional && (
                  <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
                )}
              </label>
              <div className="relative">
                <select
                  value={form[field.key as keyof typeof form]}
                  onChange={(e) => update(field.key, e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-input-background border border-border text-foreground text-sm appearance-none focus:outline-none focus:border-primary/50 transition-colors"
                >
                  <option value="" className="bg-card">
                    Select an option
                  </option>
                  {field.options.map((o) => (
                    <option key={o} value={o} className="bg-card">
                      {field.key === "ageGroup" ? displayAgeGroup(o) : o}
                    </option>
                  ))}
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
                />
              </div>
            </div>
          ))}
        </div>

        {validationMessage && (
          <div className="mt-4 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-xs text-red-200">
            {validationMessage}
          </div>
        )}

        {storageError && (
          <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs text-amber-200">
            {storageError}
          </div>
        )}

        <div className="flex gap-3 mt-8">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 py-3.5 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors font-medium"
            >
              Back
            </button>
          )}
          <button
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {step < steps.length - 1 ? (
              <>
                Continue <ChevronRight size={16} />
              </>
            ) : (
              <>
                Generate My Insights <Zap size={16} />
              </>
            )}
          </button>
        </div>

        <div className="mt-6 flex items-start gap-2 p-4 rounded-xl bg-secondary border border-border">
          <Shield size={14} className="text-primary mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            {step === 0
              ? "Your submitted profile is saved only in this browser so it is available after a refresh. The API and PostgreSQL do not store it."
              : "This tool provides population-level information and does not diagnose or predict individual health outcomes. Consult a healthcare professional for personal advice."}
          </p>
        </div>
        {hasSavedProfile && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
            <span className="text-xs text-muted-foreground">A profile is saved on this device.</span>
            <button
              type="button"
              onClick={onClearSavedProfile}
              className="shrink-0 text-xs font-medium text-red-300 transition-colors hover:text-red-200"
            >
              Clear saved profile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Analysing Profile ─────────────────────────────────────────────────
function AnalysingPage({
  error,
  onRetry,
  onNavigate,
}: {
  error: string;
  onRetry: () => void;
  onNavigate: (s: Screen) => void;
}) {
  const progress = error ? 100 : 62;
  const currentTask = error ? 5 : 2;

  const tasks = [
    { label: "Reading demographic profile", icon: Users },
    { label: "Matching comparison group", icon: Activity },
    { label: "Loading DOSM mortality dataset", icon: BarChart2 },
    { label: "Identifying top causes of death", icon: TrendingUp },
    { label: "Calculating population statistics", icon: Brain },
    { label: "Preparing preventive recommendations", icon: Target },
  ];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {/* Pulsing orb */}
        <div className="relative mx-auto mb-10 w-32 h-32">
          <div className="absolute inset-0 rounded-full bg-primary/10 animate-ping" />
          <div className="absolute inset-4 rounded-full bg-primary/20 animate-pulse" />
          <div className="absolute inset-8 rounded-full bg-primary/40 flex items-center justify-center">
            <Brain size={24} className="text-primary" />
          </div>
        </div>

        <div
          className="text-xs text-primary mb-3"
          style={{ fontFamily: "'DM Mono', monospace" }}
        >
          MATCHING PROFILE
        </div>
        <h2
          className="text-2xl font-bold text-foreground mb-2"
          style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
        >
          {error ? "We could not load your mortality insights" : "Matching your profile with Malaysian mortality data…"}
        </h2>
        <p className="text-sm text-muted-foreground mb-10">
          {error || "We are querying the Department of Statistics Malaysia dataset and preparing the supported comparison views."}
        </p>

        {/* Progress bar */}
        <div className="mb-6">
          <div className="flex justify-between text-xs mb-2">
            <span
              className="text-muted-foreground"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              PROGRESS
            </span>
            <span
              className="text-primary font-medium"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              {progress}%
            </span>
          </div>
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Tasks */}
        <div className="space-y-3 text-left">
          {tasks.map((task, i) => {
            const done = i < currentTask;
            const active = i === currentTask;
            return (
              <div
                key={task.label}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  active
                    ? "bg-primary/10 border border-primary/20"
                    : done
                      ? "opacity-50"
                      : "opacity-25"
                }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                    done
                      ? "bg-primary/20"
                      : active
                        ? "bg-primary/30 animate-pulse"
                        : "bg-secondary"
                  }`}
                >
                  {done ? (
                    <Check size={12} className="text-primary" />
                  ) : (
                    <task.icon
                      size={12}
                      className={active ? "text-primary" : "text-muted-foreground"}
                    />
                  )}
                </div>
                <span
                  className={`text-sm ${active ? "text-foreground font-medium" : "text-muted-foreground"}`}
                >
                  {task.label}
                </span>
                {active && (
                  <div className="ml-auto flex gap-0.5">
                    {[0, 1, 2].map((d) => (
                      <div
                        key={d}
                        className="w-1 h-1 rounded-full bg-primary animate-bounce"
                        style={{ animationDelay: `${d * 0.15}s` }}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {error ? (
          <div className="mt-8 flex gap-3">
            <button
              onClick={onRetry}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
            <button
              onClick={() => onNavigate("profile")}
              className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Edit profile
            </button>
          </div>
        ) : (
          <p className="mt-6 text-xs text-muted-foreground">Waiting for the API response…</p>
        )}
      </div>
    </div>
  );
}

// ── Health Insights ───────────────────────────────────────────────────
function InsightsPage({
  data,
  onNavigate,
}: {
  data: InsightsResponse | null;
  onNavigate: (s: Screen) => void;
}) {
  const [compareView, setCompareView] = useState<"age" | "state" | "sex">("age");
  const [compareCause, setCompareCause] = useState<string | null>(null);
  const [showDataNote, setShowDataNote] = useState(false);

  if (!data) {
    return (
      <div className="min-h-screen bg-background px-6 pt-36 text-center">
        <h1 className="text-2xl font-bold text-foreground">Create a profile to view insights</h1>
        <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
          Submit a profile first so the API can load the supported Malaysian population comparison group.
        </p>
        <button
          onClick={() => onNavigate("profile")}
          className="mt-6 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
        >
          Create profile
        </button>
      </div>
    );
  }

  const causes = data.match.causes.map((cause, index) => ({
    ...cause,
    color: CAUSE_COLORS[index % CAUSE_COLORS.length],
  }));
  const maxCount = causes[0]?.death_count ?? 1;
  const activeCause =
    compareCause && data.comparisons_by_cause?.[compareCause]
      ? compareCause
      : data.match.selected_cause;
  const comparison =
    data.comparisons_by_cause?.[activeCause]?.[compareView] ??
    data.comparisons[compareView];
  const compareData = comparison.rows;
  const compareMax = Math.max(...compareData.map((row) => row.death_count), 1);

  return (
    <div
      className="min-h-screen bg-background text-foreground"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      <div className="max-w-4xl mx-auto px-6 pt-28 pb-16">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span
                className="text-xs text-primary font-medium"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                BASED ON YOUR SELECTED COMPARISON GROUP
              </span>
            </div>
            <h1
              className="text-3xl font-bold text-foreground"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              Your health insights
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Population-level mortality patterns · {data.data_year}
            </p>
          </div>
          <button
            onClick={() => onNavigate("profile")}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-primary/30 text-sm font-medium transition-colors shrink-0"
          >
            Edit profile
          </button>
        </div>

        {/* Comparison group summary card */}
        <div className="bg-card border border-primary/20 rounded-2xl p-6 mb-6">
          <div
            className="text-xs text-primary mb-2"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            YOUR COMPARISON GROUP
          </div>
          <div
            className="text-xl font-bold text-foreground mb-2"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {data.match.comparison_group}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {data.disclaimer} {data.match.matching_method === "national_age_fallback" && "This result uses the Malaysia-wide age category because the selected state/age category was unavailable."}
          </p>
          <div className="flex flex-wrap gap-3 mt-4">
            {[
              { label: "Age Group", value: displayAgeGroup(data.profile.age_group) },
              { label: "State", value: data.profile.state },
              { label: "Sex", value: data.profile.sex },
              { label: "Ethnicity", value: data.profile.ethnicity },
            ].map((item) => (
              <div key={item.label} className="px-3 py-1.5 rounded-lg bg-secondary border border-border">
                <span className="text-xs text-muted-foreground">{item.label}: </span>
                <span className="text-xs font-medium text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Total deaths stat card */}
        <div className="grid md:grid-cols-3 gap-5 mb-6">
          <div className="bg-card border border-border rounded-2xl p-6 flex flex-col justify-center">
            <div className="flex items-center gap-2 mb-3">
              <div
                className="text-xs text-muted-foreground"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                ALL-CAUSE CONTEXT
              </div>
              <button
                onClick={() => setShowDataNote(!showDataNote)}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <Info size={13} />
              </button>
            </div>
            <div
              className="text-5xl font-extrabold text-foreground mb-1"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
            >
              {data.all_cause_context.available && data.all_cause_context.death_count !== null
                ? data.all_cause_context.death_count.toLocaleString()
                : "—"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.all_cause_context.available
                ? `${data.all_cause_context.scope} · ${data.data_year} · not age-specific`
                : "Unavailable for this profile"}
            </p>
            {showDataNote && (
              <div className="mt-3 p-3 rounded-lg bg-secondary border border-border text-xs text-muted-foreground leading-relaxed">
                {data.all_cause_context.note} It is not an age-specific count and is not a personal risk figure.
              </div>
            )}
          </div>

          <div className="md:col-span-2 bg-card border border-border rounded-2xl p-6">
            <div
              className="text-xs text-muted-foreground mb-1"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              LEADING CAUSES
            </div>
            <p className="text-xs text-muted-foreground mb-4 opacity-60">Live values from the selected DOSM comparison group</p>
            <div className="flex flex-wrap gap-3">
              {causes.slice(0, 3).map((item) => (
                <div key={item.cause_of_death} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary">
                  <Activity size={13} style={{ color: item.color }} />
                  <span className="text-xs text-foreground font-medium">{item.cause_of_death}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top causes of death */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div
                className="text-xs text-muted-foreground mb-1"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                SELECTED CAUSES OF DEATH
              </div>
              <h2
                className="text-lg font-semibold text-foreground"
                style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
              >
                Selected causes for this group
              </h2>
            </div>
            <span className="text-xs text-muted-foreground px-2 py-1 rounded-lg bg-secondary border border-border">
              Live API data
            </span>
          </div>
          <div className="space-y-4">
            {causes.map((cause) => (
              <div key={cause.cause_of_death} className="flex items-center gap-4">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                  style={{ background: `${cause.color}18`, color: cause.color, fontFamily: "'DM Mono', monospace" }}
                >
                  {cause.display_rank}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-foreground truncate pr-4">{cause.cause_of_death}</span>
                    <span
                      className="shrink-0 text-xs font-semibold"
                      style={{ color: cause.color, fontFamily: "'DM Mono', monospace" }}
                    >
                      {cause.death_count.toLocaleString()} deaths
                    </span>
                  </div>
                  <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${(cause.death_count / maxCount) * 100}%`, background: cause.color }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Comparison section */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-6">
          <div
            className="text-xs text-muted-foreground mb-4"
            style={{ fontFamily: "'DM Mono', monospace" }}
          >
            COMPARISON VIEW
          </div>
          <div className="mb-5 max-w-md">
            <label
              htmlFor="comparison-cause"
              className="mb-2 block text-[11px] text-muted-foreground"
              style={{ fontFamily: "'DM Mono', monospace" }}
            >
              SELECT A CAUSE
            </label>
            <div className="relative">
              <select
                id="comparison-cause"
                value={activeCause}
                onChange={(event) => setCompareCause(event.target.value)}
                className="w-full appearance-none rounded-xl border border-border bg-secondary px-4 py-3 pr-10 text-sm font-medium text-foreground transition-colors focus:border-primary/50 focus:outline-none"
              >
                {causes.map((cause) => (
                  <option key={cause.cause_of_death} value={cause.cause_of_death}>
                    {cause.cause_of_death}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </div>
          <div className="flex gap-1 p-1 bg-secondary rounded-xl mb-6 w-fit">
            {(["age", "state", "sex"] as const).map((view) => (
              <button
                key={view}
                onClick={() => setCompareView(view)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  compareView === view
                    ? "bg-card text-foreground shadow"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {view === "age" ? "By Age Group" : view === "state" ? "By State" : "By Sex"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mb-4 italic">
            {comparison.scope_note} Cause: {comparison.cause_of_death}.
          </p>
          {!comparison.available && (
            <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-xs leading-relaxed text-amber-100">
              A complete comparison is unavailable. Missing groups: {comparison.missing_groups.length > 0 ? comparison.missing_groups.join(", ") : "not reported by the source"}. Missing records have not been treated as zero.
            </div>
          )}
          {compareData.length > 0 ? (
            <div className="space-y-3">
              {compareData.map((row) => (
              <div key={row.group} className="flex items-center gap-4">
                <div
                  className="text-xs text-muted-foreground w-20 shrink-0 text-right"
                  style={{ fontFamily: "'DM Mono', monospace" }}
                >
                  {compareView === "age" ? displayAgeGroup(row.group) : row.group}
                </div>
                <div className="flex-1 h-6 bg-secondary rounded-lg overflow-hidden relative">
                  <div
                    className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                    style={{
                      width: `${(row.death_count / compareMax) * 100}%`,
                      background: row.group === comparison.selected_group
                        ? "#00d4aa"
                        : "rgba(0,212,170,0.25)",
                    }}
                  >
                    <span
                      className="text-xs font-semibold"
                      style={{
                        color: row.group === comparison.selected_group
                          ? "#080d12"
                          : "#00d4aa",
                        fontFamily: "'DM Mono', monospace",
                      }}
                    >
                      {row.death_count.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-secondary px-4 py-6 text-center text-xs text-muted-foreground">
              This comparison is not reported for the selected cause and profile.
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-4 opacity-60">
            Recorded deaths for {comparison.cause_of_death} · {data.data_year}
          </p>
        </div>

        {/* Data source panel */}
        <div className="bg-secondary border border-border rounded-2xl p-5 mb-8">
          <div className="flex items-start gap-3">
            <Shield size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="flex-1">
              <div
                className="text-xs font-semibold text-foreground mb-1"
                style={{ fontFamily: "'DM Mono', monospace" }}
              >
                DATA SOURCE
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed mb-2">
                {data.source} Last available dataset year: {data.data_year}.
              </p>
              <div className="space-y-1 text-xs text-muted-foreground">
                {data.limitations.map((limitation) => (
                  <p key={limitation}>• {limitation}</p>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <button
            onClick={() => onNavigate("action-plan")}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-primary text-primary-foreground font-semibold text-base hover:bg-primary/90 transition-all hover:scale-105"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            See my recommended actions <ArrowRight size={16} />
          </button>
          <p className="text-xs text-muted-foreground mt-3">
            Suggestions based on lifestyle information and general preventive-health guidance.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [initialStoredProfile] = useState<StoredProfile | null>(loadSavedProfile);
  const [screen, setScreen] = useState<Screen>("landing");
  const [profile, setProfile] = useState<ProfileForm>(
    initialStoredProfile?.profile ?? EMPTY_PROFILE
  );
  const [profileSavedAt, setProfileSavedAt] = useState<string | null>(
    initialStoredProfile?.savedAt ?? null
  );
  const [profileStorageError, setProfileStorageError] = useState("");
  const [insights, setInsights] = useState<InsightsResponse | null>(null);
  const [insightsError, setInsightsError] = useState("");
  const [metadata, setMetadata] = useState<MetadataResponse>(DEFAULT_METADATA);

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/metadata`);
        if (!response.ok) return;
        const payload = await response.json() as MetadataResponse;
        if (!cancelled && payload.states.length > 0 && payload.age_groups.length > 0) {
          setMetadata(payload);
        }
      } catch {
        // The built-in supported values keep the profile usable while the API is offline.
      }
    }

    loadMetadata();
    return () => {
      cancelled = true;
    };
  }, []);

  function navigate(s: Screen) {
    setScreen(s);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function generateInsights(nextProfile: ProfileForm) {
    setProfile(nextProfile);
    const savedAt = new Date().toISOString();
    try {
      const storedProfile: StoredProfile = {
        version: 1,
        profile: nextProfile,
        savedAt,
      };
      window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(storedProfile));
      setProfileSavedAt(savedAt);
      setProfileStorageError("");
    } catch {
      setProfileStorageError("This browser could not save your profile on this device.");
    }
    setInsights(null);
    setInsightsError("");
    setScreen("analysing");
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/insights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: metadata.years[0] ?? 2024,
          age_group: nextProfile.ageGroup,
          state: nextProfile.state,
          sex: nextProfile.sex,
          ethnicity: nextProfile.ethnicity,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = Array.isArray(payload?.detail)
          ? payload.detail.map((item: { msg?: string }) => item.msg).join(" ")
          : payload?.detail;
        throw new Error(detail || `The insights service returned HTTP ${response.status}.`);
      }
      setInsights(payload as InsightsResponse);
      setScreen("insights");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setInsightsError(error instanceof Error ? error.message : "Unable to load insights.");
    }
  }

  function clearSavedProfile() {
    try {
      window.localStorage.removeItem(PROFILE_STORAGE_KEY);
      setProfileStorageError("");
    } catch {
      setProfileStorageError("This browser could not remove the saved profile.");
    }
    setProfile({ ...EMPTY_PROFILE });
    setProfileSavedAt(null);
    setInsights(null);
  }

  return (
    <div className="min-h-screen bg-background" style={{ scrollbarWidth: "none" }}>
      <style>{`
        ::-webkit-scrollbar { display: none; }
        * { font-family: 'Inter', sans-serif; }
      `}</style>
      <Nav onNavigate={navigate} current={screen} />
      {screen === "landing" && <LandingPage onNavigate={navigate} />}
      {screen === "profile" && (
        <ProfilePage
          initialProfile={profile}
          metadata={metadata}
          onGenerate={generateInsights}
          hasSavedProfile={profileSavedAt !== null}
          storageError={profileStorageError}
          onClearSavedProfile={clearSavedProfile}
        />
      )}
      {screen === "analysing" && (
        <AnalysingPage
          error={insightsError}
          onRetry={() => generateInsights(profile)}
          onNavigate={navigate}
        />
      )}
      {screen === "insights" && <InsightsPage data={insights} onNavigate={navigate} />}
      {screen === "action-plan" && (
        <DeviceActionPlanPage
          profile={profile}
          year={metadata.years[0] ?? 2024}
          apiBaseUrl={API_BASE_URL}
          hasInsights={insights !== null}
          onNavigate={navigate}
        />
      )}
    </div>
  );
}
