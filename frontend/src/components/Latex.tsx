import katex from "katex";
import { useEffect, useRef } from "react";

interface LatexProps {
  math: string;
  display?: boolean;
}

export default function Latex({ math, display = false }: LatexProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (ref.current) {
      try {
        katex.render(math, ref.current, {
          throwOnError: false,
          displayMode: display,
        });
      } catch {
        ref.current.textContent = math;
      }
    }
  }, [math, display]);

  return <span ref={ref} />;
}
