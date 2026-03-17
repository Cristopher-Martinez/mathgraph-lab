// Tests para fusión de clases por misma fecha y procesamiento de imágenes
// Valida: fusión de transcripciones, dedup por fecha, procesamiento de imágenes,
// reset de flags de análisis

import express from "express";

// Estado compartido para el mock de Prisma
const clases: any[] = [];
const imagenes: any[] = [];
const chunks: any[] = [];
let findFirstFilter: any = null;

jest.mock("../backend/src/prismaClient", () => {
  const mockPrisma: any = {
    classLog: {
      create: jest.fn().mockImplementation(({ data, include }: any) => {
        const newClass = {
          id: clases.length + 1,
          ...data,
          date: data.date,
          images: data.images?.create || [],
          createdAt: new Date(),
        };
        clases.push(newClass);
        return Promise.resolve(newClass);
      }),
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        findFirstFilter = where;
        // Buscar por rango de fecha (fusión por día)
        if (where?.date?.gte && where?.date?.lt) {
          const gte = new Date(where.date.gte).getTime();
          const lt = new Date(where.date.lt).getTime();
          const found = clases.find((c) => {
            const d = new Date(c.date).getTime();
            return d >= gte && d < lt;
          });
          return Promise.resolve(
            found
              ? {
                  ...found,
                  images: imagenes.filter((i) => i.classId === found.id),
                }
              : null,
          );
        }
        // Buscar por hash (dedup)
        if (where?.transcriptHash) {
          const found = clases.find(
            (c) => c.transcriptHash === where.transcriptHash,
          );
          return Promise.resolve(found || null);
        }
        return Promise.resolve(null);
      }),
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        const c = clases.find((c) => c.id === where.id);
        return Promise.resolve(
          c
            ? { ...c, images: imagenes.filter((i) => i.classId === c.id) }
            : null,
        );
      }),
      findMany: jest.fn().mockImplementation(({ where, orderBy }: any = {}) => {
        let results = [...clases];
        if (where) {
          if (where.id?.not !== undefined) {
            results = results.filter((c) => c.id !== where.id.not);
          }
          if (where.date?.gte && where.date?.lt) {
            const gte = new Date(where.date.gte).getTime();
            const lt = new Date(where.date.lt).getTime();
            results = results.filter((c) => {
              const d = new Date(c.date).getTime();
              return d >= gte && d < lt;
            });
          }
        }
        return Promise.resolve(
          results.map((c) => ({
            ...c,
            images: imagenes.filter((i) => i.classId === c.id),
          })),
        );
      }),
      delete: jest.fn().mockImplementation(({ where }: any) => {
        const idx = clases.findIndex((c) => c.id === where.id);
        if (idx >= 0) {
          const [removed] = clases.splice(idx, 1);
          return Promise.resolve(removed);
        }
        return Promise.resolve(null);
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
      createMany: jest.fn().mockImplementation(({ data }: any) => {
        for (const d of data) {
          imagenes.push({ id: imagenes.length + 1, ...d });
        }
        return Promise.resolve({ count: data.length });
      }),
      deleteMany: jest.fn().mockImplementation(({ where }: any) => {
        const before = imagenes.length;
        const remaining = imagenes.filter((i) => i.classId !== where.classId);
        imagenes.length = 0;
        imagenes.push(...remaining);
        return Promise.resolve({ count: before - remaining.length });
      }),
    },
    classChunk: {
      deleteMany: jest.fn().mockImplementation(({ where }: any) => {
        const before = chunks.length;
        const remaining = chunks.filter((c) => c.classId !== where.classId);
        chunks.length = 0;
        chunks.push(...remaining);
        return Promise.resolve({ count: before - remaining.length });
      }),
    },
    classNote: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    topic: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    topicDependency: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    exercise: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    exerciseTip: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    exerciseReview: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
  };

  // $transaction ejecuta el callback pasándole el mismo mock como tx
  mockPrisma.$transaction = jest
    .fn()
    .mockImplementation(async (cb: any) => cb(mockPrisma));

  return { __esModule: true, default: mockPrisma };
});

// Mock imageAnalysis — simula procesamiento de imágenes
jest.mock("../backend/src/services/imageAnalysis", () => ({
  validarImagen: jest.fn().mockReturnValue({ valida: true }),
  procesarImagenesBatch: jest.fn().mockResolvedValue({
    resultados: [
      {
        formulas: ["x^2 + y^2 = r^2"],
        ecuaciones: ["2x + 3 = 7"],
        diagramas: ["Círculo unitario"],
        sistemasCoordenados: [],
        desigualdades: [],
        textoDetectado: "Ecuación del círculo: x² + y² = r²",
      },
    ],
    errores: [],
    formulasConsolidadas: ["x^2 + y^2 = r^2"],
    textoConsolidado: "Ecuación del círculo: x² + y² = r²",
  }),
}));

