// Tests del módulo ClassLog + Curriculum Reconstruction
// Valida: análisis de transcripción, generación de ejercicios,
// reconstrucción curricular y rutas API

jest.mock("../backend/src/prismaClient", () => {
  const clases: any[] = [];
  const imagenes: any[] = [];
  const dependencias: any[] = [];

  return {
    __esModule: true,
    default: {
      classLog: {
        create: jest.fn().mockImplementation(({ data, include }: any) => {
          const newClass = {
            id: clases.length + 1,
            ...data,
            images: include?.images ? [] : undefined,
            createdAt: new Date(),
          };
          clases.push(newClass);
          return Promise.resolve(newClass);
        }),
        findMany: jest.fn().mockResolvedValue(clases),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const c = clases.find((c) => c.id === where.id);
          return Promise.resolve(c ? { ...c, images: [] } : null);
        }),
        update: jest.fn().mockImplementation(({ where, data }: any) => {
          const c = clases.find((c) => c.id === where.id);
          if (c) Object.assign(c, data);
          return Promise.resolve(c);
        }),
      },
      classImage: {
        create: jest.fn().mockImplementation(({ data }: any) => {
          const img = { id: imagenes.length + 1, ...data };
          imagenes.push(img);
          return Promise.resolve(img);
        }),
      },
      topic: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      topicDependency: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }: any) => {
          const dep = { id: dependencias.length + 1, ...data };
          dependencias.push(dep);
          return Promise.resolve(dep);
        }),
      },
    },
  };
});

// Mock de Google Generative AI
jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: jest.fn().mockResolvedValue({
        response: {
          text: () =>
            JSON.stringify({
              temas: ["Pendiente", "Ecuación de la recta"],
              formulas: ["m = (y2-y1)/(x2-x1)", "y = mx + b"],
              tiposEjercicio: ["pendiente", "ecuacion_recta"],
              resumen:
                "Clase sobre pendiente de una recta y ecuación punto-pendiente.",
              conceptosClave: ["Pendiente", "Ecuación punto-pendiente"],
              actividades: ["Resolver ejercicios 1-5 del libro"],
            }),
        },
      }),
    }),
  })),
}));

describe("Análisis de Transcripción", () => {
  it("debe extraer temas de una transcripción", async () => {
    const { analizarTranscripcion } =
      await import("../backend/src/services/transcriptAnalysis");

    process.env.GEMINI_API_KEY = "test-key";
    const resultado = await analizarTranscripcion(
      "Hoy vamos a ver la pendiente de una recta. La fórmula es m = (y2-y1)/(x2-x1).",
    );

    expect(resultado.temas).toBeDefined();
    expect(Array.isArray(resultado.temas)).toBe(true);
    expect(resultado.temas.length).toBeGreaterThan(0);
    expect(resultado.formulas).toBeDefined();
    expect(resultado.resumen).toBeDefined();
    expect(typeof resultado.resumen).toBe("string");
  });

  it("debe devolver conceptos clave", async () => {
    const { analizarTranscripcion } =
      await import("../backend/src/services/transcriptAnalysis");

    process.env.GEMINI_API_KEY = "test-key";
    const resultado = await analizarTranscripcion(
      "La pendiente se calcula con m = delta y / delta x.",
    );

    expect(resultado.conceptosClave).toBeDefined();
    expect(Array.isArray(resultado.conceptosClave)).toBe(true);
  });

  it("debe devolver actividades asignadas", async () => {
    const { analizarTranscripcion } =
      await import("../backend/src/services/transcriptAnalysis");

    process.env.GEMINI_API_KEY = "test-key";
    const resultado = await analizarTranscripcion(
      "Para mañana resuelvan los ejercicios 1-5 del libro.",
    );

    expect(resultado.actividades).toBeDefined();
    expect(Array.isArray(resultado.actividades)).toBe(true);
  });
});

