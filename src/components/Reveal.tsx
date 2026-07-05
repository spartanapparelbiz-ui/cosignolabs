"use client";

import { useReveal } from "@/lib/useReveal";

/**
 * Fades + rises its children 12px the first time they scroll into view,
 * once. Reduced motion → revealed immediately. Used for landing section
 * blocks so first-scroll feels composed without re-triggering.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "li";
}) {
  const { ref, shown } = useReveal<HTMLDivElement>();
  return (
    <Tag
      // @ts-expect-error ref is valid for the small union of tags used here
      ref={ref}
      className={`${className} transition-[opacity,transform] duration-[420ms] ease-brand-out ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
      style={{ transitionDelay: shown ? `${delay}ms` : "0ms" }}
    >
      {children}
    </Tag>
  );
}
