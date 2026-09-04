import { CHECK_LABELS, type CheckResult } from "../types.js";

interface VerificationPanelProps {
  results: CheckResult[];
  /** True while the pipeline is still running, before any result exists. */
  pending: boolean;
}

const CHECK_ORDER = [
  "wysiwys",
  "field_completeness",
  "catalog_segregation",
  "replay_ledger",
  "actor_identity",
];

function Tick({ passed }: { passed: boolean }) {
  return (
    <span className={`tick ${passed ? "tick-pass" : "tick-fail"}`} aria-hidden="true">
      <svg viewBox="0 0 20 20">
        {passed ? (
          <path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        )}
      </svg>
    </span>
  );
}

export function VerificationPanel({ results, pending }: VerificationPanelProps) {
  if (pending) {
    return (
      <section className="verify">
        <h3 className="verify-title">Mandate Shield verification</h3>
        <ul className="verify-list">
          {CHECK_ORDER.map((check) => (
            <li className="verify-row verify-row-pending" key={check}>
              <span className="tick tick-pending" aria-hidden="true">
                <span className="spinner" />
              </span>
              <div>
                <p className="verify-name">{CHECK_LABELS[check]?.title ?? check}</p>
                <p className="verify-reason">Checking…</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className="verify">
      <h3 className="verify-title">Mandate Shield verification</h3>

      <ul className="verify-list">
        {results.map((result, index) => {
          const label = CHECK_LABELS[result.check];
          return (
            <li
              className={`verify-row ${result.passed ? "" : "verify-row-fail"}`}
              key={result.check}
              // Staggered so the checks resolve one at a time and a failure is
              // read rather than skimmed past.
              style={{ animationDelay: `${index * 200}ms` }}
            >
              <Tick passed={result.passed} />
              <div>
                <p className="verify-name">
                  {label?.title ?? result.check}
                  <span className="verify-threat">{label?.threats ?? ""}</span>
                </p>
                <p className="verify-reason">{result.reason}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
