import { useEffect, useRef } from "react";
import katex from "katex";

interface MarkdownLatexProps {
  content: string;
}

export default function MarkdownLatex({ content }: MarkdownLatexProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const container = containerRef.current;
    container.innerHTML = "";

    // Recover corrupted LaTeX from bad JSON escaping:
    // \frac in JSON → \f (form feed 0x0C) + "rac" → recover to \frac
    // \beta in JSON → \b (backspace 0x08) + "eta" → recover to \beta
    const sanitized = content
      .replace(/\x0C/g, "\\f")   // form feed → \f (recovers \frac, \flat, etc.)
      .replace(/\x08/g, "\\b");  // backspace → \b (recovers \beta, \bar, etc.)

    // Split content by lines to handle markdown structure
    const lines = sanitized.split("\n");
    let currentParagraph: string[] = [];

    const flushParagraph = () => {
      if (currentParagraph.length === 0) return;
      const p = document.createElement("p");
      p.className = "mb-4";
      renderLineWithLatex(currentParagraph.join("\n"), p);
      container.appendChild(p);
      currentParagraph = [];
    };

    lines.forEach((line) => {
      const trimmedLine = line.trim();

      // Heading (###, ##, #)
      if (trimmedLine.startsWith("###")) {
        flushParagraph();
        const h3 = document.createElement("h3");
        h3.className = "text-lg font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100";
        renderLineWithLatex(trimmedLine.slice(3).trim(), h3);
        container.appendChild(h3);
        return;
      }

      if (trimmedLine.startsWith("##")) {
        flushParagraph();
        const h2 = document.createElement("h2");
        h2.className = "text-xl font-bold mt-6 mb-3 text-gray-900 dark:text-gray-100";
        renderLineWithLatex(trimmedLine.slice(2).trim(), h2);
        container.appendChild(h2);
        return;
      }

      // Horizontal rule (---)
      if (trimmedLine === "---") {
        flushParagraph();
        const hr = document.createElement("hr");
        hr.className = "my-6 border-gray-300 dark:border-gray-600";
        container.appendChild(hr);
        return;
      }

      // List items (* or - or 1.)
      if (trimmedLine.match(/^[*-]\s/) || trimmedLine.match(/^\d+\.\s/)) {
        flushParagraph();
        const li = document.createElement("li");
        li.className = "ml-6 mb-2";
        const content = trimmedLine.replace(/^[*-]\s/, "").replace(/^\d+\.\s/, "");
        renderLineWithLatex(content, li);
        container.appendChild(li);
        return;
      }

      // Empty line - flush paragraph
      if (trimmedLine === "") {
        flushParagraph();
        return;
      }

      // Regular line - add to current paragraph
      currentParagraph.push(line);
    });

    flushParagraph();
  }, [content]);

  const renderLineWithLatex = (text: string, parentElement: HTMLElement) => {
    let remaining = text;
    
    while (remaining.length > 0) {
      // Check for display math ($$)
      const displayMatch = remaining.match(/^\$\$([^$]+)\$\$/);
      if (displayMatch) {
        const span = document.createElement("span");
        span.className = "block my-4 text-center";
        try {
          katex.render(displayMatch[1], span, {
            throwOnError: false,
            displayMode: true,
          });
        } catch {
          span.textContent = `$$${displayMatch[1]}$$`;
        }
        parentElement.appendChild(span);
        remaining = remaining.slice(displayMatch[0].length);
        continue;
      }

      // Check for inline math ($)
      const inlineMatch = remaining.match(/^\$([^$\n]+)\$/);
      if (inlineMatch) {
        const span = document.createElement("span");
        span.className = "inline-block mx-0.5";
        try {
          katex.render(inlineMatch[1], span, {
            throwOnError: false,
            displayMode: false,
          });
        } catch {
          span.textContent = `$${inlineMatch[1]}$`;
        }
        parentElement.appendChild(span);
        remaining = remaining.slice(inlineMatch[0].length);
        continue;
      }

      // Check for bold (**text**)
      const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
      if (boldMatch) {
        const strong = document.createElement("strong");
        strong.className = "font-bold";
        strong.textContent = boldMatch[1];
        parentElement.appendChild(strong);
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // Check for code (`text`)
      const codeMatch = remaining.match(/^`([^`]+)`/);
      if (codeMatch) {
        const code = document.createElement("code");
        code.className = "bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-sm font-mono";
        code.textContent = codeMatch[1];
        parentElement.appendChild(code);
        remaining = remaining.slice(codeMatch[0].length);
        continue;
      }

      // Regular character
      const nextSpecial = remaining.search(/[$*`]/);
      const chunk = nextSpecial === -1 ? remaining : remaining.slice(0, nextSpecial);
      if (chunk) {
        parentElement.appendChild(document.createTextNode(chunk));
        remaining = remaining.slice(chunk.length);
      } else {
        parentElement.appendChild(document.createTextNode(remaining[0]));
        remaining = remaining.slice(1);
      }
    }
  };

  return (
    <div 
      ref={containerRef} 
      className="prose prose-sm max-w-none dark:prose-invert"
      style={{ lineHeight: "1.7" }}
    />
  );
}
