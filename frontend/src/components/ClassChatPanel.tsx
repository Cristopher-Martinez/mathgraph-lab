import { useEffect, useRef, useState } from "react";
import MarkdownLatex from "./MarkdownLatex";

interface ChatMessage {
  role: "user" | "assistant";
  text: string;
  sources?: Array<{ classId: number; text: string; score: number }>;
}

interface RAGStats {
  totalChunks: number;
  indexedClasses: number;
  totalClasses: number;
}

export default function ClassChatPanel({
  classId,
  dateFrom,
  dateTo,
}: {
  classId?: number | null;
  dateFrom?: string;
  dateTo?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<RAGStats | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [showSources, setShowSources] = useState<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Cargar stats al montar
  useEffect(() => {
    fetch("/chat/stats")
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  const handleIndexAll = async () => {
    setIndexing(true);
    try {
      const res = await fetch("/chat/index-all", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        // Actualizar stats
        const statsRes = await fetch("/chat/stats");
        setStats(await statsRes.json());
      }
    } catch {
      // ignore
    }
    setIndexing(false);
  };

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");

    const userMsg: ChatMessage = { role: "user", text: question };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const history = messages.slice(-8).map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const response = await fetch("/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          classId: classId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          history,
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error("Error en la respuesta");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let sources: ChatMessage["sources"] = [];
      let buffer = "";
      let lastEventType = "";

      // Añadir mensaje vacío del asistente
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "", sources: [] },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            lastEventType = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            try {
              const parsed = JSON.parse(line.slice(6));

              if (lastEventType === "sources") {
                sources = parsed.sources || [];
              } else if (lastEventType === "chunk" && parsed.text) {
                assistantText += parsed.text;
                const currentText = assistantText;
                const currentSources = sources;
                setMessages((prev) => {
                  const updated = [...prev];
                  const lastIdx = updated.length - 1;
                  updated[lastIdx] = {
                    ...updated[lastIdx],
                    text: currentText,
                    sources: currentSources,
                  };
                  return updated;
                });
              }
            } catch {
              /* skip */
            }
          }
        }
      }

      // Asegurar que el mensaje final tenga las fuentes
      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === "assistant") {
          updated[lastIdx] = {
            ...updated[lastIdx],
            text: assistantText || "No pude generar una respuesta.",
            sources,
          };
        }
        return updated;
      });
    } catch {
      setMessages((prev) => [
        ...prev.filter((m) => m.text !== ""),
        {
          role: "assistant",
          text: "Error al procesar tu pregunta. Verifica que las clases estén indexadas.",
        },
      ]);
    }

    setLoading(false);
  };

  const needsIndexing = stats && stats.indexedClasses < stats.totalClasses;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">💬</span>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              Chat con tus Clases
            </h3>
          </div>
          {stats && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums">
              {stats.indexedClasses}/{stats.totalClasses} clases indexadas
            </span>
          )}
        </div>
        {classId && (
          <p className="text-[11px] text-indigo-500 dark:text-indigo-400 mt-0.5">
            Filtrando: Clase #{classId}
          </p>
        )}
      </div>

      {/* Index banner */}
      {needsIndexing && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <span className="text-xs text-amber-700 dark:text-amber-300 flex-1">
            {stats.totalClasses - stats.indexedClasses} clase(s) sin indexar
          </span>
          <button
            onClick={handleIndexAll}
            disabled={indexing}
            className="px-2.5 py-1 text-xs font-medium rounded bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors">
            {indexing ? "Indexando..." : "Indexar todo"}
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <span className="text-4xl block mb-3">📚</span>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">
              Pregúntame sobre tus clases
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-[240px] mx-auto">
              Puedo buscar en tus transcripciones y ayudarte a repasar
              conceptos, fórmulas y temas vistos en clase.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
              {[
                "¿Qué temas hemos visto?",
                "Explica la última fórmula",
                "Resume la clase más reciente",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                  }}
                  className="px-2.5 py-1 text-[11px] rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-sm"
              }`}>
              {msg.role === "assistant" ? (
                <>
                  {msg.text ? (
                    <MarkdownLatex content={msg.text} />
                  ) : (
                    <span className="inline-flex items-center gap-1 py-1">
                      <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce" />
                      <span
                        className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"
                        style={{ animationDelay: "150ms" }}
                      />
                      <span
                        className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"
                        style={{ animationDelay: "300ms" }}
                      />
                    </span>
                  )}
                  {msg.sources && msg.sources.length > 0 && msg.text && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-200 dark:border-gray-600">
                      <button
                        onClick={() =>
                          setShowSources(showSources === i ? null : i)
                        }
                        className="text-[10px] text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors">
                        📎 {msg.sources.length} fuente(s){" "}
                        {showSources === i ? "▾" : "▸"}
                      </button>
                      {showSources === i && (
                        <div className="mt-1.5 space-y-1">
                          {msg.sources.map((src, j) => (
                            <div
                              key={j}
                              className="text-[10px] text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded px-2 py-1">
                              <span className="font-medium text-indigo-500 dark:text-indigo-400">
                                Clase #{src.classId}
                              </span>
                              <span className="mx-1 text-gray-300 dark:text-gray-600">
                                •
                              </span>
                              <span className="text-gray-400 dark:text-gray-500">
                                {Math.round(src.score * 100)}% relevancia
                              </span>
                              <p className="mt-0.5 text-gray-400 dark:text-gray-500 line-clamp-2">
                                {src.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <span>{msg.text}</span>
              )}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-2.5 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Pregunta sobre tus clases..."
            disabled={loading}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-300 focus:outline-none disabled:opacity-50 placeholder:text-gray-400"
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-sm font-medium flex-shrink-0">
            {loading ? "..." : "→"}
          </button>
        </div>
      </div>
    </div>
  );
}