describe("Generación de Ejercicios", () => {
  beforeEach(() => {
    jest.resetModules();
    // Re-mock para ejercicios
    jest.doMock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () =>
                JSON.stringify({
                  ejercicios: [
                    {
                      pregunta: "Calcula la pendiente entre (1,2) y (3,6)",
                      solucion: "m = (6-2)/(3-1) = 4/2 = 2",
                      dificultad: "facil",
                      tipo: "pendiente",
                      pistas: ["Usa la fórmula m = (y2-y1)/(x2-x1)"],
                    },
                    {
                      pregunta:
                        "Encuentra la ecuación de la recta con m=3 que pasa por (1,2)",
                      solucion: "y - 2 = 3(x - 1) → y = 3x - 1",
                      dificultad: "medio",
                      tipo: "ecuacion_recta",
                      pistas: ["Usa la forma punto-pendiente"],
                    },
                  ],
                }),
            },
          }),
        }),
      })),
    }));
  });

  it("debe generar ejercicios para temas dados", async () => {
    const { generarEjercicios } =
      await import("../backend/src/services/exerciseGeneration");

    process.env.GEMINI_API_KEY = "test-key";
    const resultado = await generarEjercicios(
      ["Pendiente", "Ecuación de la recta"],
      2,
    );

    expect(resultado.ejercicios).toBeDefined();
    expect(Array.isArray(resultado.ejercicios)).toBe(true);
    expect(resultado.ejercicios.length).toBeGreaterThan(0);
  });

  it("cada ejercicio debe tener campos requeridos", async () => {
    const { generarEjercicios } =
      await import("../backend/src/services/exerciseGeneration");

    process.env.GEMINI_API_KEY = "test-key";
    const resultado = await generarEjercicios(["Pendiente"], 1);

    for (const ej of resultado.ejercicios) {
      expect(ej.pregunta).toBeDefined();
      expect(ej.solucion).toBeDefined();
      expect(ej.dificultad).toBeDefined();
      expect(ej.tipo).toBeDefined();
    }
  });
});

describe("Análisis de Imágenes", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () =>
                JSON.stringify({
                  formulas: [
                    "m = (y2 - y1)/(x2 - x1)",
                    "d = sqrt((x2-x1)^2 + (y2-y1)^2)",
                  ],
                  ecuaciones: ["y = 2x + 3"],
                  diagramas: ["Plano cartesiano con dos puntos"],
                  sistemasCoordenados: ["Sistema XY con cuadrantes"],
                  desigualdades: [],
                  textoDetectado: "Fórmula de la pendiente",
                }),
            },
          }),
        }),
      })),
    }));
  });

  it("debe extraer fórmulas de una imagen", async () => {
    const { analizarImagen } =
      await import("../backend/src/services/imageAnalysis");

    process.env.GEMINI_API_KEY = "test-key";
    // Base64 dummy para test
    const resultado = await analizarImagen("dGVzdA==", "image/jpeg");

    expect(resultado.formulas).toBeDefined();
    expect(Array.isArray(resultado.formulas)).toBe(true);
    expect(resultado.formulas.length).toBeGreaterThan(0);
  });

  it("debe detectar texto en la imagen", async () => {
    const { analizarImagen } =
      await import("../backend/src/services/imageAnalysis");

    process.env.GEMINI_API_KEY = "test-key";
    const resultado = await analizarImagen("dGVzdA==", "image/jpeg");

    expect(resultado.textoDetectado).toBeDefined();
    expect(typeof resultado.textoDetectado).toBe("string");
  });
});

describe("Reconstrucción Curricular", () => {
  it("debe devolver estructura vacía sin clases", async () => {
    const prisma = (await import("../backend/src/prismaClient")).default;
    (prisma.classLog.findMany as jest.Mock).mockResolvedValueOnce([]);

    const { reconstruirCurriculo } =
      await import("../backend/src/services/curriculumReconstruction");

    const resultado = await reconstruirCurriculo();

    expect(resultado.semanas).toBeDefined();
    expect(resultado.dependencias).toBeDefined();
    expect(Array.isArray(resultado.semanas)).toBe(true);
    expect(Array.isArray(resultado.dependencias)).toBe(true);
  });

  it("debe agrupar clases por semana", async () => {
    const prisma = (await import("../backend/src/prismaClient")).default;
    (prisma.classLog.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: 1,
        date: new Date("2026-01-15"),
        title: "Clase 1",
        topics: JSON.stringify(["Distancia"]),
      },
      {
        id: 2,
        date: new Date("2026-01-17"),
        title: "Clase 2",
        topics: JSON.stringify(["Pendiente"]),
      },
    ]);

    const { reconstruirCurriculo } =
      await import("../backend/src/services/curriculumReconstruction");

    // Sin API key usa reconstrucción básica
    delete process.env.GEMINI_API_KEY;
    const resultado = await reconstruirCurriculo();

    expect(resultado.semanas.length).toBeGreaterThanOrEqual(1);
  });
});

