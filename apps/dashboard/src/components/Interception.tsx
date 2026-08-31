import { useEffect, useRef, useState } from "react";

/**
 * The page's signature element: a signed mandate travelling toward settlement,
 * stopped at the checkpoint and opened up.
 *
 * This is the whole product argument in one object, so it is built as a real
 * sequence rather than a decorative loop. The packet approaches, the gate
 * closes on it, the two amounts separate, and the divergence between what the
 * approver saw and what the payload signs becomes visible. It plays once on
 * entry. Looping it would turn the argument into wallpaper.
 *
 * Every stage is data, not a timer sprinkled through the markup, so the
 * sequence can be read top to bottom and the reduced-motion path is simply
 * "jump to the last stage".
 */
type Stage = "idle" | "moving" | "caught" | "opened";

const SEQUENCE: Array<{ to: Stage; after: number }> = [
  { to: "moving", after: 260 },
  { to: "caught", after: 1500 },
  { to: "opened", after: 640 },
];

export function Interception() {
  const [stage, setStage] = useState<Stage>("idle");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage("opened");
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();

        // Chain the stages by accumulated delay so each one is scheduled
        // relative to the start rather than nested inside the previous.
        let elapsed = 0;
        for (const step of SEQUENCE) {
          elapsed += step.after;
          timers.push(setTimeout(() => setStage(step.to), elapsed));
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(node);

    return () => {
      observer.disconnect();
      for (const timer of timers) clearTimeout(timer);
    };
  }, []);

  return (
    <div className="icept" ref={ref} data-stage={stage}>
      <div className="icept-frame">
        <div className="icept-head">
          <span className="icept-origin">Agent signs</span>
          <span className="icept-dest">Money moves</span>
        </div>

        <div className="icept-track" aria-hidden="true">
          <span className="icept-rail" />
          <span className="icept-scan" />

          <span className="icept-gate">
            <span className="icept-post" />
            <span className="icept-post" />
          </span>

          <span className="icept-packet">
            <span className="icept-packet-label">mandate</span>
            <span className="icept-packet-amount">&#8377;48,200.00</span>
          </span>
        </div>

        <div className="icept-gatename" aria-hidden="true">
          Shield
        </div>

        {/* The payoff: the two numbers that were supposed to be the same. */}
        <div className="icept-split">
          <div className="icept-side">
            <span className="icept-k">Shown to approver</span>
            <span className="icept-v">&#8377;4,820.00</span>
          </div>
          <div className="icept-side icept-side-bad">
            <span className="icept-k">Signed payload</span>
            <span className="icept-v">&#8377;48,200.00</span>
          </div>
        </div>
      </div>

      <p className="icept-caption" role="status">
        {stage === "opened" ? (
          <>
            <span className="icept-verdict">Held</span> by wysiwys. One decimal place apart, ten
            times the money.
          </>
        ) : (
          "A signed mandate on its way to settlement."
        )}
      </p>
    </div>
  );
}