// Mock jobQueue
jest.mock("../backend/src/services/jobQueue", () => ({
  enqueueFullAnalysis: jest.fn().mockResolvedValue(undefined),
  enqueuePropagation: jest.fn().mockResolvedValue(undefined),
  cancelGeneration: jest.fn().mockResolvedValue(undefined),
}));

// Mock redisClient
jest.mock("../backend/src/services/redisClient", () => ({
  getRedis: jest.fn().mockReturnValue({
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue("OK"),
    del: jest.fn().mockResolvedValue(1),
  }),
  deleteGenerationStatus: jest.fn().mockResolvedValue(undefined),
}));

// Mock generationStatus
jest.mock("../backend/src/services/generationStatus", () => ({
  getActiveGenerations: jest.fn().mockResolvedValue([]),
  getGenerationStatusById: jest.fn().mockResolvedValue(null),
}));

// Mock websocket
jest.mock("../backend/src/services/websocket", () => ({
  broadcastGenerationUpdate: jest.fn(),
}));

// Mock autoPropagation
jest.mock("../backend/src/services/autoPropagation", () => ({
  propagateClassChanges: jest.fn().mockResolvedValue(undefined),
  cleanArtifactsForReanalysis: jest.fn().mockResolvedValue(undefined),
  extendDAG: jest
    .fn()
    .mockResolvedValue({ newTopics: [], newDependencies: 0, newExercises: 0 }),
  auditDAG: jest.fn().mockResolvedValue(undefined),
  rollbackClass: jest.fn().mockResolvedValue(undefined),
}));

// Mock curriculumReconstruction
jest.mock("../backend/src/services/curriculumReconstruction", () => ({
  reconstruirCurriculo: jest.fn().mockResolvedValue({}),
}));

import classlogRouter from "../backend/src/routes/classlog";

function createTestApp() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use("/class-log", classlogRouter);
  return app;
}

function injectRequest(
  app: express.Express,
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; body: string; json: () => any }> {
  return new Promise((resolve) => {
    const http = require("http");
    const server = app.listen(0, () => {
      const addr = server.address();
      const port = typeof addr === "object" ? addr?.port : 0;
      const options = {
        hostname: "localhost",
        port,
        path,
        method,
        headers: { "Content-Type": "application/json" },
      };
      const req = http.request(options, (res: any) => {
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          server.close();
          resolve({
            status: res.statusCode,
            body: data,
            json: () => JSON.parse(data),
          });
        });
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

beforeEach(() => {
  clases.length = 0;
  imagenes.length = 0;
  chunks.length = 0;
  findFirstFilter = null;
  jest.clearAllMocks();
});

describe("Fusión de clases por fecha", () => {
  it("debe crear clase nueva cuando no existe clase ese día", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-15",
      transcript: "Hoy vimos ecuaciones lineales.",
    });

    expect(res.status).toBe(201);
    const data = res.json();
    expect(data.id).toBeDefined();
    expect(data.processing).toBe(true);
    expect(data.merged).toBeUndefined();
    expect(clases.length).toBe(1);
  });

  it("debe fusionar cuando ya existe clase con la misma fecha", async () => {
    const app = createTestApp();

    // Primera clase del día
    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-16",
      transcript: "Primera parte: ecuaciones.",
    });
    expect(clases.length).toBe(1);
    const primeraClaseId = clases[0].id;

    // Segunda clase del mismo día → fusión
    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-16",
      transcript: "Segunda parte: inecuaciones.",
    });

    expect(res.status).toBe(200); // 200, no 201
    const data = res.json();
    expect(data.merged).toBe(true);
    expect(data.id).toBe(primeraClaseId);
    // No se crea nueva clase
    expect(clases.length).toBe(1);
  });

  it("debe concatenar las transcripciones al fusionar", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-17",
      transcript: "Parte uno: derivadas.",
    });

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-17",
      transcript: "Parte dos: integrales.",
    });

    const clase = clases[0];
    expect(clase.transcript).toContain("Parte uno: derivadas.");
    expect(clase.transcript).toContain("Parte dos: integrales.");
    expect(clase.transcript).toContain("--- [Contenido adicional] ---");
  });

  it("debe resetear flags de análisis al fusionar", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-18",
      transcript: "Contenido inicial.",
    });

    // Simular que la clase fue analizada
    clases[0].analyzed = true;
    clases[0].deepAnalyzed = true;
    clases[0].vectorized = true;
    clases[0].analysisModel = "pro";

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-18",
      transcript: "Contenido adicional.",
    });

    const clase = clases[0];
    expect(clase.analyzed).toBe(false);
    expect(clase.deepAnalyzed).toBe(false);
    expect(clase.vectorized).toBe(false);
    expect(clase.analysisModel).toBeNull();
  });

  it("debe re-encolar análisis al fusionar", async () => {
    const { enqueueFullAnalysis } = require("../backend/src/services/jobQueue");
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-19",
      transcript: "Primera carga.",
    });

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-19",
      transcript: "Segunda carga.",
    });

    // Debe llamar a enqueueFullAnalysis con force=true para la fusión
    const calls = enqueueFullAnalysis.mock.calls;
    const fusionCall = calls.find((c: any[]) => c[3] === true);
    expect(fusionCall).toBeDefined();
    expect(fusionCall[0]).toBe(clases[0].id);
  });

  it("debe limpiar chunks al fusionar para re-vectorización", async () => {
    const prisma = require("../backend/src/prismaClient").default;
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-20",
      transcript: "Primera parte.",
    });

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-20",
      transcript: "Segunda parte.",
    });

    expect(prisma.classChunk.deleteMany).toHaveBeenCalledWith({
      where: { classId: clases[0].id },
    });
  });

  it("NO debe fusionar clases de días diferentes", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-21",
      transcript: "Clase del 21.",
    });

    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-03-22",
      transcript: "Clase del 22.",
    });

    expect(res.status).toBe(201);
    expect(clases.length).toBe(2);
    const data = res.json();
    expect(data.merged).toBeUndefined();
  });
});

