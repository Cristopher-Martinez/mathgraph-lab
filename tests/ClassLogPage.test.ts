// Tests estructurales para ClassLogPage.tsx
// Valida constantes, contrato API y protección de cooldown

const fs = require("fs");
const path = require("path");

const content = fs.readFileSync(
  path.join(__dirname, "../frontend/src/pages/ClassLogPage.tsx"),
  "utf-8",
);

describe("ClassLogPage — constantes y configuración", () => {
  it("debe definir CLASSES_PER_PAGE", () => {
    expect(content).toMatch(/CLASSES_PER_PAGE\s*=\s*\d+/);
  });

  it("debe definir EXERCISES_PER_PAGE", () => {
    expect(content).toMatch(/EXERCISES_PER_PAGE\s*=\s*\d+/);
  });

  it("debe definir COOLDOWN_SECONDS", () => {
    expect(content).toMatch(/COOLDOWN_SECONDS\s*=\s*\d+/);
  });
});

describe("ClassLogPage — contrato API actualizado", () => {
  it("generateClassExercises no debe enviar cantidad", () => {
    expect(content).not.toMatch(/generateClassExercises\([^)]*cantidad/);
  });

  it("debe tener protección de cooldown al generar ejercicios", () => {
    expect(content).toContain("generandoEjercicios");
    expect(content).toContain("cooldown");
  });

  it("debe usar useCallback para generarMasEjercicios", () => {
    expect(content).toContain("useCallback");
    expect(content).toMatch(/generarMasEjercicios\s*=\s*useCallback/);
  });
});