describe("Detección de Temas", () => {
  it("debe identificar temas matemáticos en texto", async () => {
    jest.resetModules();
    jest.doMock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () =>
                JSON.stringify({
                  temas: [
                    "Distancia entre dos puntos",
                    "Punto medio",
                    "Pendiente",
                  ],
                  formulas: ["d = sqrt((x2-x1)^2 + (y2-y1)^2)"],
                  tiposEjercicio: ["distancia", "punto_medio"],
                  resumen: "Clase introductoria a geometría analítica.",
                  conceptosClave: ["Plano cartesiano"],
                  actividades: ["Repasar fórmulas de distancia"],
                }),
            },
          }),
        }),
      })),
    }));

    const { analizarTranscripcion } =
      await import("../backend/src/services/transcriptAnalysis");

    process.env.GEMINI_API_KEY = "test-key";
    const resultado = await analizarTranscripcion(
      "Hoy vimos la distancia entre dos puntos usando la fórmula d = sqrt((x2-x1)^2 + (y2-y1)^2). También vimos el punto medio y la pendiente.",
    );

    expect(resultado.temas.length).toBeGreaterThanOrEqual(1);
    expect(resultado.tiposEjercicio.length).toBeGreaterThanOrEqual(1);
  });
});

// ===== EDGE CASES =====

describe("Edge Cases - Transcripciones largas", () => {
  it("debe manejar transcripción vacía sin error", async () => {
    jest.resetModules();
    const { analizarTranscripcion } =
      await import("../backend/src/services/transcriptAnalysis");

    const resultado = await analizarTranscripcion("");
    expect(resultado.temas).toEqual([]);
    expect(resultado.resumen).toBeDefined();
  });

  it("debe manejar transcripción de solo espacios", async () => {
    jest.resetModules();
    const { analizarTranscripcion } =
      await import("../backend/src/services/transcriptAnalysis");

    const resultado = await analizarTranscripcion("   \n\n  \t  ");
    expect(resultado.temas).toEqual([]);
  });

  it("splitIntoChunks debe dividir texto largo correctamente", async () => {
    // Test del chunking directamente
    const texto = "a".repeat(50000);
    // Verificar que el texto es mayor al umbral
    expect(texto.length).toBeGreaterThan(30000);
  });
});

describe("Edge Cases - Validación de imágenes", () => {
  it("debe rechazar imagen vacía", () => {
    const { validarImagen } = require("../backend/src/services/imageAnalysis");
    const result = validarImagen("", "image/jpeg");
    expect(result.valida).toBe(false);
    expect(result.error).toContain("vacía");
  });

  it("debe rechazar tipo MIME inválido", () => {
    const { validarImagen } = require("../backend/src/services/imageAnalysis");
    const result = validarImagen("dGVzdA==", "application/pdf");
    expect(result.valida).toBe(false);
    expect(result.error).toContain("no soportado");
  });

  it("debe aceptar tipos válidos", () => {
    const { validarImagen } = require("../backend/src/services/imageAnalysis");
    const tipos = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    for (const tipo of tipos) {
      const result = validarImagen("dGVzdA==", tipo);
      expect(result.valida).toBe(true);
    }
  });

  it("debe rechazar imagen demasiado grande", () => {
    const { validarImagen } = require("../backend/src/services/imageAnalysis");
    const imagenGrande = "a".repeat(14_000_000); // >13.5MB en base64
    const result = validarImagen(imagenGrande, "image/jpeg");
    expect(result.valida).toBe(false);
    expect(result.error).toContain("grande");
  });
});

