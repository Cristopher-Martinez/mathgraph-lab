import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Agrega datos socráticos a ejercicios existentes.
 * Se ejecuta después de la migración que agrega la columna `socratic`.
 */
async function main() {
  console.log("Agregando datos socráticos a ejercicios...");

  // Mapeo: question → socratic steps
  const socraticData: Record<string, any[]> = {
    // ─── Desigualdades con Valor Absoluto ───
    "|x - 4| ≤ 6": [
      {
        question: "¿Qué propiedad se aplica cuando tenemos |A| ≤ B?",
        expected: "-B ≤ A ≤ B",
        hints: [
          "Recuerda la definición de valor absoluto como distancia.",
          "Si |A| ≤ B, entonces A está entre -B y B.",
          "-B ≤ A ≤ B",
        ],
      },
      {
        question: "Escribe la doble desigualdad para |x - 4| ≤ 6.",
        expected: "-6 ≤ x - 4 ≤ 6",
        hints: [
          "Sustituye A = x - 4 y B = 6.",
          "-6 ≤ x - 4 ≤ 6.",
          "-6 ≤ x - 4 ≤ 6",
        ],
      },
      {
        question: "Suma 4 a todos los miembros. ¿Cuál es la solución?",
        expected: "-2 ≤ x ≤ 10",
        hints: ["Suma 4 a cada parte.", "-6+4 ≤ x ≤ 6+4.", "-2 ≤ x ≤ 10"],
      },
    ],

    "|2x + 3| > 5": [
      {
        question: "¿Qué propiedad se aplica con |A| > B?",
        expected: "A > B o A < -B",
        hints: [
          "El valor absoluto mayor que un número genera dos casos.",
          "Se divide en dos desigualdades separadas por 'o'.",
          "A > B o A < -B",
        ],
      },
      {
        question: "¿Qué dos desigualdades resultan?",
        expected: "2x + 3 > 5 o 2x + 3 < -5",
        hints: [
          "Sustituye A = 2x+3 y B = 5.",
          "2x + 3 > 5 o 2x + 3 < -5.",
          "2x + 3 > 5 o 2x + 3 < -5",
        ],
      },
      {
        question: "Resuelve 2x + 3 > 5.",
        expected: "x > 1",
        hints: ["Resta 3: 2x > 2, divide entre 2.", "x > 1.", "x > 1"],
      },
      {
        question: "Resuelve 2x + 3 < -5.",
        expected: "x < -4",
        hints: ["Resta 3: 2x < -8, divide entre 2.", "x < -4.", "x < -4"],
      },
    ],

    // ─── Desigualdades Cuadráticas ───
    "x² - 9 ≥ 0": [
      {
        question: "¿Cómo puedes factorizar x² - 9?",
        expected: "(x - 3)(x + 3)",
        hints: [
          "Es una diferencia de cuadrados: a² - b².",
          "a² - b² = (a-b)(a+b), con a=x y b=3.",
          "(x - 3)(x + 3)",
        ],
      },
      {
        question: "¿Cuáles son las raíces de x² - 9 = 0?",
        expected: "x = 3 y x = -3",
        hints: [
          "Iguala cada factor a cero.",
          "x - 3 = 0 → x = 3, x + 3 = 0 → x = -3.",
          "x = 3 y x = -3",
        ],
      },
      {
        question:
          "Usando la tabla de signos, ¿en qué intervalos el producto es ≥ 0?",
        expected: "(-∞, -3] ∪ [3, ∞)",
        hints: [
          "Evalúa el signo del producto en cada intervalo.",
          "El producto es positivo fuera de las raíces.",
          "(-∞, -3] ∪ [3, ∞)",
        ],
      },
    ],

    "x² - 5x + 6 ≤ 0": [
      {
        question: "¿Cómo factorizas x² - 5x + 6?",
        expected: "(x - 2)(x - 3)",
        hints: [
          "Busca dos números que multipliquen 6 y sumen -5.",
          "-2 y -3: (-2)(-3)=6, (-2)+(-3)=-5.",
          "(x - 2)(x - 3)",
        ],
      },
      {
        question: "¿Cuáles son las raíces?",
        expected: "x = 2 y x = 3",
        hints: [
          "Iguala cada factor a cero.",
          "x = 2 y x = 3.",
          "x = 2 y x = 3",
        ],
      },
      {
        question: "¿En qué intervalo el producto es ≤ 0?",
        expected: "[2, 3]",
        hints: [
          "El producto es negativo entre las raíces.",
          "Entre 2 y 3, incluyendo los extremos.",
          "[2, 3]",
        ],
      },
    ],

    "2x² - 8 ≥ 0": [
      {
        question: "¿Cómo puedes simplificar 2x² - 8 ≥ 0?",
        expected: "x² - 4 ≥ 0",
        hints: [
          "Divide toda la desigualdad entre 2.",
          "2x²/2 - 8/2 ≥ 0.",
          "x² - 4 ≥ 0",
        ],
      },
      {
        question: "Factoriza x² - 4.",
        expected: "(x - 2)(x + 2)",
        hints: [
          "Es una diferencia de cuadrados.",
          "x² - 4 = (x-2)(x+2).",
          "(x - 2)(x + 2)",
        ],
      },
      {
        question: "¿Cuál es la solución?",
        expected: "(-∞, -2] ∪ [2, ∞)",
        hints: [
          "El producto es positivo fuera de las raíces.",
          "x ≤ -2 o x ≥ 2.",
          "(-∞, -2] ∪ [2, ∞)",
        ],
      },
    ],

    // ─── Distancia ───
    "Encuentra la distancia entre A(1,2) y B(4,6)": [
      {
        question: "¿Cuál es la fórmula de la distancia entre dos puntos?",
        expected: "d = √((x₂-x₁)² + (y₂-y₁)²)",
        hints: [
          "Piensa en el teorema de Pitágoras aplicado al plano cartesiano.",
          "d = raíz cuadrada de la suma de diferencias al cuadrado.",
          "d = √((x₂-x₁)² + (y₂-y₁)²)",
        ],
      },
      {
        question:
          "Sustituye los puntos A(1,2) y B(4,6). ¿Qué obtienes dentro de la raíz?",
        expected: "9 + 16 = 25",
        hints: [
          "Calcula (4-1)² y (6-2)².",
          "3² + 4² = 9 + 16 = 25.",
          "9 + 16 = 25",
        ],
      },
      {
        question: "¿Cuál es √25?",
        expected: "5",
        hints: ["¿Qué número al cuadrado da 25?", "5 × 5 = 25.", "5"],
      },
    ],

    "Encuentra la distancia entre A(0,0) y B(7,24)": [
      {
        question:
          "Aplica la fórmula de distancia con A(0,0) y B(7,24). ¿Qué hay dentro de la raíz?",
        expected: "49 + 576 = 625",
        hints: [
          "Calcula (7-0)² y (24-0)².",
          "7² + 24² = 49 + 576 = 625.",
          "49 + 576 = 625",
        ],
      },
      {
        question: "¿Cuál es √625?",
        expected: "25",
        hints: ["¿Qué número al cuadrado da 625?", "25 × 25 = 625.", "25"],
      },
    ],

    // ─── Punto Medio ───
    "Encuentra el punto medio entre A(2,3) y B(6,7)": [
      {
        question: "¿Cuál es la fórmula del punto medio?",
        expected: "M = ((x₁+x₂)/2, (y₁+y₂)/2)",
        hints: [
          "El punto medio es el promedio de las coordenadas.",
          "Se suman las coordenadas y se dividen entre 2.",
          "M = ((x₁+x₂)/2, (y₁+y₂)/2)",
        ],
      },
      {
        question: "Calcula la coordenada x: (2+6)/2.",
        expected: "4",
        hints: ["2 + 6 = 8.", "8/2 = 4.", "4"],
      },
      {
        question: "Calcula la coordenada y: (3+7)/2.",
        expected: "5",
        hints: ["3 + 7 = 10.", "10/2 = 5.", "5"],
      },
    ],

    // ─── Pendiente ───
    "Encuentra la pendiente de la recta que pasa por A(2,3) y B(6,7)": [
      {
        question: "¿Cuál es la fórmula de la pendiente?",
        expected: "m = (y₂-y₁)/(x₂-x₁)",
        hints: [
          "La pendiente mide el cambio vertical entre el cambio horizontal.",
          "m = Δy / Δx.",
          "m = (y₂-y₁)/(x₂-x₁)",
        ],
      },
      {
        question: "Sustituye A(2,3) y B(6,7). ¿Cuánto es la pendiente?",
        expected: "1",
        hints: ["(7-3)/(6-2) = 4/4.", "4/4 = 1.", "1"],
      },
    ],

    // ─── Ecuación de Recta ───
    "Encuentra la ecuación de la recta que pasa por A(2,3) y B(6,5)": [
      {
        question:
          "¿Cuál es el primer paso para encontrar la ecuación de una recta dados dos puntos?",
        expected: "Calcular la pendiente",
        hints: [
          "Necesitas conocer la pendiente antes de escribir la ecuación.",
          "Usa m = (y₂-y₁)/(x₂-x₁).",
          "Calcular la pendiente",
        ],
      },
      {
        question: "Calcula la pendiente con A(2,3) y B(6,5).",
        expected: "0.5",
        hints: ["(5-3)/(6-2) = 2/4.", "2/4 = 0.5.", "0.5"],
      },
      {
        question:
          "Usando y = mx + b con m=0.5 y el punto (2,3), ¿cuánto vale b?",
        expected: "2",
        hints: ["Sustituye: 3 = 0.5(2) + b.", "3 = 1 + b → b = 2.", "2"],
      },
      {
        question: "¿Cuál es la ecuación final?",
        expected: "y = 0.5x + 2",
        hints: [
          "Sustituye m y b en y = mx + b.",
          "y = 0.5x + 2.",
          "y = 0.5x + 2",
        ],
      },
    ],

    // ─── Desigualdades Lineales ───
    "3x - 5 > 7": [
      {
        question: "¿Cuál es el primer paso para resolver 3x - 5 > 7?",
        expected: "Sumar 5 a ambos lados",
        hints: [
          "Necesitas aislar el término con x.",
          "Mueve el -5 al otro lado sumando 5.",
          "Sumar 5 a ambos lados",
        ],
      },
      {
        question: "Después de sumar 5, ¿qué desigualdad obtienes?",
        expected: "3x > 12",
        hints: ["7 + 5 = 12.", "3x > 12.", "3x > 12"],
      },
      {
        question: "Divide entre 3. ¿Cuál es la solución?",
        expected: "x > 4",
        hints: [
          "12/3 = 4, y como 3 es positivo el signo no cambia.",
          "x > 4.",
          "x > 4",
        ],
      },
    ],

    "7 - 2x > 3x + 2": [
      {
        question: "Mueve los términos con x al mismo lado. ¿Qué obtienes?",
        expected: "5 > 5x",
        hints: [
          "Resta 3x de ambos lados y resta 2.",
          "7 - 2 > 3x + 2x → 5 > 5x.",
          "5 > 5x",
        ],
      },
      {
        question: "Divide entre 5. ¿Cuál es la solución?",
        expected: "x < 1",
        hints: ["5/5 = 1.", "1 > x, es decir x < 1.", "x < 1"],
      },
    ],

    "x² + 4x + 3 > 0": [
      {
        question: "¿Cómo factorizas x² + 4x + 3?",
        expected: "(x + 1)(x + 3)",
        hints: [
          "Busca dos números que multipliquen 3 y sumen 4.",
          "1 y 3: 1×3=3, 1+3=4.",
          "(x + 1)(x + 3)",
        ],
      },
      {
        question: "¿Cuáles son las raíces?",
        expected: "x = -1 y x = -3",
        hints: [
          "Iguala cada factor a cero.",
          "x + 1 = 0 → x = -1, x + 3 = 0 → x = -3.",
          "x = -1 y x = -3",
        ],
      },
      {
        question: "¿En qué intervalos el producto es > 0?",
        expected: "(-∞, -3) ∪ (-1, ∞)",
        hints: [
          "El producto es positivo fuera de las raíces.",
          "x < -3 o x > -1.",
          "(-∞, -3) ∪ (-1, ∞)",
        ],
      },
    ],
  };

  let updated = 0;
  for (const [questionText, steps] of Object.entries(socraticData)) {
    const exercises = await prisma.exercise.findMany({
      where: { latex: questionText },
    });

    for (const ex of exercises) {
      await prisma.exercise.update({
        where: { id: ex.id },
        data: { socratic: JSON.stringify(steps) },
      });
      updated++;
    }
  }

  console.log(`Se actualizaron ${updated} ejercicios con datos socráticos.`);
}

main()
  .catch((e) => {
    console.error("Error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
