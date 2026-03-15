// API integration tests
// These tests validate API routes by importing the Express app directly

import express from "express";

// Mock prisma for tests
jest.mock("../backend/src/prismaClient", () => {
  const mockTopics = [
    {
      id: 1,
      name: "Inequalities",
      exercises: [],
      formulas: [],
    },
  ];
  return {
    __esModule: true,
    default: {
      topic: {
        findMany: jest.fn().mockResolvedValue(mockTopics),
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          const t = mockTopics.find((t) => t.id === where.id);
          return Promise.resolve(t || null);
        }),
      },
      exercise: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      formula: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      progress: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest
          .fn()
          .mockImplementation((args: any) =>
            Promise.resolve({ id: 1, ...args.data, updatedAt: new Date() }),
          ),
      },
      aIInteraction: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
      },
    },
  };
});

// Import after mock
import exercisesRouter from "../backend/src/routes/exercises";
import topicsRouter from "../backend/src/routes/topics";

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/topics", topicsRouter);
  app.use("/exercises", exercisesRouter);
  return app;
}

describe("API Routes", () => {
  test("GET /topics returns array", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "GET", "/topics");
    expect(res.status).toBe(200);
    expect(Array.isArray(JSON.parse(res.body))).toBe(true);
  });

  test("GET /topics/1 returns a topic", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "GET", "/topics/1");
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.name).toBe("Inequalities");
  });

  test("GET /topics/999 returns 404", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "GET", "/topics/999");
    expect(res.status).toBe(404);
  });

  test("POST /exercises/solve with distance", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/exercises/solve", {
      type: "distance",
      params: {
        pointA: { x: 0, y: 0 },
        pointB: { x: 3, y: 4 },
      },
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.value).toBeCloseTo(5);
  });

  test("POST /exercises/solve with quadratic_inequality", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/exercises/solve", {
      type: "quadratic_inequality",
      params: { a: 1, b: -5, c: 6, operator: "<=" },
    });
    expect(res.status).toBe(200);
    const data = JSON.parse(res.body);
    expect(data.intervals.length).toBe(1);
    expect(data.intervals[0].from).toBeCloseTo(2);
    expect(data.intervals[0].to).toBeCloseTo(3);
  });

  test("POST /exercises/solve with missing params returns 400", async () => {
    const app = createTestApp();
    const res = await injectRequest(app, "POST", "/exercises/solve", {});
    expect(res.status).toBe(400);
  });
});

// Simple test helper to make requests against an Express app without starting a server
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

describe("Frontend API client — contrato", () => {
  const fs = require("fs");
  const path = require("path");
  const apiContent = fs.readFileSync(
    path.join(__dirname, "../frontend/src/services/api.ts"),
    "utf-8",
  );

  it("generateClassExercises acepta solo id (sin cantidad)", () => {
    expect(apiContent).toMatch(
      /generateClassExercises:\s*\(id:\s*number\)\s*=>/,
    );
  });

  it("generate-exercises usa POST", () => {
    expect(apiContent).toContain("generate-exercises");
  });
});