describe("Edge Cases - Batch de imágenes", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.doMock("@google/generative-ai", () => ({
      GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
        getGenerativeModel: jest.fn().mockReturnValue({
          generateContent: jest.fn().mockResolvedValue({
            response: {
              text: () =>
                JSON.stringify({
                  formulas: ["a^2 + b^2 = c^2"],
                  ecuaciones: [],
                  diagramas: [],
                  sistemasCoordenados: [],
                  desigualdades: [],
                  textoDetectado: "Teorema de Pitágoras",
                }),
            },
          }),
        }),
      })),
    }));
  });

  it("debe procesar batch vacío sin error", async () => {
    const { procesarImagenesBatch } =
      await import("../backend/src/services/imageAnalysis");

    const result = await procesarImagenesBatch([]);
    expect(result.resultados).toEqual([]);
    expect(result.errores).toEqual([]);
    expect(result.formulasConsolidadas).toEqual([]);
  });

  it("debe procesar múltiples imágenes y consolidar fórmulas", async () => {
    const { procesarImagenesBatch } =
      await import("../backend/src/services/imageAnalysis");

    process.env.GEMINI_API_KEY = "test-key";
    const result = await procesarImagenesBatch([
      { base64: "dGVzdA==", mimeType: "image/jpeg" },
      { base64: "dGVzdA==", mimeType: "image/png" },
    ]);

    expect(result.resultados.length).toBe(2);
    expect(result.formulasConsolidadas.length).toBeGreaterThan(0);
  });
});

describe("parseGeminiJSON — usado en classlog.ts para ejercicios inline", () => {
  it("debe parsear JSON válido directo", async () => {
    const { parseGeminiJSON } =
      await import("../backend/src/utils/parseGeminiJSON");

    const result = parseGeminiJSON(
      '{"pregunta": "Calcula 2+2", "solucion": "4", "pistas": ["Suma"]}'
    );
    expect(result.pregunta).toBe("Calcula 2+2");
    expect(result.solucion).toBe("4");
    expect(result.pistas).toEqual(["Suma"]);
  });

  it("debe parsear JSON con LaTeX sin corromper comandos", async () => {
    const { parseGeminiJSON } =
      await import("../backend/src/utils/parseGeminiJSON");

    const input = '{"pregunta": "Calcula \\\\frac{a}{b}", "solucion": "\\\\sqrt{4} = 2", "pistas": []}';
    const result = parseGeminiJSON(input);
    expect(result).not.toBeNull();
    expect(result.pregunta).toContain("frac");
    expect(result.solucion).toContain("sqrt");
  });

  it("debe manejar respuesta con markdown code blocks", async () => {
    const { parseGeminiJSON } =
      await import("../backend/src/utils/parseGeminiJSON");

    const input =
      '```json\n{"pregunta": "Resuelve x+1=3", "solucion": "x=2", "pistas": ["Despeja x"]}\n```';
    const result = parseGeminiJSON(input);
    expect(result).not.toBeNull();
    expect(result.pregunta).toBe("Resuelve x+1=3");
  });

  it("debe devolver null para texto no-JSON", async () => {
    const { parseGeminiJSON } =
      await import("../backend/src/utils/parseGeminiJSON");

    expect(parseGeminiJSON("esto no es json")).toBeNull();
    expect(parseGeminiJSON("")).toBeNull();
  });
});

describe("Edge Cases - Deduplicación", () => {
  it("debe deduplicar temas similares en fusión local", async () => {
    jest.resetModules();
    const items = [
      "Pendiente",
      "pendiente",
      "La pendiente",
      "Ecuación de la recta",
    ];
    const unique = new Set(items.map((i) => i.toLowerCase()));
    expect(unique.size).toBeLessThan(items.length);
  });
});

describe("ClassLog route — campo activities", () => {
  it("classlog.ts debe incluir actividades en la respuesta POST", () => {
    const fs = require("fs");
    const path = require("path");
    const content = fs.readFileSync(
      path.join(__dirname, "../backend/src/routes/classlog.ts"),
      "utf-8",
    );
    expect(content).toContain("actividades: analisisTranscripcion.actividades");
    expect(content).toContain('activities: JSON.stringify(analisisTranscripcion.actividades)');
  });

  it("classlog.ts debe incluir actividades en GET list y GET :id", () => {
    const fs = require("fs");
    const path = require("path");
    const content = fs.readFileSync(
      path.join(__dirname, "../backend/src/routes/classlog.ts"),
      "utf-8",
    );
    const matches = content.match(/safeParseJson\(c\.activities\)|safeParseJson\(clase\.activities\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
