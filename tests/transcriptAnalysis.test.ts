// Tests estructurales para transcriptAnalysis.ts
// Valida: interface TranscriptAnalysisResult con campo actividades,
// prompts incluyen "actividades", fusión local incluye actividades

const taFs = require("fs");
const taPath = require("path");

const taContent = taFs.readFileSync(
  taPath.join(__dirname, "../backend/src/services/transcriptAnalysis.ts"),
  "utf-8",
);

describe("TranscriptAnalysis — campo actividades", () => {
  it("interface debe incluir actividades: string[]", () => {
    expect(taContent).toMatch(/actividades:\s*string\[\]/);
  });

  it("PROMPT_SINGLE debe pedir actividades", () => {
    expect(taContent).toContain("Actividades asignadas");
  });

  it("PROMPT_CHUNK debe pedir actividades", () => {
    expect(taContent).toContain("Actividades asignadas (tareas");
  });

  it("PROMPT_MERGE debe incluir actividades sin duplicados", () => {
    expect(taContent).toContain("Actividades asignadas (sin duplicados)");
  });

  it("parseAnalysis debe extraer actividades", () => {
    expect(taContent).toContain("actividades: parsed.actividades || []");
  });

  it("EMPTY_RESULT debe incluir actividades vacías", () => {
    const emptyMatch = taContent.match(
      /EMPTY_RESULT[\s\S]*?actividades:\s*\[\]/
    );
    expect(emptyMatch).not.toBeNull();
  });

  it("fusionLocal debe fusionar actividades", () => {
    expect(taContent).toContain("actividadesSet");
  });
});
