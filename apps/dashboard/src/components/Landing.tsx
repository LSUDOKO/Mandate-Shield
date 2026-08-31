import {
  ArrowRight,
  Cube,
  Eye,
  FileText,
  Fingerprint,
  GithubLogo,
  Receipt,
} from "@phosphor-icons/react";
import { Interception } from "./Interception";
import { Reveal } from "./Reveal";

/**
 * The landing page.
 *
 * A judge arrives here first, so the page has about five seconds to land one
 * idea: a signature can be valid and the payment can still be wrong.
 * Everything below the hero is evidence for that single claim, ordered so that
 * each section answers the question the previous one raises.
 */

interface Props {
  onOpenConsole: () => void;
}

const CHECKS = [
  {
    id: "wysiwys",
    threat: "T-7",
    icon: Eye,
    title: "What you see is what you sign",
    body: "The rendered total is parsed back to paise and compared against the signed payload, field by field. One paise of divergence blocks.",
  },
  {
    id: "field",
    threat: "T-6",
    icon: FileText,
    title: "Field completeness",
    body: "Every field affecting cost or scope must trace to something the user said, or a default they pre-approved. A guess is not authorization.",
  },
  {
    id: "catalog",
    threat: "T-1 / T-4",
    icon: Cube,
    title: "Catalog stays data",
    body: "Product text can populate a name and a price. It can never reach a spend cap. A listing claiming authorization is caught and named.",
  },
  {
    id: "replay",
    threat: "replay",
    icon: Receipt,
    title: "Nonce replay",
    body: "Every nonce is recorded before settlement. A nonce that reappears blocks immediately, whatever else passed.",
  },
  {
    id: "actor",
    threat: "T-29 / T-15",
    icon: Fingerprint,
    title: "Actor identity",
    body: "Roles are proven with an HMAC bound to the transaction, then checked against a deny-by-default matrix. Identity is never inferred from the channel.",
  },
];

const STATS = [
  { k: "Attacks blocked", v: "15 / 15" },
  { k: "Missed", v: "0" },
  { k: "Legitimate held", v: "0" },
  { k: "Checks on the money path", v: "5" },
  { k: "AI on the money path", v: "None", good: true },
];

const PIPELINE = [
  { k: "Intent", v: "Buy running shoes, cap ₹3,000", tone: "" },
  { k: "Agent", v: "Groq drafts an order. Output is untrusted.", tone: "" },
  { k: "Snapshot", v: "Sealed once, SHA-256, read by everyone after", tone: "seal" },
  { k: "Shield", v: "Five deterministic checks. No model calls.", tone: "gate" },
  { k: "Outcome", v: "Order, or a payment link for human approval", tone: "" },
];

