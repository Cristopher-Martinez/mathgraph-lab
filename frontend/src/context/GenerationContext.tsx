import { createContext, useContext, useState, type ReactNode } from "react";

interface GenerationContextType {
  generatingClassId: number | null;
  setGeneratingClassId: (id: number | null) => void;
}

const GenerationContext = createContext<GenerationContextType>({
  generatingClassId: null,
  setGeneratingClassId: () => {},
});

export function GenerationProvider({ children }: { children: ReactNode }) {
  const [generatingClassId, setGeneratingClassId] = useState<number | null>(
    null,
  );

  return (
    <GenerationContext.Provider
      value={{ generatingClassId, setGeneratingClassId }}>
      {children}
    </GenerationContext.Provider>
  );
}

export function useGeneration() {
  return useContext(GenerationContext);
}
