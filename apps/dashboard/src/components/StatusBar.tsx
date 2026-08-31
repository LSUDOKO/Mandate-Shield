import type { Health } from "../api";

/**
 * States plainly which components are live and which are running offline.
 * A mock gateway is never presented as a real one.
 */
export function StatusBar({ health }: { health: Health }) {
  const { agent_mode, gateway_mode, audit_chain } = health;

  return (
    <div className="status">
      <span className="chip">
        <span className={`dot ${agent_mode === "groq" ? "live" : "offline"}`} />
        <span className="key">agent</span>
        <span className="val">{agent_mode === "groq" ? "groq" : "offline parser"}</span>
      </span>

      <span className="chip">
        <span className={`dot ${gateway_mode === "live" ? "live" : "offline"}`} />
        <span className="key">razorpay</span>
        <span className="val">{gateway_mode === "live" ? "test mode" : "mock"}</span>
      </span>

      <span className="chip">
        <span className={`dot ${audit_chain.intact ? "live" : "broken"}`} />
        <span className="key">audit chain</span>
        <span className="val">
          {audit_chain.entryCount} {audit_chain.entryCount === 1 ? "entry" : "entries"},{" "}
          {audit_chain.intact ? "intact" : `broken at ${audit_chain.brokenAtIndex}`}
        </span>
      </span>

      <span className="chip">
        <span className="dot live" />
        <span className="key">shield</span>
        <span className="val">5 checks, deterministic</span>
      </span>
    </div>
  );
}