export function Landing({ onOpenConsole }: Props) {
  return (
    <div className="lp">
      <nav className="lp-nav">
        <a className="lp-brand" href="#top">
          <span className="lp-mark" aria-hidden="true" />
          Mandate Shield
        </a>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#checks">Checks</a>
          <a href="#evidence">Evidence</a>
          <a href="https://github.com/LSUDOKO/Mandate-Shield" target="_blank" rel="noreferrer">
            Source
          </a>
          <button type="button" className="btn btn-quiet" onClick={onOpenConsole}>
            Open console
          </button>
        </div>
      </nav>

      <header className="lp-hero" id="top">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">Razorpay AI Buildathon 2026</p>
          <h1>
            A valid signature does not mean a <em>valid payment.</em>
          </h1>
          <p className="lp-sub">
            Mandate Shield sits between an AI shopping agent and the moment a payment mandate is
            signed, and blocks what the user never agreed to.
          </p>
          <div className="lp-actions">
            <button type="button" className="btn btn-primary" onClick={onOpenConsole}>
              Open console
              <ArrowRight size={16} weight="bold" />
            </button>
            <a
              className="btn btn-ghost"
              href="https://github.com/LSUDOKO/Mandate-Shield"
              target="_blank"
              rel="noreferrer"
            >
              <GithubLogo size={16} weight="bold" />
              Read the source
            </a>
          </div>
        </div>

        <Interception />
      </header>

      <section className="lp-band" aria-label="Benchmark results">
        <dl className="lp-stats">
          {STATS.map((stat, i) => (
            <Reveal key={stat.k} index={i}>
              <dt>{stat.k}</dt>
              <dd className={stat.good ? "is-good" : undefined}>{stat.v}</dd>
            </Reveal>
          ))}
        </dl>
      </section>

      {/* Layout family 1: prose beside the pipeline it describes. */}
      <section className="lp-section lp-problem" id="how">
        <Reveal className="lp-prose">
          <h2>The signature protects the wrong step</h2>
          <p>
            Agentic payment protocols sign the cart. They do not protect the catalog data, tool
            results, and agent messages that decided what went into that cart in the first place. An
            attacker does not need to break the signature. They only need to change what the agent
            sees before it signs.
          </p>
          <p className="lp-cite">
            48 threats catalogued in{" "}
            <a href="https://arxiv.org/abs/2608.23858" target="_blank" rel="noreferrer">
              Beyond the Mandate (arXiv:2608.23858)
            </a>
            . Mandate Shield addresses five of them.
          </p>
        </Reveal>

        <ol className="lp-flow">
          {PIPELINE.map((step, i) => (
            <Reveal as="li" key={step.k} index={i} className={step.tone ? `is-${step.tone}` : ""}>
              <span className="lp-flow-k">{step.k}</span>
              <span className="lp-flow-v">{step.v}</span>
            </Reveal>
          ))}
        </ol>
      </section>

      {/* Layout family 2: a stacked reading list, one check per row, the fifth
          spanning both columns so the grid never shows an empty cell. */}
      <section className="lp-section" id="checks">
        <Reveal>
          <h2 className="lp-h2-lead">Five checks, all deterministic</h2>
        </Reveal>

        <div className="lp-checks">
          {CHECKS.map((check, i) => {
            const Icon = check.icon;
            return (
              <Reveal as="article" key={check.id} index={i} className="lp-check">
                <span className="lp-check-icon" aria-hidden="true">
                  <Icon size={17} weight="regular" />
                </span>
                <div className="lp-check-body">
                  <header>
                    <h3>{check.title}</h3>
                    <span className="lp-threat">{check.threat}</span>
                  </header>
                  <p>{check.body}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* Layout family 3: argument beside a worked example. */}
      <section className="lp-section lp-split" id="evidence">
        <Reveal>
          <h2>Blocking is not failing</h2>
          <p>
            A held transaction becomes a Razorpay Payment Link, and the customer finishes the
            purchase with a normal UPI PIN or OTP. The agent is removed from the loop. The customer
            is not.
          </p>
          <p>
            That asymmetry is why every check fails closed. A false positive costs a customer some
            friction. A false negative moves money nobody approved.
          </p>
        </Reveal>

        <Reveal index={1} className="lp-panel">
          <p className="lp-panel-title">Held transaction</p>
          <div className="lp-panel-row">
            <span>Shown to approver</span>
            <span className="lp-mono">&#8377;4,820.00</span>
          </div>
          <div className="lp-panel-row is-bad">
            <span>Signed payload</span>
            <span className="lp-mono">&#8377;48,200.00</span>
          </div>
          <div className="lp-panel-row">
            <span>Failed check</span>
            <span className="lp-mono">wysiwys</span>
          </div>
          <div className="lp-panel-row">
            <span>Customer path</span>
            <span className="lp-mono">Payment Link, OTP</span>
          </div>
          <div className="lp-panel-row">
            <span>Audit entry</span>
            <span className="lp-mono">chained, tamper-evident</span>
          </div>
        </Reveal>
      </section>

      {/* Layout family 4: a single centred statement, no columns. */}
      <section className="lp-honest">
        <Reveal>
          <h2>What these numbers do not prove</h2>
          <p>
            The benchmark is synthetic and self-authored. 100% shows the checks do what they claim
            against the attack classes they were built for. It is not evidence of robustness against
            a novel attack, and it should not be read that way. The catalog is mock data, and actor
            identity is modelled within a single process.
          </p>
        </Reveal>
      </section>

      <section className="lp-close">
        <Reveal>
          <h2>Send it an attack and watch it hold.</h2>
          <button type="button" className="btn btn-primary btn-lg" onClick={onOpenConsole}>
            Open console
            <ArrowRight size={17} weight="bold" />
          </button>
        </Reveal>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-main">
          <span className="lp-brand">
            <span className="lp-mark" aria-hidden="true" />
            Mandate Shield
          </span>
          <p>Deterministic verification between an AI shopping agent and mandate signing.</p>
        </div>
        <div className="lp-footer-links">
          <a href="https://github.com/LSUDOKO/Mandate-Shield" target="_blank" rel="noreferrer">
            Source
          </a>
          <a href="https://arxiv.org/abs/2608.23858" target="_blank" rel="noreferrer">
            Threat model
          </a>
        </div>
      </footer>
    </div>
  );
}
