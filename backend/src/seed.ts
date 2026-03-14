import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Check if already seeded
  const count = await prisma.topic.count();
  if (count > 0) {
    console.log("Database already seeded, skipping.");
    return;
  }

  console.log("Seeding database...");

  // ─── Topics ──────────────────────────────────────
  const topics = await Promise.all([
    prisma.topic.create({
      data: {
        name: "Desigualdades",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Desigualdades con Valor Absoluto",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Desigualdades Cuadráticas",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Plano Cartesiano y Puntos",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Fórmula de la Distancia",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Fórmula del Punto Medio",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Pendiente de una Recta",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Ecuación de una Recta",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Rectas Paralelas y Perpendiculares",
      },
    }),
    prisma.topic.create({
      data: {
        name: "Distancia de Punto a Recta",
      },
    }),
  ]);

  // ─── Formulas ────────────────────────────────────
  await prisma.formula.createMany({
    data: [
      {
        topicId: topics[0].id,
        latex: "ax + b \\leq c",
        explanation: "Forma general de una desigualdad lineal.",
      },
      {
        topicId: topics[1].id,
        latex: "|ax + b| \\leq c \\Rightarrow -c \\leq ax+b \\leq c",
        explanation:
          "Definición de desigualdad con valor absoluto (menor que).",
      },
      {
        topicId: topics[1].id,
        latex:
          "|ax + b| \\geq c \\Rightarrow ax+b \\leq -c \\text{ o } ax+b \\geq c",
        explanation:
          "Definición de desigualdad con valor absoluto (mayor que).",
      },
      {
        topicId: topics[2].id,
        latex: "ax^2 + bx + c \\geq 0",
        explanation: "Forma general de una desigualdad cuadrática.",
      },
      {
        topicId: topics[2].id,
        latex: "\\Delta = b^2 - 4ac",
        explanation:
          "Discriminante para encontrar las raíces de la cuadrática.",
      },
      {
        topicId: topics[4].id,
        latex: "d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}",
        explanation: "Fórmula de la distancia entre dos puntos.",
      },
      {
        topicId: topics[5].id,
        latex: "M = \\left(\\frac{x_1+x_2}{2}, \\frac{y_1+y_2}{2}\\right)",
        explanation: "Fórmula del punto medio.",
      },
      {
        topicId: topics[6].id,
        latex: "m = \\frac{y_2-y_1}{x_2-x_1}",
        explanation: "Fórmula de la pendiente.",
      },
      {
        topicId: topics[7].id,
        latex: "y - y_1 = m(x - x_1)",
        explanation: "Forma punto-pendiente de una recta.",
      },
      {
        topicId: topics[7].id,
        latex: "y = mx + b",
        explanation: "Forma pendiente-ordenada de una recta.",
      },
      {
        topicId: topics[8].id,
        latex: "m_1 = m_2",
        explanation: "Las rectas paralelas tienen pendientes iguales.",
      },
      {
        topicId: topics[8].id,
        latex: "m_1 \\cdot m_2 = -1",
        explanation:
          "Las rectas perpendiculares tienen pendientes recíprocas negativas.",
      },
      {
        topicId: topics[9].id,
        latex: "d = \\frac{|Ax_0 + By_0 + C|}{\\sqrt{A^2+B^2}}",
        explanation: "Distancia de un punto a la recta Ax+By+C=0.",
      },
    ],
  });

  // ─── Exercises — Expanded Dataset ─
  await prisma.exercise.createMany({
    data: [
      {
        latex: "6x + 3 ≤ 9x + 12",
        steps: "x ≥ -3",
        difficulty: "medium",
        topicId: topics[0].id,
      },
      {
        latex: "5x - 6 > 3x + 4",
        steps: "x > 5",
        difficulty: "medium",
        topicId: topics[0].id,
      },

      // Hard (41-50)
      {
        latex: "7x + 9 ≤ 4x + 21",
        steps: "x ≤ 4",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "2x - 1 > 3x - 7",
        steps: "x < 6",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "6x + 2 ≤ 8x + 10",
        steps: "x ≥ -4",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "4x - 9 > 2x - 3",
        steps: "x > 3",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "3x + 7 ≥ 5x - 1",
        steps: "x ≤ 4",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "9x + 4 < 6x + 19",
        steps: "x < 5",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "2(x + 3) ≥ 5x - 8",
        steps: "x ≤ 4.67",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "3x - 10 < 4x - 5",
        steps: "x > -5",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "6x + 1 > 2x + 13",
        steps: "x > 3",
        difficulty: "hard",
        topicId: topics[0].id,
      },
      {
        latex: "5x + 8 ≤ 3x + 18",
        steps: "x ≤ 5",
        difficulty: "hard",
        topicId: topics[0].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 2: DESIGUALDADES CON VALOR ABSOLUTO (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "|x - 4| ≤ 6",
        steps: "[-2, 10]",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|2x + 3| > 5",
        steps: "(-∞, -4) ∪ (1, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|5x - 2| < 8",
        steps: "(-1.2, 2)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|x + 7| ≥ 3",
        steps: "(-∞, -10] ∪ [-4, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|3x - 1| ≤ 10",
        steps: "[-3, 3.67]",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|4x + 5| > 9",
        steps: "(-∞, -3.5) ∪ (1, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|(x - 2)/3| ≤ 4",
        steps: "[-10, 14]",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|2(x - 3)| ≥ 7",
        steps: "(-∞, -0.5] ∪ [6.5, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 8| < 5",
        steps: "(3, 13)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|2x + 7| ≤ 9",
        steps: "[-8, 1]",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|5x - 10| ≥ 3",
        steps: "(-∞, 1.4] ∪ [2.6, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|x + 4| > 6",
        steps: "(-∞, -10) ∪ (2, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|2x - 1| ≤ 7",
        steps: "[-3, 4]",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 3| ≥ 4",
        steps: "(-∞, -1] ∪ [7, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|3x + 5| < 11",
        steps: "(-5.33, 2)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 6| ≤ 2",
        steps: "[4, 8]",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|4x + 1| > 5",
        steps: "(-∞, -1.5) ∪ (1, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|2x - 9| ≥ 6",
        steps: "(-∞, 1.5] ∪ [7.5, ∞)",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 5| ≤ 3",
        steps: "[2, 8]",
        difficulty: "easy",
        topicId: topics[1].id,
      },
      {
        latex: "|3x - 4| < 10",
        steps: "(-2, 4.67)",
        difficulty: "easy",
        topicId: topics[1].id,
      },

      // Medium (21-40)
      {
        latex: "|x + 2| > 8",
        steps: "(-∞, -10) ∪ (6, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|5x + 3| ≤ 12",
        steps: "[-3, 1.8]",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|2x - 7| ≥ 5",
        steps: "(-∞, 1] ∪ [6, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|4x - 8| < 16",
        steps: "(-2, 6)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 10| ≤ 4",
        steps: "[6, 14]",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|3x + 9| > 6",
        steps: "(-∞, -5) ∪ (-1, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|6x - 5| ≥ 7",
        steps: "(-∞, -0.33] ∪ [2, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|x + 9| < 3",
        steps: "(-12, -6)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|2x + 11| ≤ 13",
        steps: "[-12, 1]",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|4x - 3| > 9",
        steps: "(-∞, -1.5) ∪ (3, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 12| ≥ 5",
        steps: "(-∞, 7] ∪ [17, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|3x - 8| < 7",
        steps: "(0.33, 5)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|5x + 2| ≤ 8",
        steps: "[-2, 1.2]",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|2x - 3| > 11",
        steps: "(-∞, -4) ∪ (7, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|x + 5| ≥ 9",
        steps: "(-∞, -14] ∪ [4, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|4x + 7| < 15",
        steps: "(-5.5, 2)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|3x - 10| ≤ 14",
        steps: "[-1.33, 8]",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 15| > 6",
        steps: "(-∞, 9) ∪ (21, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|2x + 5| ≥ 9",
        steps: "(-∞, -7] ∪ [2, ∞)",
        difficulty: "medium",
        topicId: topics[1].id,
      },
      {
        latex: "|5x - 7| < 13",
        steps: "(-1.2, 4)",
        difficulty: "medium",
        topicId: topics[1].id,
      },

      // Hard (41-50)
      {
        latex: "|6x + 11| ≤ 17",
        steps: "[-4.67, 1]",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|3x - 14| > 10",
        steps: "(-∞, 1.33) ∪ (8, ∞)",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|x + 13| ≥ 8",
        steps: "(-∞, -21] ∪ [-5, ∞)",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|4x - 9| < 19",
        steps: "(-2.5, 7)",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|2x + 13| ≤ 15",
        steps: "[-14, 1]",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|5x - 12| > 18",
        steps: "(-∞, -1.2) ∪ (6, ∞)",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|x - 20| ≥ 7",
        steps: "(-∞, 13] ∪ [27, ∞)",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|3x + 8| < 17",
        steps: "(-8.33, 3)",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|7x - 5| ≤ 16",
        steps: "[-1.57, 3]",
        difficulty: "hard",
        topicId: topics[1].id,
      },
      {
        latex: "|2x - 15| > 13",
        steps: "(-∞, 1) ∪ (14, ∞)",
        difficulty: "hard",
        topicId: topics[1].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 3: DESIGUALDADES CUADRÁTICAS (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "x² - 9 ≥ 0",
        steps: "(-∞, -3] ∪ [3, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 5x + 6 ≤ 0",
        steps: "[2, 3]",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 4x + 3 > 0",
        steps: "(-∞, -3) ∪ (-1, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - x - 6 ≤ 0",
        steps: "[-2, 3]",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "2x² - 8 ≥ 0",
        steps: "(-∞, -2] ∪ [2, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 7x + 10 > 0",
        steps: "(-∞, 2) ∪ (5, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 2x - 8 ≤ 0",
        steps: "[-4, 2]",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 4x + 4 ≥ 0",
        steps: "(-∞, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "3x² - 12 > 0",
        steps: "(-∞, -2) ∪ (2, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 3x - 4 ≤ 0",
        steps: "[-1, 4]",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 16 ≥ 0",
        steps: "(-∞, -4] ∪ [4, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 6x + 8 < 0",
        steps: "(2, 4)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 6x + 5 ≤ 0",
        steps: "[-5, -1]",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 2x - 3 > 0",
        steps: "(-∞, -1) ∪ (3, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "2x² - 18 ≥ 0",
        steps: "(-∞, -3] ∪ [3, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 8x + 15 < 0",
        steps: "(3, 5)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 3x - 10 ≤ 0",
        steps: "[-5, 2]",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 25 > 0",
        steps: "(-∞, -5) ∪ (5, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 4x - 5 ≥ 0",
        steps: "(-∞, -1] ∪ [5, ∞)",
        difficulty: "easy",
        topicId: topics[2].id,
      },
      {
        latex: "x² + x - 12 < 0",
        steps: "(-4, 3)",
        difficulty: "easy",
        topicId: topics[2].id,
      },

      // Medium (21-40)
      {
        latex: "2x² - 5x - 3 ≤ 0",
        steps: "[-0.5, 3]",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 5x + 6 > 0",
        steps: "(-∞, -3) ∪ (-2, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "3x² - 7x + 2 ≥ 0",
        steps: "(-∞, 0.33] ∪ [2, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 10x + 21 < 0",
        steps: "(3, 7)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "2x² + x - 6 ≤ 0",
        steps: "[-2, 1.5]",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 9x + 18 > 0",
        steps: "(-∞, 3) ∪ (6, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 7x + 10 ≥ 0",
        steps: "(-∞, -5] ∪ [-2, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "4x² - 9 < 0",
        steps: "(-1.5, 1.5)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 11x + 24 ≤ 0",
        steps: "[3, 8]",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "3x² - 10x + 3 > 0",
        steps: "(-∞, 0.33) ∪ (3, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 2x - 15 ≥ 0",
        steps: "(-∞, -5] ∪ [3, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "2x² - 7x - 4 < 0",
        steps: "(-0.5, 4)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 12x + 35 ≤ 0",
        steps: "[5, 7]",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "5x² - 20 > 0",
        steps: "(-∞, -2) ∪ (2, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 8x + 12 ≥ 0",
        steps: "(-∞, -6] ∪ [-2, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "3x² - x - 2 < 0",
        steps: "(-0.67, 1)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 13x + 40 ≤ 0",
        steps: "[5, 8]",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "2x² + 5x - 3 > 0",
        steps: "(-∞, -3) ∪ (0.5, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 14x + 45 ≥ 0",
        steps: "(-∞, 5] ∪ [9, ∞)",
        difficulty: "medium",
        topicId: topics[2].id,
      },
      {
        latex: "4x² - 25 < 0",
        steps: "(-2.5, 2.5)",
        difficulty: "medium",
        topicId: topics[2].id,
      },

      // Hard (41-50)
      {
        latex: "5x² - 11x + 2 ≤ 0",
        steps: "[0.2, 2]",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 9x + 20 > 0",
        steps: "(-∞, -5) ∪ (-4, ∞)",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "6x² - 13x + 6 ≥ 0",
        steps: "(-∞, 0.67] ∪ [1.5, ∞)",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 15x + 50 < 0",
        steps: "(5, 10)",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "3x² + 10x - 8 ≤ 0",
        steps: "[-4, 0.67]",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 17x + 72 > 0",
        steps: "(-∞, 8) ∪ (9, ∞)",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "4x² + 12x + 5 ≥ 0",
        steps: "(-∞, -2.5] ∪ [-0.5, ∞)",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "x² - 16x + 63 < 0",
        steps: "(7, 9)",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "2x² - 13x + 15 ≤ 0",
        steps: "[1.5, 5]",
        difficulty: "hard",
        topicId: topics[2].id,
      },
      {
        latex: "x² + 11x + 30 > 0",
        steps: "(-∞, -6) ∪ (-5, ∞)",
        difficulty: "hard",
        topicId: topics[2].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 4: FÓRMULA DE LA DISTANCIA (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "Encuentra la distancia entre A(2,3) y B(6,7)",
        steps: "5.66",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-1,4) y B(5,-2)",
        steps: "8.49",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(3,5) y B(3,-4)",
        steps: "9",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-2,-3) y B(4,1)",
        steps: "7.21",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(0,0) y B(7,24)",
        steps: "25",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(1,2) y B(4,6)",
        steps: "5",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-3,5) y B(2,-1)",
        steps: "7.81",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(5,8) y B(5,2)",
        steps: "6",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-4,-7) y B(3,5)",
        steps: "14.76",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(0,5) y B(12,0)",
        steps: "13",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(2,1) y B(8,9)",
        steps: "10",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-5,3) y B(1,-5)",
        steps: "10",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(4,4) y B(7,8)",
        steps: "5",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-2,6) y B(6,-9)",
        steps: "17",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(0,3) y B(4,0)",
        steps: "5",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(3,-2) y B(9,6)",
        steps: "10",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-1,-1) y B(5,7)",
        steps: "10",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(6,2) y B(6,10)",
        steps: "8",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-3,-4) y B(2,8)",
        steps: "13",
        difficulty: "easy",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(1,1) y B(7,9)",
        steps: "10",
        difficulty: "easy",
        topicId: topics[4].id,
      },

      // Medium (21-40)
      {
        latex: "Encuentra la distancia entre A(-6,8) y B(6,-4)",
        steps: "15.62",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(4,-3) y B(-4,12)",
        steps: "17",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(7,5) y B(-1,-10)",
        steps: "17",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-8,-2) y B(4,3)",
        steps: "13",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(9,7) y B(-3,-8)",
        steps: "18.44",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-5,-6) y B(7,9)",
        steps: "18",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(2,-4) y B(-10,1)",
        steps: "13",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-7,4) y B(5,-8)",
        steps: "15.62",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(8,3) y B(-4,-12)",
        steps: "17.69",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-9,1) y B(3,-14)",
        steps: "18",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(5,-7) y B(-7,8)",
        steps: "18.44",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-4,9) y B(8,-6)",
        steps: "18.44",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(11,2) y B(-1,-13)",
        steps: "18.44",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-6,-5) y B(6,10)",
        steps: "18",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(3,8) y B(-9,-7)",
        steps: "18",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-10,3) y B(2,-12)",
        steps: "18.44",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(7,-9) y B(-5,6)",
        steps: "18",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-8,7) y B(4,-8)",
        steps: "18.44",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(6,11) y B(-6,-4)",
        steps: "18",
        difficulty: "medium",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-7,-10) y B(5,5)",
        steps: "18",
        difficulty: "medium",
        topicId: topics[4].id,
      },

      // Hard (41-50)
      {
        latex: "Encuentra la distancia entre A(-12,5) y B(8,-15)",
        steps: "28.28",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(9,-11) y B(-11,14)",
        steps: "30.41",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-15,8) y B(10,-17)",
        steps: "33.54",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(13,-6) y B(-7,19)",
        steps: "30.41",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-10,-12) y B(14,13)",
        steps: "32.02",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(16,7) y B(-8,-18)",
        steps: "33.54",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-11,15) y B(9,-10)",
        steps: "30.41",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(12,-13) y B(-13,12)",
        steps: "35.36",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(-14,-9) y B(11,16)",
        steps: "33.54",
        difficulty: "hard",
        topicId: topics[4].id,
      },
      {
        latex: "Encuentra la distancia entre A(15,10) y B(-10,-15)",
        steps: "33.54",
        difficulty: "hard",
        topicId: topics[4].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 5: FÓRMULA DEL PUNTO MEDIO (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "Encuentra el punto medio entre A(2,3) y B(6,7)",
        steps: "(4, 5)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-4,5) y B(2,-1)",
        steps: "(-1, 2)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(3,8) y B(7,4)",
        steps: "(5, 6)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-1,-3) y B(5,9)",
        steps: "(2, 3)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(0,0) y B(8,12)",
        steps: "(4, 6)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(1,2) y B(5,8)",
        steps: "(3, 5)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-2,4) y B(6,-8)",
        steps: "(2, -2)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(4,1) y B(4,9)",
        steps: "(4, 5)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-5,-2) y B(3,6)",
        steps: "(-1, 2)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(7,3) y B(1,7)",
        steps: "(4, 5)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(2,-1) y B(8,5)",
        steps: "(5, 2)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-3,7) y B(5,1)",
        steps: "(1, 4)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(6,4) y B(10,8)",
        steps: "(8, 6)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-1,3) y B(7,-5)",
        steps: "(3, -1)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(0,6) y B(4,2)",
        steps: "(2, 4)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(3,-4) y B(9,2)",
        steps: "(6, -1)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-2,-6) y B(6,4)",
        steps: "(2, -1)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(5,5) y B(5,11)",
        steps: "(5, 8)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-4,8) y B(2,-2)",
        steps: "(-1, 3)",
        difficulty: "easy",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(1,1) y B(9,9)",
        steps: "(5, 5)",
        difficulty: "easy",
        topicId: topics[5].id,
      },

      // Medium (21-40)
      {
        latex: "Encuentra el punto medio entre A(-7,6) y B(5,-4)",
        steps: "(-1, 1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(8,-3) y B(-2,11)",
        steps: "(3, 4)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-6,-8) y B(4,6)",
        steps: "(-1, -1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(9,7) y B(-3,-9)",
        steps: "(3, -1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-5,12) y B(7,-6)",
        steps: "(1, 3)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(11,4) y B(-1,-10)",
        steps: "(5, -3)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-8,-5) y B(6,9)",
        steps: "(-1, 2)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(10,-7) y B(-4,5)",
        steps: "(3, -1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-9,3) y B(5,-11)",
        steps: "(-2, -4)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(12,8) y B(-2,-4)",
        steps: "(5, 2)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-7,-9) y B(3,7)",
        steps: "(-2, -1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(13,-2) y B(-5,10)",
        steps: "(4, 4)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-10,5) y B(8,-13)",
        steps: "(-1, -4)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(14,6) y B(-4,-8)",
        steps: "(5, -1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-11,-7) y B(7,9)",
        steps: "(-2, 1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(15,1) y B(-3,15)",
        steps: "(6, 8)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-12,10) y B(6,-6)",
        steps: "(-3, 2)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(16,-4) y B(-2,12)",
        steps: "(7, 4)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-13,8) y B(5,-10)",
        steps: "(-4, -1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(17,9) y B(-1,-7)",
        steps: "(8, 1)",
        difficulty: "medium",
        topicId: topics[5].id,
      },

      // Hard (41-50)
      {
        latex: "Encuentra el punto medio entre A(-15,12) y B(11,-14)",
        steps: "(-2, -1)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(18,-8) y B(-6,16)",
        steps: "(6, 4)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-17,-11) y B(9,13)",
        steps: "(-4, 1)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(20,7) y B(-8,-15)",
        steps: "(6, -4)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-19,15) y B(7,-9)",
        steps: "(-6, 3)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(22,-10) y B(-10,18)",
        steps: "(6, 4)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-21,-13) y B(11,17)",
        steps: "(-5, 2)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(24,5) y B(-12,-19)",
        steps: "(6, -7)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(-23,14) y B(9,-16)",
        steps: "(-7, -1)",
        difficulty: "hard",
        topicId: topics[5].id,
      },
      {
        latex: "Encuentra el punto medio entre A(25,-12) y B(-11,20)",
        steps: "(7, 4)",
        difficulty: "hard",
        topicId: topics[5].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 6: PENDIENTE DE UNA RECTA (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "Encuentra la pendiente entre A(2,3) y B(6,7)",
        steps: "1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-1,4) y B(5,-2)",
        steps: "-1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(3,5) y B(3,-4)",
        steps: "indefinida",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(1,2) y B(5,10)",
        steps: "2",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(0,0) y B(4,8)",
        steps: "2",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-2,3) y B(2,7)",
        steps: "1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(1,1) y B(3,5)",
        steps: "2",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-3,-1) y B(1,7)",
        steps: "2",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(2,-1) y B(6,3)",
        steps: "1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(4,2) y B(4,8)",
        steps: "indefinida",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-1,5) y B(3,1)",
        steps: "-1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(0,3) y B(6,9)",
        steps: "1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(5,4) y B(7,8)",
        steps: "2",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-4,-2) y B(2,4)",
        steps: "1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(3,7) y B(3,1)",
        steps: "indefinida",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(1,-2) y B(5,6)",
        steps: "2",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-2,-4) y B(4,2)",
        steps: "1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(6,3) y B(8,7)",
        steps: "2",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-5,2) y B(1,8)",
        steps: "1",
        difficulty: "easy",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(2,5) y B(2,-3)",
        steps: "indefinida",
        difficulty: "easy",
        topicId: topics[6].id,
      },

      // Medium (21-40)
      {
        latex: "Encuentra la pendiente entre A(-3,8) y B(5,-4)",
        steps: "-1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(4,-2) y B(-2,10)",
        steps: "-2",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-6,3) y B(2,-9)",
        steps: "-1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(7,6) y B(-1,-10)",
        steps: "2",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-4,-7) y B(6,8)",
        steps: "1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(5,1) y B(-3,13)",
        steps: "-1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-8,4) y B(4,-8)",
        steps: "-1",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(9,-5) y B(1,11)",
        steps: "-2",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-7,-3) y B(5,15)",
        steps: "1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(6,9) y B(-2,-7)",
        steps: "2",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-5,10) y B(7,-8)",
        steps: "-1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(8,-3) y B(-4,15)",
        steps: "-1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-9,7) y B(3,-9)",
        steps: "-1.33",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(10,2) y B(-2,-16)",
        steps: "1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-6,-9) y B(6,9)",
        steps: "1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(11,5) y B(3,-11)",
        steps: "2",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-7,12) y B(5,-6)",
        steps: "-1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(12,-4) y B(-4,12)",
        steps: "-1",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-10,-2) y B(2,16)",
        steps: "1.5",
        difficulty: "medium",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(13,8) y B(5,-8)",
        steps: "2",
        difficulty: "medium",
        topicId: topics[6].id,
      },

      // Hard (41-50)
      {
        latex: "Encuentra la pendiente entre A(-12,15) y B(8,-10)",
        steps: "-1.25",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(14,-7) y B(-6,18)",
        steps: "-1.25",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-15,-8) y B(9,16)",
        steps: "1",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(16,10) y B(-8,-14)",
        steps: "1",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-17,12) y B(7,-13)",
        steps: "-1.04",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(18,-9) y B(-6,15)",
        steps: "-1",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-19,-11) y B(5,17)",
        steps: "1.17",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(20,13) y B(-4,-11)",
        steps: "1",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(-21,14) y B(3,-16)",
        steps: "-1.25",
        difficulty: "hard",
        topicId: topics[6].id,
      },
      {
        latex: "Encuentra la pendiente entre A(22,-10) y B(-2,14)",
        steps: "-1",
        difficulty: "hard",
        topicId: topics[6].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 7: ECUACIÓN DE UNA RECTA (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "Recta que pasa por A(2,3) y B(6,7)",
        steps: "y = x + 1",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-1,4) y B(5,-2)",
        steps: "y = -x + 3",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 2 que pasa por (1,3)",
        steps: "y = 2x + 1",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(0,5) y B(3,11)",
        steps: "y = 2x + 5",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 1 que pasa por (2,4)",
        steps: "y = x + 2",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-2,1) y B(2,5)",
        steps: "y = x + 3",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -1 que pasa por (3,2)",
        steps: "y = -x + 5",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(1,1) y B(4,7)",
        steps: "y = 2x - 1",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 3 que pasa por (0,2)",
        steps: "y = 3x + 2",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-3,0) y B(1,4)",
        steps: "y = x + 3",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 0.5 que pasa por (2,5)",
        steps: "y = 0.5x + 4",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(0,0) y B(5,10)",
        steps: "y = 2x",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -2 que pasa por (1,6)",
        steps: "y = -2x + 8",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-1,-1) y B(3,7)",
        steps: "y = 2x + 1",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 4 que pasa por (1,2)",
        steps: "y = 4x - 2",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(2,0) y B(6,8)",
        steps: "y = 2x - 4",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -3 que pasa por (0,7)",
        steps: "y = -3x + 7",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-2,3) y B(4,9)",
        steps: "y = x + 5",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 1.5 que pasa por (2,3)",
        steps: "y = 1.5x",
        difficulty: "easy",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(1,4) y B(5,12)",
        steps: "y = 2x + 2",
        difficulty: "easy",
        topicId: topics[7].id,
      },

      // Medium (21-40)
      {
        latex: "Recta que pasa por A(-4,7) y B(2,-5)",
        steps: "y = -2x - 1",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -1.5 que pasa por (3,4)",
        steps: "y = -1.5x + 8.5",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-6,2) y B(4,-8)",
        steps: "y = -x - 4",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 2.5 que pasa por (-1,3)",
        steps: "y = 2.5x + 5.5",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(5,-3) y B(-3,13)",
        steps: "y = -2x + 7",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -0.5 que pasa por (4,6)",
        steps: "y = -0.5x + 8",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-7,-4) y B(5,8)",
        steps: "y = x + 3",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 3.5 que pasa por (2,-1)",
        steps: "y = 3.5x - 8",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(8,3) y B(-4,-9)",
        steps: "y = x - 5",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -2.5 que pasa por (-2,5)",
        steps: "y = -2.5x",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-5,10) y B(7,-8)",
        steps: "y = -1.5x + 2.5",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 1.25 que pasa por (4,8)",
        steps: "y = 1.25x + 3",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(9,-2) y B(-3,10)",
        steps: "y = -x + 7",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -1.75 que pasa por (0,9)",
        steps: "y = -1.75x + 9",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-8,6) y B(4,-6)",
        steps: "y = -x - 2",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 2.25 que pasa por (3,1)",
        steps: "y = 2.25x - 5.75",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(6,11) y B(-6,-7)",
        steps: "y = 1.5x + 2",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -3.5 que pasa por (-1,7)",
        steps: "y = -3.5x + 3.5",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-9,-5) y B(3,13)",
        steps: "y = 1.5x + 8.5",
        difficulty: "medium",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 4.5 que pasa por (1,-3)",
        steps: "y = 4.5x - 7.5",
        difficulty: "medium",
        topicId: topics[7].id,
      },

      // Hard (41-50)
      {
        latex: "Recta que pasa por A(-12,8) y B(8,-12)",
        steps: "y = -x - 4",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -2.75 que pasa por (5,2)",
        steps: "y = -2.75x + 15.75",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(15,-6) y B(-5,14)",
        steps: "y = -x + 9",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 3.25 que pasa por (-3,-5)",
        steps: "y = 3.25x + 4.75",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-10,12) y B(10,-8)",
        steps: "y = -x + 2",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -4.25 que pasa por (4,6)",
        steps: "y = -4.25x + 23",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(13,5) y B(-7,-15)",
        steps: "y = x - 8",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente 5.5 que pasa por (-2,4)",
        steps: "y = 5.5x + 15",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta que pasa por A(-14,-9) y B(6,11)",
        steps: "y = x + 5",
        difficulty: "hard",
        topicId: topics[7].id,
      },
      {
        latex: "Recta con pendiente -0.625 que pasa por (8,10)",
        steps: "y = -0.625x + 15",
        difficulty: "hard",
        topicId: topics[7].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 8: RECTAS PARALELAS Y PERPENDICULARES (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "¿Son paralelas? y = 3x + 2 y y = 3x - 5",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 2x + 1 y y = -0.5x + 3",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = x + 4 y y = x - 2",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 4x + 3 y y = -0.25x + 1",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -2x + 5 y y = -2x + 1",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 3x - 2 y y = -0.33x + 4",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 5x + 7 y y = 5x",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = x + 6 y y = -x + 2",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 0.5x + 3 y y = 0.5x - 1",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 5x + 2 y y = -0.2x + 3",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -3x + 4 y y = -3x - 2",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 2x + 5 y y = -0.5x - 1",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 7x + 1 y y = 7x + 9",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 6x - 3 y y = -0.17x + 2",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -x + 8 y y = -x + 3",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 0.5x + 4 y y = -2x + 1",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 4x - 6 y y = 4x + 2",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 8x + 1 y y = -0.125x - 2",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -5x + 2 y y = -5x - 4",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 3x - 7 y y = -0.33x + 5",
        steps: "Sí",
        difficulty: "easy",
        topicId: topics[8].id,
      },

      // Medium (21-40)
      {
        latex: "¿Son paralelas? y = 2x + 1 y y = 3x + 1",
        steps: "No",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 2x + 3 y y = 2x - 1",
        steps: "No",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -3x + 5 y y = 3x + 5",
        steps: "No",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = x + 2 y y = 2x + 4",
        steps: "No",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 1.5x + 3 y y = 1.5x - 2",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 1.5x + 1 y y = -0.67x + 3",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 0.25x + 7 y y = 4x + 7",
        steps: "No",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 1.2x - 3 y y = -0.83x + 2",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -2.5x + 4 y y = -2.5x - 1",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 0.4x + 5 y y = -2.5x + 1",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 3.5x + 2 y y = 3.5x + 9",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 2.5x - 4 y y = -0.4x + 3",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -1.5x + 6 y y = 1.5x + 6",
        steps: "No",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 0.75x + 2 y y = -1.33x - 1",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 6x - 3 y y = 6x + 5",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 4x + 7 y y = -0.25x + 2",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -0.5x + 1 y y = -0.5x - 3",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 7x - 2 y y = -0.14x + 4",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 2.25x + 4 y y = 2.25x",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 0.8x + 3 y y = -1.25x - 2",
        steps: "Sí",
        difficulty: "medium",
        topicId: topics[8].id,
      },

      // Hard (41-50)
      {
        latex: "¿Son paralelas? y = 3.75x + 1 y y = 3.75x - 8",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 3.75x + 2 y y = -0.27x + 5",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -4.5x + 7 y y = -4.5x + 2",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 5.5x - 3 y y = -0.18x + 1",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 1.25x + 9 y y = 1.25x - 4",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 1.6x + 4 y y = -0.625x - 2",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = -2.75x + 3 y y = -2.75x - 5",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 6.5x + 1 y y = -0.15x + 3",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son paralelas? y = 0.125x + 6 y y = 0.125x + 1",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },
      {
        latex: "¿Son perpendiculares? y = 0.125x - 2 y y = -8x + 4",
        steps: "Sí",
        difficulty: "hard",
        topicId: topics[8].id,
      },

      // ═══════════════════════════════════════════════════════════════
      // TOPIC 9: DISTANCIA DE PUNTO A RECTA (50 exercises)
      // ═══════════════════════════════════════════════════════════════
      // Easy (1-20)
      {
        latex: "Distancia de P(2,3) a la recta x + y - 4 = 0",
        steps: "0.71",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(4,-2) a la recta 2x - y + 1 = 0",
        steps: "4.47",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-3,5) a la recta 3x + 4y - 10 = 0",
        steps: "2.2",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(1,1) a la recta x - y + 2 = 0",
        steps: "1.41",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(0,0) a la recta 3x + 4y - 5 = 0",
        steps: "1",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(5,2) a la recta x + 2y - 7 = 0",
        steps: "0.89",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-1,4) a la recta 2x + y - 3 = 0",
        steps: "0.45",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(3,3) a la recta x - 2y + 4 = 0",
        steps: "0.45",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(2,-1) a la recta 4x + 3y - 8 = 0",
        steps: "0.2",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-2,5) a la recta x + y - 2 = 0",
        steps: "0.71",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(6,1) a la recta 2x - 3y + 1 = 0",
        steps: "2.77",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-4,2) a la recta 3x + y - 5 = 0",
        steps: "2.53",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(1,6) a la recta x + 3y - 10 = 0",
        steps: "2.85",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(7,-3) a la recta 2x + y - 4 = 0",
        steps: "3.13",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-5,-1) a la recta x - y + 6 = 0",
        steps: "1.41",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(4,5) a la recta 3x - 2y - 1 = 0",
        steps: "0.55",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-3,-4) a la recta 2x + 3y + 8 = 0",
        steps: "2.77",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(8,0) a la recta x + 4y - 12 = 0",
        steps: "0.97",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(0,7) a la recta 4x - 3y + 5 = 0",
        steps: "3.2",
        difficulty: "easy",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(2,2) a la recta x + y - 6 = 0",
        steps: "1.41",
        difficulty: "easy",
        topicId: topics[9].id,
      },

      // Medium (21-40)
      {
        latex: "Distancia de P(-6,8) a la recta 5x + 2y - 15 = 0",
        steps: "2.97",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(9,-4) a la recta 3x - 4y + 7 = 0",
        steps: "8.6",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-7,3) a la recta 2x + 5y - 20 = 0",
        steps: "3.49",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(10,6) a la recta 4x - y - 30 = 0",
        steps: "2.43",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-8,-5) a la recta x + 3y + 18 = 0",
        steps: "1.58",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(11,2) a la recta 5x + y - 40 = 0",
        steps: "2.75",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-9,7) a la recta 3x - 2y + 25 = 0",
        steps: "2.77",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(12,-6) a la recta 2x + 4y - 8 = 0",
        steps: "4.47",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-10,4) a la recta x - 2y + 15 = 0",
        steps: "4.47",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(13,8) a la recta 4x + 3y - 50 = 0",
        steps: "2.2",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-11,-8) a la recta 3x + y + 30 = 0",
        steps: "1.58",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(14,1) a la recta 2x - 3y - 20 = 0",
        steps: "2.18",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-12,9) a la recta 5x - 2y + 35 = 0",
        steps: "3.28",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(15,-7) a la recta x + 5y + 10 = 0",
        steps: "4.24",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-13,5) a la recta 4x + y - 45 = 0",
        steps: "2.19",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(16,3) a la recta 3x - 4y - 35 = 0",
        steps: "2.2",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-14,-9) a la recta 2x + 3y + 40 = 0",
        steps: "2.49",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(17,10) a la recta 5x + 4y - 80 = 0",
        steps: "2.35",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-15,6) a la recta x - 4y + 50 = 0",
        steps: "3.65",
        difficulty: "medium",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(18,-8) a la recta 3x + 2y - 30 = 0",
        steps: "5.54",
        difficulty: "medium",
        topicId: topics[9].id,
      },

      // Hard (41-50)
      {
        latex: "Distancia de P(-16,12) a la recta 6x - y + 55 = 0",
        steps: "4.73",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(19,-10) a la recta 4x + 5y - 45 = 0",
        steps: "5.09",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-17,-11) a la recta 5x + 3y + 70 = 0",
        steps: "4.21",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(20,7) a la recta 3x - 5y - 60 = 0",
        steps: "4.12",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-18,13) a la recta 7x + 2y - 75 = 0",
        steps: "5.84",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(21,-12) a la recta 2x + 6y + 50 = 0",
        steps: "4.43",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-19,9) a la recta 4x - 3y + 80 = 0",
        steps: "3.8",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(22,14) a la recta 6x + 5y - 120 = 0",
        steps: "5.09",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(-20,-13) a la recta 5x + 4y + 90 = 0",
        steps: "5.57",
        difficulty: "hard",
        topicId: topics[9].id,
      },
      {
        latex: "Distancia de P(23,11) a la recta 7x - 3y - 100 = 0",
        steps: "6.58",
        difficulty: "hard",
        topicId: topics[9].id,
      },
    ],
  });

  console.log("Database seeded successfully!");
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
