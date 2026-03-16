import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";

interface GenerationStep {
  label: string;
  status: "pending" | "running" | "done" | "error";
  detail?: string;
}

export interface GenerationStatus {
  classId: number;
  type: "class" | "notes";
  status: "running" | "done" | "error";
  steps: GenerationStep[];
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface AnalysisProgress {
  classId: number;
  phase: "vectorizing" | "preview" | "truth" | "complete";
  message: string;
}

interface GenerationContextType {
  generations: Map<string, GenerationStatus>;
  activeGenerations: GenerationStatus[];
  analysisProgress: AnalysisProgress | null;
}

const GenerationContext = createContext<GenerationContextType>({
  generations: new Map(),
  activeGenerations: [],
  analysisProgress: null,
});

function statusKey(type: string, classId: number) {
  return `${type}:${classId}`;
}

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [generations, setGenerations] = useState<Map<string, GenerationStatus>>(
    new Map(),
  );
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const upsert = useCallback((status: GenerationStatus) => {
    setGenerations((prev) => {
      const next = new Map(prev);
      next.set(statusKey(status.type, status.classId), status);
      return next;
    });
  }, []);

  useEffect(() => {
    const socket = io("/", {
      path: "/socket.io",
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("generation:active", (list: GenerationStatus[]) => {
      setGenerations((prev) => {
        const next = new Map(prev);
        for (const s of list) next.set(statusKey(s.type, s.classId), s);
        return next;
      });
    });

    socket.on("generation:update", (status: GenerationStatus) => {
      upsert(status);
    });

    socket.on("analysis-progress", (data: AnalysisProgress) => {
      setAnalysisProgress(data);
    });

    return () => {
      socket.disconnect();
    };
  }, [upsert]);

  const activeGenerations = Array.from(generations.values()).filter(
    (g) => g.status === "running",
  );

  return (
    <GenerationContext.Provider value={{ generations, activeGenerations, analysisProgress }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  return useContext(GenerationContext);
}
