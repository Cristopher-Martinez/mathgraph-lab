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

interface GenerationContextType {
  generations: Map<string, GenerationStatus>;
  activeGenerations: GenerationStatus[];
}

const GenerationContext = createContext<GenerationContextType>({
  generations: new Map(),
  activeGenerations: [],
});

function statusKey(type: string, classId: number) {
  return `${type}:${classId}`;
}

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [generations, setGenerations] = useState<Map<string, GenerationStatus>>(
    new Map(),
  );
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

    return () => {
      socket.disconnect();
    };
  }, [upsert]);

  const activeGenerations = Array.from(generations.values()).filter(
    (g) => g.status === "running",
  );

  return (
    <GenerationContext.Provider value={{ generations, activeGenerations }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  return useContext(GenerationContext);
}
