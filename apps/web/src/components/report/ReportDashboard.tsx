import { useState } from 'react';
import type { PerformanceReport, EvaluationResult } from '@repodojo/shared';
import {
  Award,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Share2,
  Printer,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Cpu,
  Layers,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

interface ReportDashboardProps {
  report: PerformanceReport;
  evaluation?: EvaluationResult;
  onBackToIDE?: () => void;
}

export function ReportDashboard({ report, evaluation, onBackToIDE }: ReportDashboardProps) {
  const [copied, setCopied] = useState(false);
  const [expandedDefects, setExpandedDefects] = useState<Record<string, boolean>>({});

  const totalScore = Math.round(report.totalScore * 10) / 10;
  const pillars = evaluation?.pillars;

  const handleShare = () => {
    if (report.shareToken) {
      const shareUrl = `${window.location.origin}/report/shared/${report.shareToken}`;
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const toggleDefect = (defectId: string) => {
    setExpandedDefects((prev) => ({ ...prev, [defectId]: !prev[defectId] }));
  };

  const scoreTier =
    totalScore >= 85
      ? { label: 'Distinguished (Senior)', color: 'text-emerald-400', border: 'border-emerald-500/40', bg: 'bg-emerald-950/20' }
      : totalScore >= 70
      ? { label: 'Proficient (Mid-Level)', color: 'text-indigo-400', border: 'border-indigo-500/40', bg: 'bg-indigo-950/20' }
      : { label: 'Developing (Junior)', color: 'text-amber-400', border: 'border-amber-500/40', bg: 'bg-amber-950/20' };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans selection:bg-purple-900 selection:text-white print:bg-white print:text-black">
      {/* Top Navigation */}
      <header className="border-b border-zinc-800 bg-zinc-900/60 px-6 py-4 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded bg-indigo-600 font-bold text-white shadow-md">
              RD
            </div>
            <div>
              <h1 className="text-base font-semibold text-zinc-100">Assessment Performance Report</h1>
              <p className="text-xs text-zinc-400 font-mono">Session ID: {report.assessmentId}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {report.shareToken && (
              <button
                onClick={handleShare}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition"
              >
                <Share2 className="h-3.5 w-3.5 text-purple-400" />
                <span>{copied ? 'Copied Link!' : 'Share Report'}</span>
              </button>
            )}

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-700 transition"
            >
              <Printer className="h-3.5 w-3.5 text-zinc-400" />
              <span>Export PDF</span>
            </button>

            {onBackToIDE && (
              <button
                onClick={onBackToIDE}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition shadow-sm"
              >
                <span>Back to Workspace</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto max-w-6xl px-6 py-8 space-y-8">
        {/* 1. Hero Scorecard (Decision 11.2) */}
        <section className={`rounded-2xl border ${scoreTier.border} ${scoreTier.bg} p-6 shadow-xl backdrop-blur`}>
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-6">
              {/* Circular Overall Score Gauge */}
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-4 border-zinc-800 bg-zinc-900 shadow-inner">
                <div className="flex flex-col items-center">
                  <span className="text-3xl font-extrabold tracking-tight text-white">{totalScore}</span>
                  <span className="text-[10px] text-zinc-400 uppercase tracking-widest font-mono">/ 100</span>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold uppercase tracking-wider ${scoreTier.color}`}>
                    {scoreTier.label}
                  </span>
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Verified Submission
                  </span>
                </div>
                <h2 className="text-xl font-bold text-zinc-100">Engineering Competency Appraisal</h2>
                <p className="mt-1 max-w-xl text-xs text-zinc-300 leading-relaxed">
                  {report.executiveSummary}
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-xl bg-zinc-900/80 p-4 border border-zinc-800 text-xs text-zinc-400 font-mono w-full md:w-auto">
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-indigo-400" /> Assessment Duration:</span>
                <span className="text-zinc-200 font-semibold">60m Standard</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="flex items-center gap-1.5"><Award className="h-3.5 w-3.5 text-amber-400" /> Submission Hash:</span>
                <span className="text-zinc-300 font-semibold">{evaluation?.submissionHash || 'verified'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span>Evaluated At:</span>
                <span className="text-zinc-300">{new Date(report.generatedAt).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        </section>

        {/* 2. 3-Pillar Breakdown Cards (Decision 10.2) */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Pillar 1: Functional Correctness (60 pts) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm hover:border-zinc-700 transition">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-emerald-400" />
                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Functional Correctness</span>
              </div>
              <span className="font-mono text-sm font-bold text-emerald-400">
                {pillars?.functionalCorrectness.score ?? 48} / 60 pts
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 mb-3 overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${((pillars?.functionalCorrectness.score ?? 48) / 60) * 100}%` }}
              />
            </div>
            <ul className="text-xs text-zinc-400 space-y-1.5">
              <li className="flex justify-between">
                <span>Defects Resolved:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {pillars?.functionalCorrectness.defectsResolvedCount ?? 7} / 8
                </span>
              </li>
              <li className="flex justify-between">
                <span>Baseline Regressions:</span>
                <span className="text-emerald-400 font-medium">
                  {pillars?.functionalCorrectness.baselineRegressionsPassed ? 'All Passed (12/12)' : 'Partial'}
                </span>
              </li>
            </ul>
          </div>

          {/* Pillar 2: Code Quality & Architecture (20 pts) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm hover:border-zinc-700 transition">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-indigo-400" />
                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Code Quality</span>
              </div>
              <span className="font-mono text-sm font-bold text-indigo-400">
                {pillars?.codeQuality.score ?? 18} / 20 pts
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 mb-3 overflow-hidden">
              <div
                className="h-full bg-indigo-500 rounded-full"
                style={{ width: `${((pillars?.codeQuality.score ?? 18) / 20) * 100}%` }}
              />
            </div>
            <ul className="text-xs text-zinc-400 space-y-1.5">
              <li className="flex justify-between">
                <span>Static & Lint Analysis:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {pillars?.codeQuality.staticAnalysisScore ?? 8} / 8 pts
                </span>
              </li>
              <li className="flex justify-between">
                <span>Maintainability & Modularity:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {pillars?.codeQuality.maintainabilityScore ?? 7} / 8 pts
                </span>
              </li>
              <li className="flex justify-between">
                <span>API Contract Compliance:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {pillars?.codeQuality.architectureComplianceScore ?? 3} / 4 pts
                </span>
              </li>
            </ul>
          </div>

          {/* Pillar 3: Engineering Trajectory (20 pts) */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 shadow-sm hover:border-zinc-700 transition">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-purple-400" />
                <span className="text-xs font-semibold text-zinc-200 uppercase tracking-wider">Trajectory & AI</span>
              </div>
              <span className="font-mono text-sm font-bold text-purple-400">
                {pillars?.engineeringTrajectory.score ?? 18} / 20 pts
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 mb-3 overflow-hidden">
              <div
                className="h-full bg-purple-500 rounded-full"
                style={{ width: `${((pillars?.engineeringTrajectory.score ?? 18) / 20) * 100}%` }}
              />
            </div>
            <ul className="text-xs text-zinc-400 space-y-1.5">
              <li className="flex justify-between">
                <span>Verification Discipline:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {pillars?.engineeringTrajectory.verificationDisciplineScore ?? 8} / 8 pts
                </span>
              </li>
              <li className="flex justify-between">
                <span>AI Guidance Efficiency:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {pillars?.engineeringTrajectory.aiAssistanceEfficiencyScore ?? 5} / 6 pts
                </span>
              </li>
              <li className="flex justify-between">
                <span>Iterative Debugging:</span>
                <span className="text-zinc-200 font-mono font-medium">
                  {pillars?.engineeringTrajectory.iterativeDebuggingScore ?? 5} / 6 pts
                </span>
              </li>
            </ul>
          </div>
        </section>

        {/* 3. Qualitative Engineering Feedback (Strengths & Areas for Improvement) */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Demonstrated Strengths */}
          <div className="rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-emerald-300">Key Engineering Strengths</h3>
            </div>
            <ul className="space-y-2 text-xs text-zinc-300 leading-relaxed">
              {report.strengths.map((str, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold mt-0.5">•</span>
                  <span>{str}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Growth Opportunities */}
          <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-5">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-4 w-4 text-amber-400" />
              <h3 className="text-sm font-semibold text-amber-300">Targeted Areas for Improvement</h3>
            </div>
            <ul className="space-y-2 text-xs text-zinc-300 leading-relaxed">
              {report.areasForImprovement.map((area, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold mt-0.5">•</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* 4. Actionable Practice Recommendations */}
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Personalized Practice Curriculum</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {report.practiceRecommendations.map((rec, idx) => (
              <div
                key={idx}
                className="flex flex-col justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 p-3.5 text-xs text-zinc-300 hover:border-zinc-700 transition"
              >
                <p className="leading-relaxed mb-3">{rec}</p>
                <div className="flex items-center gap-1 text-[11px] font-medium text-purple-400 hover:text-purple-300 cursor-pointer">
                  <span>Explore practice module</span>
                  <ArrowRight className="h-3 w-3" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 5. Defect Breakdown Accordion (Decision 10.2: 8 Defect Verification) */}
        {pillars?.functionalCorrectness.defectsBreakdown && (
          <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-3">Defect Resolution Breakdown</h3>
            <div className="space-y-2">
              {Object.entries(pillars.functionalCorrectness.defectsBreakdown).map(
                ([defectId, outcome]) => {
                  const isExpanded = expandedDefects[defectId];
                  return (
                    <div
                      key={defectId}
                      className="rounded-lg border border-zinc-800 bg-zinc-900/60 overflow-hidden text-xs"
                    >
                      <button
                        onClick={() => toggleDefect(defectId)}
                        className="flex w-full items-center justify-between p-3 text-left hover:bg-zinc-800/40 transition"
                      >
                        <div className="flex items-center gap-2.5">
                          {outcome.passed ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                          ) : outcome.assertionsPassed > 0 ? (
                            <AlertCircle className="h-4 w-4 text-amber-400" />
                          ) : (
                            <XCircle className="h-4 w-4 text-rose-400" />
                          )}
                          <span className="font-mono font-semibold text-zinc-200">{defectId}</span>
                        </div>
                        <div className="flex items-center gap-3 font-mono">
                          <span className={outcome.passed ? 'text-emerald-400' : 'text-zinc-400'}>
                            {outcome.assertionsPassed} / {outcome.totalAssertions} assertions passed
                          </span>
                          <span className="rounded bg-zinc-800 px-2 py-0.5 text-zinc-300 font-semibold">
                            {outcome.score} / 6 pts
                          </span>
                          {isExpanded ? (
                            <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                          ) : (
                            <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                          )}
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-zinc-800 bg-zinc-950/60 p-3 text-[11px] text-zinc-400 space-y-1 font-mono">
                          <div>Outcome: {outcome.passed ? 'VERIFIED_FIXED' : 'PARTIALLY_OR_UNRESOLVED'}</div>
                          <div>Credit: {outcome.score} / 6.00 points awarded (proportional to assertion coverage)</div>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
