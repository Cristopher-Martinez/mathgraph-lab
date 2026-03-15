import { useEffect, useRef, useState } from "react";

interface MathAnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  expectedAnswer?: string;
  placeholder?: string;
  className?: string;
}

// Math symbol suggestions grouped by category
const MATH_SYMBOLS = [
  { label: "√", insert: "√(", desc: "Raíz cuadrada" },
  { label: "∛", insert: "∛(", desc: "Raíz cúbica" },
  { label: "²", insert: "²", desc: "Cuadrado" },
  { label: "³", insert: "³", desc: "Cubo" },
  { label: "π", insert: "π", desc: "Pi" },
  { label: "±", insert: "±", desc: "Más menos" },
  { label: "∞", insert: "∞", desc: "Infinito" },
  { label: "≥", insert: ">=", desc: "Mayor o igual" },
  { label: "≤", insert: "<=", desc: "Menor o igual" },
  { label: "≠", insert: "≠", desc: "Diferente" },
  { label: "∅", insert: "∅", desc: "Conjunto vacío" },
  { label: "∈", insert: "∈", desc: "Pertenece" },
  { label: "∪", insert: "∪", desc: "Unión" },
  { label: "∩", insert: "∩", desc: "Intersección" },
  { label: "ⁿ", insert: "^", desc: "Exponente" },
  { label: "÷", insert: "/", desc: "División" },
  { label: "·", insert: "*", desc: "Multiplicación" },
  { label: "ₓ", insert: "x", desc: "Variable x" },
];

/**
 * Detects the answer format from the expected answer string
 * and returns a human-readable format hint.
 */
function getFormatHint(expected?: string): string | null {
  if (!expected || expected.trim().length === 0) return null;
  const s = expected.trim();

  // Interval notation: (-∞, 3] ∪ [5, ∞)
  if (
    /[(\[]-?[\d∞].*,.*[\d∞][)\]]/.test(s) ||
    s.includes("∪") ||
    s.includes("∩")
  ) {
    return "Ej: (-∞, 3] ∪ [5, ∞)";
  }
  // Set notation: {1, 2, 3}
  if (/^\{.*\}$/.test(s)) {
    return "Ej: {1, 2, 3}";
  }
  // Fraction: 3/4 or -2/5
  if (/^-?\d+\/\d+$/.test(s)) {
    return "Ej: 3/4";
  }
  // Inequality: x > 3, x <= -2
  if (/[<>]=?/.test(s) && /[a-z]/i.test(s)) {
    if (s.includes(">=") || s.includes("≥")) return "Ej: x >= 3";
    if (s.includes("<=") || s.includes("≤")) return "Ej: x <= -2";
    if (s.includes(">")) return "Ej: x > 5";
    if (s.includes("<")) return "Ej: x < -1";
  }
  // Square root: √5 or 3√2
  if (s.includes("√") || s.includes("sqrt")) {
    return "Ej: √5 o 3√2";
  }
  // Exponent: x^2 or 2^3
  if (s.includes("^") || /[²³⁴⁵]/.test(s)) {
    return "Ej: x^2 + 3";
  }
  // Polynomial/expression with x: 2x + 3, x² - 1
  if (/[a-z]/i.test(s) && /[\+\-\*]/.test(s)) {
    return "Ej: 2x + 3";
  }
  // Coordinate/pair: (2, 3)
  if (/^\(.*,.*\)$/.test(s)) {
    return "Ej: (2, 3)";
  }
  // Plus-minus: ±3
  if (s.includes("±")) {
    return "Ej: ±3";
  }
  // Simple equation result: x = 5
  if (/^[a-z]\s*=\s*-?[\d.]+/i.test(s)) {
    return "Ej: x = 5";
  }
  // Just a number
  if (/^-?[\d.]+$/.test(s)) {
    return "Ej: 42 o -3.5";
  }
  // Factored form: (x+2)(x-3)
  if (/\(.*\)\(.*\)/.test(s)) {
    return "Ej: (x+2)(x-3)";
  }
  // Default — show simplified version
  if (s.length > 15) return `Formato: ${s.slice(0, 12)}...`;
  return `Formato: ${s}`;
}

export default function MathAnswerInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  expectedAnswer,
  placeholder = "Escribe tu respuesta...",
  className = "",
}: MathAnswerInputProps) {
  const [showSymbols, setShowSymbols] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const formatHint = getFormatHint(expectedAnswer);

  // Close symbols panel on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowSymbols(false);
      }
    };
    if (showSymbols) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showSymbols]);

  const insertSymbol = (insert: string) => {
    onChange(value + insert);
    setShowSymbols(false);
    inputRef.current?.focus();
  };

  return (
    <div className={`space-y-1 flex-1 ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !disabled && onSubmit()}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-4 py-2 pr-12 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 disabled:opacity-50"
        />
        {/* Symbol toggle button */}
        <button
          type="button"
          onClick={() => setShowSymbols(!showSymbols)}
          disabled={disabled}
          className="absolute right-2 inset-y-2 px-2 flex items-center justify-center rounded-md text-gray-500 hover:text-indigo-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-indigo-400 dark:hover:bg-gray-700 transition-colors disabled:opacity-30"
          title="Insertar símbolo matemático">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M4 7h6M4 17h6M14 4l-4 16M14 12h6" />
          </svg>
        </button>

        {/* Symbols panel */}
        {showSymbols && (
          <div
            ref={panelRef}
            className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg p-2 z-50 w-64">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 font-medium">
              Símbolos matemáticos
            </p>
            <div className="grid grid-cols-6 gap-1">
              {MATH_SYMBOLS.map((sym) => (
                <button
                  key={sym.label}
                  onClick={() => insertSymbol(sym.insert)}
                  title={sym.desc}
                  className="w-8 h-8 flex items-center justify-center rounded text-sm font-medium hover:bg-indigo-100 dark:hover:bg-indigo-900/30 text-gray-700 dark:text-gray-300 transition-colors">
                  {sym.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Format hint */}
      {formatHint && (
        <p className="text-xs text-gray-400 dark:text-gray-500 pl-1">
          {formatHint}
        </p>
      )}
    </div>
  );
}