describe("Procesamiento de imágenes en POST", () => {
  it("debe procesar imágenes y extraer texto en el transcript", async () => {
    const app = createTestApp();

    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-04-01",
      transcript: "Clase de geometría.",
      images: [{ base64: "dGVzdA==", mimeType: "image/jpeg" }],
    });

    expect(res.status).toBe(201);
    const clase = clases[0];
    // El transcript debe incluir el texto extraído de imágenes
    expect(clase.transcript).toContain("Clase de geometría.");
    expect(clase.transcript).toContain("[CONTENIDO EXTRAÍDO DE IMÁGENES]");
    expect(clase.transcript).toContain("x² + y² = r²");
  });

  it("debe crear clase solo con imágenes (sin transcripción)", async () => {
    const app = createTestApp();

    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-04-02",
      transcript: "",
      images: [{ base64: "dGVzdA==", mimeType: "image/jpeg" }],
    });

    expect(res.status).toBe(201);
    const clase = clases[0];
    // Solo texto de imágenes
    expect(clase.transcript).toContain("[CONTENIDO EXTRAÍDO DE IMÁGENES]");
  });

  it("debe validar imágenes y reportar errores", async () => {
    const app = createTestApp();

    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-04-03",
      transcript: "Clase con imágenes.",
      images: [
        { base64: "dGVzdA==", mimeType: "image/jpeg" }, // válida
        { base64: "", mimeType: "image/jpeg" }, // inválida: vacía
      ],
    });

    expect(res.status).toBe(201);
    const data = res.json();
    // Una imagen mala reportada como advertencia
    expect(data.advertencias).toBeDefined();
    expect(data.advertencias.length).toBeGreaterThan(0);
  });

  it("debe fusionar imágenes con clase existente del mismo día", async () => {
    const {
      procesarImagenesBatch,
    } = require("../backend/src/services/imageAnalysis");
    const app = createTestApp();

    // Clase sin imágenes
    await injectRequest(app, "POST", "/class-log", {
      date: "2026-04-04",
      transcript: "Primera parte sin fotos.",
    });

    // Subida con imágenes el mismo día
    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-04-04",
      transcript: "Segunda parte con fotos.",
      images: [{ base64: "dGVzdA==", mimeType: "image/jpeg" }],
    });

    expect(res.status).toBe(200);
    const data = res.json();
    expect(data.merged).toBe(true);
    // procesarImagenesBatch fue llamado para la segunda subida
    expect(procesarImagenesBatch).toHaveBeenCalled();
    // La transcripción fusionada incluye texto de imágenes
    expect(clases[0].transcript).toContain("[CONTENIDO EXTRAÍDO DE IMÁGENES]");
  });

  it("debe almacenar captions extraídos en ClassImage (no base64 truncado)", async () => {
    const prisma = require("../backend/src/prismaClient").default;
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-04-05",
      transcript: "Clase con foto.",
      images: [{ base64: "dGVzdA==", mimeType: "image/jpeg" }],
    });

    // Las imágenes almacenadas NO deben tener base64 truncado
    const imagenesCreadas = clases[0].images;
    for (const img of imagenesCreadas) {
      expect(img.url).not.toContain("...");
      expect(img.url).toMatch(/\[imagen-\d+\]/);
    }
  });
});

