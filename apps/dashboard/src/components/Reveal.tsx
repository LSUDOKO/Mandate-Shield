import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Stagger within a group, in steps of 60ms. */
  index?: number;
  /** How much of the element must be visible before it plays. */
  amount?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}

/**
 * Plays a short entrance once, when the element first scrolls into view.
 *
 * The page uses this instead of scroll-linked animation on purpose. Content
 * that moves continuously as you scroll draws attention to the scrolling; this
 * draws attention to the content arriving, then gets out of the way. It also
 * costs one IntersectionObserver rather than work on every scroll frame.
 *
 * Under prefers-reduced-motion the element starts in its finished state, so
 * nothing is ever left invisible waiting for an animation that will not run.
 */
export function Reveal({ children, index = 0, amount = 0.15, className, as = "div" }: Props) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShown(true);
        observer.disconnect();
      },
      { threshold: amount, rootMargin: "0px 0px -8% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [amount]);

  const Tag = as as "div";

  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={`reveal${shown ? " is-in" : ""}${className ? ` ${className}` : ""}`}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      {children}
    </Tag>
  );
}
