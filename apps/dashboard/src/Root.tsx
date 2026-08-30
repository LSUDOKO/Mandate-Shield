import { useCallback, useEffect, useState } from "react";
import { App } from "./App";
import { Landing } from "./components/Landing";

type View = "landing" | "console";

function viewFromHash(): View {
  return window.location.hash === "#console" ? "console" : "landing";
}

/**
 * Two surfaces, one bundle: the landing page explains the idea, the console
 * demonstrates it. A hash route keeps them separate without pulling in a
 * router for what is genuinely two views.
 */
export function Root() {
  const [view, setView] = useState<View>(viewFromHash);

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const openConsole = useCallback(() => {
    window.location.hash = "#console";
  }, []);

  const openLanding = useCallback(() => {
    window.location.hash = "";
    // Clearing the hash does not always fire hashchange, so set state directly.
    setView("landing");
  }, []);

  useEffect(() => {
    document.title = view === "console" ? "Console — Mandate Shield" : "Mandate Shield";
  }, [view]);

  return view === "console" ? <App onBack={openLanding} /> : <Landing onOpenConsole={openConsole} />;
}