describe("Fusión + dedup coexistencia", () => {
  it("debe fusionar sin importar si el transcript es diferente", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-05-01",
      transcript: "Contenido A completamente diferente.",
    });

    const res = await injectRequest(app, "POST", "/class-log", {
      date: "2026-05-01",
      transcript: "Contenido B sin relación.",
    });

    // Fusión tiene prioridad sobre dedup por hash
    expect(res.status).toBe(200);
    expect(res.json().merged).toBe(true);
  });

  it("debe actualizar el hash de transcript tras fusión", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-05-02",
      transcript: "Contenido original.",
    });
    const hashOriginal = clases[0].transcriptHash;

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-05-02",
      transcript: "Contenido adicional.",
    });
    const hashNuevo = clases[0].transcriptHash;

    expect(hashNuevo).toBeDefined();
    expect(hashNuevo).not.toBe(hashOriginal);
  });
});

describe("Limpieza de artifacts en fusión", () => {
  it("debe llamar a cleanArtifactsForReanalysis al fusionar", async () => {
    const {
      cleanArtifactsForReanalysis,
    } = require("../backend/src/services/autoPropagation");
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-06-01",
      transcript: "Primera sesión.",
    });

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-06-01",
      transcript: "Segunda sesión.",
    });

    expect(cleanArtifactsForReanalysis).toHaveBeenCalledWith(clases[0].id);
  });

  it("debe mantener el título más reciente al fusionar", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-06-02",
      title: "Clase mañana",
      transcript: "Contenido mañana.",
    });

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-06-02",
      title: "Clase tarde actualizada",
      transcript: "Contenido tarde.",
    });

    expect(clases[0].title).toBe("Clase tarde actualizada");
  });

  it("debe resetear topics/formulas/activities al fusionar", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-06-03",
      transcript: "Primera parte.",
    });

    // Simular que el análisis llenó estos campos
    clases[0].topics = JSON.stringify(["Álgebra", "Geometría"]);
    clases[0].formulas = JSON.stringify(["a^2+b^2=c^2"]);
    clases[0].activities = JSON.stringify(["Ejercicios 1-5"]);

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-06-03",
      transcript: "Segunda parte.",
    });

    // Después de fusión, deben estar vacíos (se re-analizará todo)
    expect(clases[0].topics).toBe("[]");
    expect(clases[0].formulas).toBe("[]");
    expect(clases[0].activities).toBe("[]");
  });
});

describe("Fusión manual (POST /class-log/:id/merge)", () => {
  it("debe fusionar clases del mismo día en la clase target", async () => {
    const app = createTestApp();

    // Crear 2 clases del mismo día (simulando edición de fecha)
    await injectRequest(app, "POST", "/class-log", {
      date: "2026-07-01",
      transcript: "Clase A mañana.",
    });
    await injectRequest(app, "POST", "/class-log", {
      date: "2026-07-02",
      transcript: "Clase B tarde.",
    });

    // Simular que se editó la fecha de la segunda clase al mismo día
    clases[1].date = new Date("2026-07-01T12:00:00");

    // Fusionar la clase 1 con las del mismo día
    const res = await injectRequest(
      app,
      "POST",
      `/class-log/${clases[0].id}/merge`,
    );

    expect(res.status).toBe(200);
    const data = res.json();
    expect(data.status).toBe("merged");
    expect(data.mergedCount).toBe(1);
    expect(data.mergedIds).toContain(clases[1]?.id || 2);
  });

  it("debe rechazar fusión si no hay clases del mismo día", async () => {
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-08-01",
      transcript: "Clase sola.",
    });

    const res = await injectRequest(
      app,
      "POST",
      `/class-log/${clases[0].id}/merge`,
    );

    expect(res.status).toBe(400);
    const data = res.json();
    expect(data.error).toContain("No hay otras clases");
  });

  it("debe limpiar artifacts del target y eliminar fuentes con sus hijos FK", async () => {
    const {
      cleanArtifactsForReanalysis,
    } = require("../backend/src/services/autoPropagation");
    const prisma = require("../backend/src/prismaClient").default;
    const app = createTestApp();

    await injectRequest(app, "POST", "/class-log", {
      date: "2026-09-01",
      transcript: "Parte 1.",
    });
    await injectRequest(app, "POST", "/class-log", {
      date: "2026-09-02",
      transcript: "Parte 2.",
    });

    // Simular misma fecha
    clases[1].date = new Date("2026-09-01T12:00:00");

    cleanArtifactsForReanalysis.mockClear();
    await injectRequest(app, "POST", `/class-log/${clases[0].id}/merge`);

    // cleanArtifactsForReanalysis se llama solo para el target
    expect(cleanArtifactsForReanalysis).toHaveBeenCalledTimes(1);
    expect(cleanArtifactsForReanalysis).toHaveBeenCalledWith(clases[0].id);

    // La transacción debe haber eliminado los hijos FK de la fuente
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
