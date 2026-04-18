const BASE_URL = "/api";

// Timeout por defecto para evitar spinners infinitos cuando el backend se cuelga
// o la red se cae. Nginx tiene proxy_read_timeout 300s, pero la UX quiere algo humano.
const DEFAULT_TIMEOUT_MS = 30000;

async function request<T>(
  path: string,
  options?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const { timeoutMs = DEFAULT_TIMEOUT_MS, signal: externalSignal, ...rest } =
    options || {};

  // Combinar signal externo (si viene) con timeout interno
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", () => controller.abort());
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers,
      ...rest,
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Request failed");
    }
    const text = await res.text();
    if (!text) return undefined as unknown as T;
    return JSON.parse(text) as T;
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(
        `La solicitud tardó demasiado (>${Math.round(timeoutMs / 1000)}s). Revisa tu conexión o intenta de nuevo.`,
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export const api = {
  // Topics
  getTopics: (params?: { classId?: number }) => {
    const qs = new URLSearchParams();
    if (params?.classId) qs.set("classId", String(params.classId));
    const query = qs.toString();
    return request<any[]>(`/topics${query ? "?" + query : ""}`);
  },
  getTopic: (id: number) => request<any>(`/topics/${id}`),
  getPrerequisites: (topicId: number) =>
    request<any>(`/topics/${topicId}/prerequisites`),
  getTopicsByWindow: (window: string) =>
    request<any[]>(`/topics/by-window?window=${window}`),

  // Formulas
  getFormulas: () => request<any[]>("/formulas"),

  // Exercises
  getExercises: (params?: {
    topicId?: number;
    difficulty?: string;
    classId?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.topicId) qs.set("topicId", String(params.topicId));
    if (params?.difficulty) qs.set("difficulty", params.difficulty);
    if (params?.classId) qs.set("classId", String(params.classId));
    const query = qs.toString();
    return request<any[]>(`/exercises${query ? "?" + query : ""}`);
  },

  checkExercise: (data: { type: string; params: any; answer: any }) =>
    request<any>("/exercises/check", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  solveExercise: (data: { type: string; params: any }) =>
    request<any>("/exercises/solve", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  generateOneExercise: (topicId: number, difficulty: string) =>
    request<any>("/exercises/generate-one", {
      method: "POST",
      body: JSON.stringify({ topicId, difficulty }),
    }),

  // AI
  explain: (problem: string) =>
    request<{ explanation: string }>("/ai/explain", {
      method: "POST",
      body: JSON.stringify({ problem }),
    }),

  // Progress
  getProgress: () => request<any[]>("/progress"),
  updateProgress: (data: {
    topicId: number;
    completed?: boolean;
    score?: number;
  }) =>
    request<any>("/progress", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // Training
  startTraining: (data: any) =>
    request<any>("/training/start", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  answerTraining: (data: {
    sessionId: string;
    correct: boolean;
    timeout: boolean;
    timeMs: number;
    hintsUsed?: number;
    score?: number;
  }) =>
    request<any>("/training/answer", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  nextTrainingBatch: (sessionId: string) =>
    request<any>("/training/next-batch", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  resumeTraining: (sessionId: string) =>
    request<any>(`/training/resume/${sessionId}`),
  finishTraining: (sessionId: string) =>
    request<any>("/training/finish", {
      method: "POST",
      body: JSON.stringify({ sessionId }),
    }),
  getAITrainingConfig: (prompt: string) =>
    request<any>("/training/ai-config", {
      method: "POST",
      body: JSON.stringify({ prompt }),
    }),
  getTrainingPresets: () => request<any[]>("/training/presets"),
  saveTrainingPreset: (label: string, config: any) =>
    request<any>("/training/presets", {
      method: "POST",
      body: JSON.stringify({ label, config }),
    }),
  deleteTrainingPreset: (id: string) =>
    request<any>(`/training/presets/${id}`, { method: "DELETE" }),

  // Tutor Socrático
  tutorStart: (exerciseId: number) =>
    request<any>("/tutor/start", {
      method: "POST",
      body: JSON.stringify({ exerciseId }),
    }),

  tutorAnswer: (exerciseId: number, step: number, answer: string) =>
    request<any>("/tutor/answer", {
      method: "POST",
      body: JSON.stringify({ exerciseId, step, answer }),
    }),

  tutorAnswerStream: (exerciseId: number, step: number, answer: string) => {
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    return fetch(`${BASE_URL}/tutor/answer-stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({ exerciseId, step, answer }),
    });
  },

  tutorHint: (
    exerciseId: number,
    step: number,
    hintLevel: number,
    previousHints?: string[],
    studentAttempts?: string[],
  ) =>
    request<any>("/tutor/hint", {
      method: "POST",
      body: JSON.stringify({
        exerciseId,
        step,
        hintLevel,
        previousHints,
        studentAttempts,
      }),
    }),

  tutorSummary: (data: {
    exerciseId: number;
    stepsSolved: number;
    hintsUsed: number;
    stepsRevealed: number;
  }) =>
    request<any>("/tutor/summary", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  tutorAsk: (exerciseId: number, step: number, question: string) =>
    request<{ answer: string; isActuallyAnswer: boolean }>("/tutor/ask", {
      method: "POST",
      body: JSON.stringify({ exerciseId, step, question }),
    }),

  // ClassLog - Registro de Clases
  // El backend ahora pagina y envuelve la respuesta en { items, total, limit, offset }.
  // Mantenemos la firma vieja (Promise<any[]>) desempaquetando items aquí, para no
  // romper los 4 call sites existentes (ClassLogPage, ChatPage, TopicsPage, PracticePage).
  getClassLogs: async (params?: { limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set("limit", String(params.limit));
    if (params?.offset != null) qs.set("offset", String(params.offset));
    const query = qs.toString();
    const resp = await request<
      | any[]
      | { items: any[]; total: number; limit: number; offset: number }
    >(`/class-log${query ? "?" + query : ""}`);
    // Backward-compat: si el backend viejo devolvía array plano, úsalo tal cual.
    return Array.isArray(resp) ? resp : resp.items;
  },

  getClassLog: (id: number) => request<any>(`/class-log/${id}`),

  createClassLog: (data: {
    date: string;
    transcript: string;
    images?: { base64: string; mimeType?: string; caption?: string }[];
  }) =>
    request<any>("/class-log", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateClassLog: (
    id: number,
    data: {
      date?: string;
      title?: string;
      images?: { base64: string; mimeType?: string; caption?: string }[];
    },
  ) =>
    request<any>(`/class-log/${id}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteClassLog: (id: number) =>
    request<any>(`/class-log/${id}`, {
      method: "DELETE",
    }),

  cancelClassGeneration: (id: number) =>
    request<any>(`/class-log/${id}/generation`, {
      method: "DELETE",
    }),

  reanalyzeClassLog: (id: number) =>
    request<any>(`/class-log/${id}/reanalyze`, {
      method: "POST",
    }),

  mergeClassLog: (id: number) =>
    request<any>(`/class-log/${id}/merge`, {
      method: "POST",
    }),

  generateClassExercises: (id: number) =>
    request<any>(`/class-log/${id}/generate-exercises`, {
      method: "POST",
    }),

  getWeeklyTimeline: () => request<any[]>("/class-log/timeline/weekly"),

  reconstructCurriculum: () =>
    request<any>("/class-log/curriculum/reconstruct"),

  getDAG: () => request<any>("/class-log/dag"),

  extendDAG: () => request<any>("/class-log/dag/extend", { method: "POST" }),

  auditDAG: () => request<any>("/class-log/dag/audit", { method: "POST" }),

  // Notes - Apuntes de clase
  getNotes: (classId?: number) => {
    const qs = classId ? `?classId=${classId}` : "";
    return request<any>(`/notes${qs}`);
  },
  getNotesClasses: () => request<any[]>("/notes/classes"),
  regenerateNotes: (classId: number) =>
    request<any>(`/notes/${classId}/regenerate`, { method: "POST" }),

  getGenerationStatus: (classId: number) =>
    request<any>(`/class-log/generation-status/${classId}`),

  getActiveGenerations: () => request<any[]>("/class-log/generation-status"),

  analyzeClassImage: (id: number, base64: string, mimeType?: string) =>
    request<any>(`/class-log/${id}/analyze-image`, {
      method: "POST",
      body: JSON.stringify({ base64, mimeType: mimeType || "image/jpeg" }),
    }),

  validateAnswer: (data: {
    userAnswer: string;
    expectedAnswer: string;
    exercisePrompt?: string;
  }) =>
    request<{ correct: boolean; feedback: string }>("/ai/validate", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  getTopicDocs: (topicName: string) =>
    request<{
      conceptos: string;
      ejemplos: { titulo: string; problema: string; solucion: string }[];
      casosDeUso: string[];
      curiosidades: string[];
    }>("/ai/topic-docs", {
      method: "POST",
      body: JSON.stringify({ topicName }),
    }),

  getExerciseTips: (exerciseId: number) =>
    request<{
      tips: { text: string; source: "clase" | "general" | "ejercicio" }[];
      classContext: { titulo: string; contenido: string; categoria: string }[];
    }>("/ai/exercise-tips", {
      method: "POST",
      body: JSON.stringify({ exerciseId }),
    }),

  // Spaced Repetition
  getDueReviews: () => request<any[]>("/reviews/due"),
  getReviewStats: () =>
    request<{
      dueToday: number;
      dueThisWeek: number;
      totalReviewed: number;
      mastered: number;
    }>("/reviews/stats"),
  recordReview: (exerciseId: number, score: number) =>
    request<any>("/reviews/record", {
      method: "POST",
      body: JSON.stringify({ exerciseId, score }),
    }),

  // Chat Sessions
  getChatSessions: () => request<any[]>("/chat/sessions"),
  getChatMessages: (sessionId: number) =>
    request<any[]>(`/chat/sessions/${sessionId}/messages`),
  deleteChatSession: (sessionId: number) =>
    request<any>(`/chat/sessions/${sessionId}`, { method: "DELETE" }),
};
