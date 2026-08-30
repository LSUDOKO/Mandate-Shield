import { useEffect, useRef, useState } from "react";

/**
 * The landing page.
 *
 * A judge arrives here first, so the job of this page is to make one idea land
 * in about five seconds: a signature can be valid and the payment can still be
 * wrong. Everything else on the page is evidence for that claim.
 */

interface Props {
  onOpenConsole: () => void;
}

/**
 * The signature element: a mandate travelling toward settlement, stopped at the
 * checkpoint. It animates once on entry rather than looping, because a loop
 * would turn the one idea the page is making into wallpaper.
 */
function InterceptionStrip() {
  const [stage, setStage] = useState<"idle" | "travelling" | "held">("idle");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setStage("held");
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setStage("travelling");
        observer.disconnect();
      },
      { threshold: 0.4 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (stage !== "travelling") return;
    const id = setTimeout(() => setStage("held"), 1500);
    return () => clearTimeout(id);
  }, [stage]);

  return (
    <div className="strip" ref={ref} data-stage={stage}>
      <div className="strip-track">
        <span className="strip-label strip-label-start">Agent signs</span>

        <span className="strip-rail" aria-hidden="true">
          <span className="strip-packet">
            <span className="packet-amount">₹48,200.00</span>
          </span>
        </span>

        <span className="strip-gate" aria-hidden="true">
          <span className="gate-line" />
          <span className="gate-name">Shield</span>
        </span>

        <span className="strip-label strip-label-end">Money moves</span>
      </div>

      <p className="strip-caption" role="status">
        {stage === "held"
          ? "Held. The approver was shown ₹4,820.00. The payload signs ₹48,200.00."
          : "A signed mandate on its way to settlement."}
      </p>
    </div>
  );
}

const CHECKS = [
  {
    id: "wysiwys",
    threat: "T-7",
    title: "What you see is what you sign",
    body: "The rendered total is parsed back to paise and compared against the signed payload, field by field. One paise of divergence blocks.",
  },
  {
    id: "field",
    threat: "T-6",
    title: "Field completeness",
    body: "Every field that affects cost or scope must trace to something the user actually said, or a default they pre-approved. A guess is not authorization.",
  },
  {
    id: "catalog",
    threat: "T-1 / T-4",
    title: "Catalog stays data",
    body: "Product text can populate a name and a price. It can never reach a spend cap. A listing that claims authorization is caught and named.",
  },
  {
    id: "replay",
    threat: "replay",
    title: "Nonce replay",
    body: "Every nonce is recorded before settlement. A nonce that reappears blocks immediately, whatever else passed.",
  },
  {
    id: "actor",
    threat: "T-29 / T-15",
    title: "Actor identity",
    body: "Roles are proven with an HMAC bound to the transaction, then checked against a deny-by-default matrix. Identity is never inferred from the channel.",
  },
];

