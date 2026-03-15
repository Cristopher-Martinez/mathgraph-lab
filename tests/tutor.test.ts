import express from "express";

// Mock prisma
jest.mock("../backend/src/prismaClient", () => {
  const mockExercises = [
    {
      id: 1,
      latex: "|2x + 1| > 7",
      difficulty: "medium",
      topicId: 2,
      generatedByClassId: null,
      socratic: JSON.stringify([
        {
          question: "¿Qué propiedad se aplica con |A| > B?",
          expected: "A > B o A < -B",
          hints: [
            "Recuerda: dos casos.",
            "Se divide en dos desigualdades.",
            "A > B o A < -B",
          ],
        },
        {
          question: "¿Qué dos desigualdades resultan?",
          expected: "2x + 1 > 7 y 2x + 1 < -7",
          hints: [
            "Sustituye A y B.",
            "2x + 1 > 7 y 2x + 1 < -7.",
            "2x + 1 > 7 y 2x + 1 < -7",
          ],
        },
        {
          question: "Resuelve 2x + 1 > 7.",
          expected: "x > 3",
          hints: ["Resta 1 y divide entre 2.", "x > 3.", "x > 3"],
        },
        {
          question: "Resuelve 2x + 1 < -7.",
          expected: "x < -4",
          hints: ["Resta 1 y divide entre 2.", "x < -4.", "x < -4"],
        },
      ]),
    },
    {
      id: 2,
      latex: "Encuentra la distancia entre A(1,2) y B(4,6)",
      difficulty: "easy",
      topicId: 5,
      generatedByClassId: null,
      socratic: null,
    },
  ];

  return {
    __esModule: true,
    default: {
      exercise: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const ex = mockExercises.find((e) => e.id === where.id);
          return Promise.resolve(ex || null);
        }),
        findMany: jest.fn().mockResolvedValue(mockExercises),
      },
    },
  };
});

import tutorRouter from "../backend/src/routes/tutor";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/tutor", tutorRouter);
  return app;
}

function injectRequest(
  app: express.Express,
  method: string,
  path: string,
  body?: any,
): Promise<{ status: number; body: string }> {
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
          resolve({ status: res.statusCode, body: data });
        });
      });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  });
}

describe("Tutor Socrático — Rutas", () => {
  // ─── POST /tutor/start ───
  test("POST /tutor/start inicia sesión con ejercicio socrático", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/start", {
      exerciseId: 1,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.step).toBe(0);
    expect(data.tutorQuestion).toBeDefined();
    expect(data.totalSteps).toBe(4);
    expect(data.exerciseId).toBe(1);
  });

  test("POST /tutor/start falla si el ejercicio no tiene socratic y no hay IA", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/start", {
      exerciseId: 2,
    });
    expect(res.status).toBe(400);
    const data = JSON.parse(res.body);
    expect(data.error).toContain("pasos socráticos");
  });

  test("POST /tutor/start falla con exerciseId inexistente", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/start", {
      exerciseId: 999,
    });
    expect(res.status).toBe(404);
  });

  test("POST /tutor/start falla sin exerciseId", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/start", {});
    expect(res.status).toBe(400);
  });

  // ─── POST /tutor/answer — Progresión correcta ───
  test("POST /tutor/answer respuesta correcta avanza al siguiente paso", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/answer", {
      exerciseId: 1,
      step: 0,
      answer: "A > B o A < -B",
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.correct).toBe(true);
    expect(data.nextStep).toBe(1);
    expect(data.tutorQuestion).toBeDefined();
  });

  // ─── POST /tutor/answer — Respuesta incorrecta ───
  test("POST /tutor/answer respuesta incorrecta devuelve feedback", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/answer", {
      exerciseId: 1,
      step: 0,
      answer: "no sé",
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.correct).toBe(false);
    expect(data.feedback).toBeDefined();
    expect(data.step).toBe(0);
  });

  // ─── POST /tutor/answer — Último paso ───
  test("POST /tutor/answer último paso correcto marca completado", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/answer", {
      exerciseId: 1,
      step: 3,
      answer: "x < -4",
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.correct).toBe(true);
    expect(data.completed).toBe(true);
  });

  // ─── POST /tutor/hint ───
  test("POST /tutor/hint devuelve pista nivel 1", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/hint", {
      exerciseId: 1,
      step: 0,
      hintLevel: 1,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.hint).toBeDefined();
    expect(data.level).toBe(1);
    expect(data.revealed).toBe(false);
  });

  test("POST /tutor/hint nivel 2 escala la pista", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/hint", {
      exerciseId: 1,
      step: 0,
      hintLevel: 2,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.hint).toBeDefined();
    expect(data.level).toBe(2);
    expect(data.revealed).toBe(false);
  });

  test("POST /tutor/hint nivel 3 revela la respuesta", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/hint", {
      exerciseId: 1,
      step: 0,
      hintLevel: 3,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.hint).toBeDefined();
    expect(data.level).toBe(3);
    expect(data.revealed).toBe(true);
    expect(data.scorePenalty).toBe(40);
  });

  test("POST /tutor/hint falla con paso fuera de rango", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/hint", {
      exerciseId: 1,
      step: 99,
      hintLevel: 1,
    });
    expect(res.status).toBe(400);
  });

  // ─── POST /tutor/summary ───
  test("POST /tutor/summary calcula puntaje sin pistas", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/summary", {
      exerciseId: 1,
      stepsSolved: 4,
      hintsUsed: 0,
      stepsRevealed: 0,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.score).toBe(100);
    expect(data.stepsSolved).toBe(4);
  });

  test("POST /tutor/summary calcula puntaje con 1 pista", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/summary", {
      exerciseId: 1,
      stepsSolved: 4,
      hintsUsed: 1,
      stepsRevealed: 0,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.score).toBe(80);
  });

  test("POST /tutor/summary calcula puntaje con 2 pistas", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/summary", {
      exerciseId: 1,
      stepsSolved: 4,
      hintsUsed: 2,
      stepsRevealed: 0,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.score).toBe(60);
  });

  test("POST /tutor/summary calcula puntaje con revelación", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/summary", {
      exerciseId: 1,
      stepsSolved: 4,
      hintsUsed: 1,
      stepsRevealed: 1,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.score).toBe(40); // 100 - 20 - 40
  });

  test("POST /tutor/summary puntaje mínimo es 0", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/summary", {
      exerciseId: 1,
      stepsSolved: 4,
      hintsUsed: 5,
      stepsRevealed: 2,
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.score).toBe(0);
  });

  // ─── Regression: checkAnswer devuelve objeto, no booleano ───
  test("POST /tutor/answer respuesta incorrecta NO se marca como correcta", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/answer", {
      exerciseId: 1,
      step: 0,
      answer: "xyz respuesta completamente incorrecta",
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.correct).toBe(false);
  });

  test("POST /tutor/hint nivel 1-2 no revela respuesta", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/tutor/hint", {
      exerciseId: 1,
      step: 0,
      hintLevel: 1,
    });
    const data = JSON.parse(res.body);
    expect(data.revealed).toBe(false);
    expect(data.scorePenalty).toBe(10);
  });
});
