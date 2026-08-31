import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root";
// Tokens first: both stylesheets below consume the variables it defines.
import "./tokens.css";
import "./styles.css";
import "./landing.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