export function Landing({ onOpenConsole }: Props) {
  return (
    <div className="landing">
      <nav className="lp-nav">
        <a className="lp-brand" href="#top">
          <span className="lp-mark" aria-hidden="true" />
          Mandate Shield
        </a>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#evidence">Evidence</a>
          <a
            href="https://github.com/LSUDOKO/Mandate-Shield"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
          <button type="button" className="lp-cta-sm" onClick={onOpenConsole}>
            Open console
          </button>
        </div>
      </nav>

      <header className="lp-hero" id="top">
        <div className="lp-hero-copy">
          <p className="lp-eyebrow">Razorpay AI Buildathon 2026</p>
          {/* The line break is presentational; the space keeps the sentence
              intact for screen readers and text selection. */}
          <h1>
            A valid signature does not mean{" "}
            <span className="lp-break" aria-hidden="true" />a{" "}
            <em>valid payment.</em>
          </h1>
          <p className="lp-sub">
            Mandate Shield sits between an AI shopping agent and the moment a payment
            mandate is signed, and blocks what the user never agreed to.
          </p>
          <div className="lp-actions">
            <button type="button" className="lp-cta" onClick={onOpenConsole}>
              Open console
            </button>
            <a
              className="lp-cta-ghost"
              href="https://github.com/LSUDOKO/Mandate-Shield"
              target="_blank"
              rel="noreferrer"
            >
              Read the source
            </a>
          </div>
        </div>

        <InterceptionStrip />
      </header>

      <section className="lp-band" aria-label="Benchmark results">
        <dl className="lp-stats">
          <div>
            <dt>Attacks blocked</dt>
            <dd>15 / 15</dd>
          </div>
          <div>
            <dt>Missed</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>Legitimate held</dt>
            <dd>0</dd>
          </div>
          <div>
            <dt>Checks on the money path</dt>
            <dd>5</dd>
          </div>
          <div>
            <dt>AI on the money path</dt>
            <dd className="lp-stat-zero">None</dd>
          </div>
        </dl>
      </section>

      <section className="lp-section lp-problem" id="how">
        <div className="lp-prose">
          <h2>The signature protects the wrong step</h2>
          <p>
            Agentic payment protocols sign the cart. They do not protect the catalog
            data, tool results, and agent messages that decided what went into that
            cart in the first place. An attacker does not need to break the
            signature. They only need to change what the agent sees before it signs.
          </p>
          <p className="lp-cite">
            48 threats catalogued in{" "}
            <a href="https://arxiv.org/abs/2608.23858" target="_blank" rel="noreferrer">
              Beyond the Mandate (arXiv:2608.23858)
            </a>
            . Mandate Shield addresses five of them.
          </p>
        </div>

        <ol className="lp-flow">
          <li>
            <span className="lp-flow-k">Intent</span>
            <span className="lp-flow-v">Buy running shoes, cap ₹3,000</span>
          </li>
          <li>
            <span className="lp-flow-k">Agent</span>
            <span className="lp-flow-v">Groq drafts an order. Output is untrusted.</span>
          </li>
          <li className="lp-flow-seal">
            <span className="lp-flow-k">Snapshot</span>
            <span className="lp-flow-v">Sealed once, SHA-256, read by everyone after</span>
          </li>
          <li className="lp-flow-gate">
            <span className="lp-flow-k">Shield</span>
            <span className="lp-flow-v">Five deterministic checks. No model calls.</span>
          </li>
          <li>
            <span className="lp-flow-k">Outcome</span>
            <span className="lp-flow-v">Order, or a payment link for human approval</span>
          </li>
        </ol>
      </section>

      <section className="lp-section" aria-labelledby="checks-heading">
        <h2 id="checks-heading" className="lp-h2-wide">
          Five checks, all deterministic
        </h2>

        <div className="lp-checks">
          {CHECKS.map((check) => (
            <article key={check.id} className="lp-check">
              <header>
                <h3>{check.title}</h3>
                <span className="lp-threat">{check.threat}</span>
              </header>
              <p>{check.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section lp-split" id="evidence">
        <div>
          <h2>Blocking is not failing</h2>
          <p>
            A held transaction becomes a Razorpay Payment Link, and the customer
            finishes the purchase with a normal UPI PIN or OTP. The agent is removed
            from the loop. The customer is not.
          </p>
          <p>
            That asymmetry is why every check fails closed. A false positive costs a
            customer some friction. A false negative moves money nobody approved.
          </p>
        </div>

        <div className="lp-panel">
          <p className="lp-panel-title">Held transaction</p>
          <div className="lp-panel-row">
            <span>Shown to approver</span>
            <span className="lp-mono">₹4,820.00</span>
          </div>
          <div className="lp-panel-row lp-panel-bad">
            <span>Signed payload</span>
            <span className="lp-mono">₹48,200.00</span>
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
        </div>
      </section>

      <section className="lp-section lp-honest">
        <h2>What these numbers do not prove</h2>
        <p>
          The benchmark is synthetic and self-authored. 100% shows the checks do what
          they claim against the attack classes they were built for. It is not
          evidence of robustness against a novel attack, and it should not be read
          that way. The catalog is mock data, and actor identity is modelled within a
          single process.
        </p>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-main">
          <span className="lp-brand">
            <span className="lp-mark" aria-hidden="true" />
            Mandate Shield
          </span>
          <p>
            Deterministic verification between an AI shopping agent and mandate
            signing.
          </p>
        </div>
        <div className="lp-footer-links">
          <button type="button" className="lp-cta-sm" onClick={onOpenConsole}>
            Open console
          </button>
          <a
            href="https://github.com/LSUDOKO/Mandate-Shield"
            target="_blank"
            rel="noreferrer"
          >
            Source
          </a>
        </div>
      </footer>
    </div>
  );
}
