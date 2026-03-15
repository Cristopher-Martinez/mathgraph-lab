import { GoogleGenerativeAI } from "@google/generative-ai";
import prisma from "../prismaClient";
import { generarEjercicios } from "./exerciseGeneration";
import {
  completeGeneration,
  startGeneration,
  updateStep,
} from "./generationStatus";

/**
 * Normaliza el nombre de un tema para consistencia
 */
function normalizeTopicName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Calcula similitud entre dos strings normalizados (coeficiente de Dice con bigramas)
 */
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  const bigramsB = new Set<string>();
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let intersection = 0;
  for (const bg of bigramsA) {
    if (bigramsB.has(bg)) intersection++;
  }
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}

/** Umbral de similitud para considerar dos temas como el mismo */
const SIMILARITY_THRESHOLD = 0.65;

/**
 * Busca un tema existente en la BD que sea suficientemente similar al nombre dado.
 * Primero intenta coincidencia exacta, luego fuzzy.
 */
async function findExistingTopic(
  normalizedName: string,
): Promise<{ id: number; name: string } | null> {
  // 1. Coincidencia exacta
  const exact = await prisma.topic.findUnique({
    where: { name: normalizedName },
  });
  if (exact) return { id: exact.id, name: exact.name };

  // 2. Búsqueda fuzzy contra todos los topics existentes
  const allTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
  });
  let bestMatch: { id: number; name: string; score: number } | null = null;

  for (const t of allTopics) {
    const score = similarity(normalizedName, t.name);
    if (
      score >= SIMILARITY_THRESHOLD &&
      (!bestMatch || score > bestMatch.score)
    ) {
      bestMatch = { id: t.id, name: t.name, score };
    }
  }

  if (bestMatch) {
    console.log(
      `[Dedup] "${normalizedName}" → coincide con "${bestMatch.name}" (similitud: ${(bestMatch.score * 100).toFixed(0)}%)`,
    );
    return { id: bestMatch.id, name: bestMatch.name };
  }

  return null;
}

/**
 * Propaga automáticamente los cambios de una clase a Topics, Exercises y DAG.
 *
 * Sistema de deduplicación y refuerzo:
 * - Si un tema ya existe (exacto o similar), NO lo crea de nuevo.
 * - En su lugar, genera ejercicios de REFUERZO para ese tema existente.
 * - Los ejercicios de refuerzo se marcan con generatedByClassId de la nueva clase.
 */
export async function propagateClassChanges(classId: number) {
  console.log(`[AutoPropagation] Iniciando propagación para clase ${classId}`);

  const classLog = await prisma.classLog.findUnique({
    where: { id: classId },
  });

  if (!classLog) {
    throw new Error(`Clase ${classId} no encontrada`);
  }

  // Parsear temas detectados
  const temasRaw = classLog.topics ? JSON.parse(classLog.topics) : [];
  if (!Array.isArray(temasRaw) || temasRaw.length === 0) {
    console.log(
      `[AutoPropagation] No hay temas para propagar en clase ${classId}`,
    );
    return;
  }

  const temasNormalizados = temasRaw.map(normalizeTopicName);

  // Filtrar temas no académicos (administrativos, logísticos, organizacionales)
  const NON_ACADEMIC_PATTERNS = [
    /introducci[oó]n al curso/,
    /reglas del curso/,
    /uso de celular/,
    /calculadora/,
    /asistencia/,
    /pol[ií]tica/,
    /evaluaci[oó]n del curso/,
    /sistema de (evaluaci[oó]n|calificaci[oó]n)/,
    /presentaci[oó]n del (profesor|curso|materia)/,
    /materiales? necesarios?/,
    /horarios?( de clase)?$/,
    /programa del curso/,
    /bibliograf[ií]a/,
    /criterios de evaluaci[oó]n/,
  ];

  const temas = temasNormalizados.filter((tema) => {
    const isNonAcademic = NON_ACADEMIC_PATTERNS.some((pat) => pat.test(tema));
    if (isNonAcademic) {
      console.log(`[AutoPropagation] Tema filtrado (no académico): "${tema}"`);
    }
    return !isNonAcademic;
  });

  if (temas.length === 0) {
    console.log(
      `[AutoPropagation] Todos los temas fueron filtrados como no académicos para clase ${classId}`,
    );
    return;
  }

  // Inicializar tracking de estado
  await startGeneration(classId, temas);

  // 1. Resolver topics con deduplicación
  await updateStep(classId, "Creando temas", "running");
  const topicResults: {
    id: number;
    name: string;
    isNew: boolean;
    originalName: string;
  }[] = [];

  for (const tema of temas) {
    const existing = await findExistingTopic(tema);

    if (existing) {
      topicResults.push({
        id: existing.id,
        name: existing.name,
        isNew: false,
        originalName: tema,
      });
      console.log(
        `[AutoPropagation] Tema existente: "${tema}" → #${existing.id} "${existing.name}"`,
      );
    } else {
      const newTopic = await prisma.topic.create({
        data: { name: tema, createdByClassId: classId },
      });
      topicResults.push({
        id: newTopic.id,
        name: tema,
        isNew: true,
        originalName: tema,
      });
      console.log(
        `[AutoPropagation] Nuevo tema creado: "${tema}" (id: ${newTopic.id})`,
      );
    }
  }

  const nuevos = topicResults.filter((t) => t.isNew);
  const existentes = topicResults.filter((t) => !t.isNew);
  console.log(
    `[AutoPropagation] Temas: ${nuevos.length} nuevos, ${existentes.length} existentes (refuerzo)`,
  );
  await updateStep(
    classId,
    "Creando temas",
    "done",
    `${nuevos.length} nuevos, ${existentes.length} existentes`,
  );

  // 2. Generar ejercicios — nuevos para topics nuevos, refuerzo para existentes
  const resultadosGeneracion: {
    topic: string;
    generados: number;
    tipo: "nuevo" | "refuerzo";
    error?: string;
  }[] = [];

  for (const topicInfo of topicResults) {
    // Verificar si ya se generaron ejercicios para este topic desde ESTA clase
    const yaGenerados = await prisma.exercise.count({
      where: { topicId: topicInfo.id, generatedByClassId: classId },
    });
    if (yaGenerados > 0) {
      console.log(
        `[AutoPropagation] Ejercicios ya generados para "${topicInfo.name}" desde clase ${classId}, omitiendo`,
      );
      resultadosGeneracion.push({
        topic: topicInfo.name,
        generados: yaGenerados,
        tipo: topicInfo.isNew ? "nuevo" : "refuerzo",
      });
      continue;
    }

    // Contar ejercicios existentes del tema para decidir cantidad de refuerzo
    const ejerciciosExistentes = await prisma.exercise.count({
      where: { topicId: topicInfo.id },
    });

    // Refuerzo: generar menos ejercicios si ya hay muchos
    const cantidadPorDificultad = topicInfo.isNew
      ? 5 // Tema nuevo: 5 por dificultad = 15 total
      : Math.max(
          2,
          Math.min(3, Math.ceil(10 / Math.max(1, ejerciciosExistentes / 10))),
        );
    // Refuerzo: 2-3 por dificultad = 6-9 adicionales

    const tipoGeneracion = topicInfo.isNew ? "nuevo" : "refuerzo";
    const stepLabel = `Ejercicios: ${topicInfo.originalName}`;
    await updateStep(classId, stepLabel, "running");

    try {
      console.log(
        `[AutoPropagation] Generando ejercicios de ${tipoGeneracion} para "${topicInfo.name}" ` +
          `(${cantidadPorDificultad}/dificultad, ${ejerciciosExistentes} existentes)`,
      );

      const resultado = await generarEjercicios(
        [topicInfo.name],
        cantidadPorDificultad,
      );
      const ejerciciosValidos = resultado.ejercicios.filter(
        (ej) => ej.pregunta.trim().length >= 5,
      );

      if (ejerciciosValidos.length === 0) {
        console.warn(
          `[AutoPropagation] IA retornó 0 ejercicios válidos para ${topicInfo.name}`,
        );
        resultadosGeneracion.push({
          topic: topicInfo.name,
          generados: 0,
          tipo: tipoGeneracion,
          error: "0 ejercicios válidos",
        });
        continue;
      }

      const diffMap: Record<string, string> = {
        facil: "easy",
        medio: "medium",
        dificil: "hard",
      };
      const data = ejerciciosValidos.map((ej) => ({
        topicId: topicInfo.id,
        latex: ej.pregunta,
        difficulty: diffMap[ej.dificultad] || ej.dificultad,
        steps: ej.solucion || null,
        hints: ej.pistas ? JSON.stringify(ej.pistas) : null,
        generatedByClassId: classId,
      }));

      await prisma.exercise.createMany({ data });

      console.log(
        `[AutoPropagation] ✓ ${tipoGeneracion.toUpperCase()}: ${data.length} ejercicios para "${topicInfo.name}"` +
          (resultado.stats
            ? ` (${resultado.stats.exitosos}/${resultado.stats.intentos} lotes OK, ${resultado.stats.tiempoMs}ms)`
            : ""),
      );
      resultadosGeneracion.push({
        topic: topicInfo.name,
        generados: data.length,
        tipo: tipoGeneracion,
      });
      await updateStep(classId, stepLabel, "done", `${data.length} ejercicios`);
    } catch (err: any) {
      console.error(
        `[AutoPropagation] ✗ Error generando ejercicios para ${topicInfo.name}: ${err.message}`,
      );
      resultadosGeneracion.push({
        topic: topicInfo.name,
        generados: 0,
        tipo: tipoGeneracion,
        error: err.message,
      });
      await updateStep(classId, stepLabel, "error", err.message);
    }
  }

  // Resumen
  const totalGenerados = resultadosGeneracion.reduce(
    (s, r) => s + r.generados,
    0,
  );
  const totalNuevos = resultadosGeneracion
    .filter((r) => r.tipo === "nuevo")
    .reduce((s, r) => s + r.generados, 0);
  const totalRefuerzo = resultadosGeneracion
    .filter((r) => r.tipo === "refuerzo")
    .reduce((s, r) => s + r.generados, 0);
  const totalFallidos = resultadosGeneracion.filter((r) => r.error).length;
  console.log(
    `[AutoPropagation] Resumen: ${totalGenerados} ejercicios (${totalNuevos} nuevos + ${totalRefuerzo} refuerzo), ` +
      `${totalFallidos} fallidos de ${resultadosGeneracion.length} temas`,
  );

  // 3. Actualizar DAG
  await updateStep(classId, "Reconstruyendo DAG", "running");
  await rebuildDAG();
  await updateStep(classId, "Reconstruyendo DAG", "done");
  await updateStep(classId, "Auditando DAG", "done");

  // Generar apuntes en background
  await updateStep(classId, "Generando apuntes", "running");
  try {
    const cls = await prisma.classLog.findUnique({
      where: { id: classId },
      select: {
        chunks: { select: { text: true }, orderBy: { index: "asc" } },
        notes: { select: { id: true } },
      },
    });
    const apiKey = process.env.GEMINI_API_KEY;
    if (cls && cls.chunks.length > 0 && cls.notes.length === 0 && apiKey) {
      const { generateNotesForClass } = await import("../routes/notes");
      const apuntes = await generateNotesForClass(classId, cls.chunks, apiKey);
      if (apuntes.length > 0) {
        await prisma.classNote.createMany({
          data: apuntes.map((a: any) => ({
            classId,
            titulo: a.titulo,
            contenido: a.contenido,
            categoria: a.categoria,
          })),
        });
      }
      await updateStep(
        classId,
        "Generando apuntes",
        "done",
        `${apuntes.length} apuntes`,
      );
    } else {
      await updateStep(classId, "Generando apuntes", "done", "omitido");
    }
  } catch (err: any) {
    console.error(`[AutoPropagation] Error generando apuntes: ${err.message}`);
    await updateStep(classId, "Generando apuntes", "error", err.message);
  }

  await completeGeneration(classId);
  console.log(`[AutoPropagation] Propagación completada para clase ${classId}`);
}

/**
 * Reconstruye las dependencias del DAG usando IA para inferir prerrequisitos reales.
 * Si no hay API key, usa heurística de orden cronológico.
 */
async function rebuildDAG() {
  console.log(`[AutoPropagation] Reconstruyendo DAG`);

  const allTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
  });

  if (allTopics.length < 2) {
    console.log(`[AutoPropagation] Menos de 2 temas, nada que conectar`);
    return;
  }

  // Limpiar dependencias existentes
  await prisma.topicDependency.deleteMany({});

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    await buildLinearDAG(allTopics);
  } else {
    try {
      const topicNames = allTopics.map((t) => t.name);
      const deps = await inferDependenciesWithAI(topicNames);
      await saveDependencies(deps, allTopics);
    } catch (err: any) {
      console.warn(
        `[AutoPropagation] IA falló para DAG, usando heurística: ${err.message}`,
      );
      await buildLinearDAG(allTopics);
    }
  }

  // Auditar y corregir nodos huérfanos
  await auditDAG();

  console.log(`[AutoPropagation] DAG reconstruido y auditado`);
}

/**
 * Infiere dependencias matemáticas reales entre temas usando Gemini.
 * El prompt fuerza que TODOS los temas estén conectados (la matemática siempre se relaciona).
 */
async function inferDependenciesWithAI(
  topicNames: string[],
): Promise<{ padre: string; hijo: string }[]> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
  });

  const prompt = `Eres un experto en pedagogía matemática. Dados estos temas de un curso de matemáticas, construye un grafo de dependencias COMPLETO y CONECTADO.

Temas del curso:
${topicNames.map((t, i) => `${i + 1}. ${t}`).join("\n")}

REGLAS ESTRICTAS:
- Una dependencia "A → B" significa "para entender B se necesita saber A primero"
- Solo crea dependencias directas (no transitivas)
- Un tema puede tener múltiples prerrequisitos y múltiples dependientes
- SOLO UN tema puede ser raíz (el más fundamental de todos). Los demás DEBEN tener al menos un prerrequisito.
- TODOS los temas deben estar conectados al grafo. NO puede haber temas aislados o huérfanos.
- La matemática siempre se relaciona: si un tema parece no tener conexión directa, busca el concepto matemático subyacente que lo conecta con los demás.
- Piensa en el orden pedagógico: ¿qué necesita saber un estudiante antes de abordar cada tema?
- Usa los nombres EXACTOS de la lista

VERIFICACIÓN: Antes de responder, confirma que cada uno de los ${topicNames.length} temas aparece al menos una vez en tus dependencias (como padre o como hijo).

Responde SOLO con JSON válido:
{
  "raiz": "nombre del tema más fundamental",
  "dependencias": [
    { "padre": "nombre exacto del prerrequisito", "hijo": "nombre exacto del tema que depende" }
  ]
}`;

  const result = await model.generateContent(prompt);
  const texto = result.response.text();

  let jsonStr = "";
  const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
  }

  if (!jsonStr) return [];

  const parsed = JSON.parse(jsonStr);
  return (parsed.dependencias || []).filter(
    (d: any) => typeof d.padre === "string" && typeof d.hijo === "string",
  );
}

/**
 * Guarda las dependencias en la BD, haciendo match fuzzy con los topics existentes.
 */
async function saveDependencies(
  deps: { padre: string; hijo: string }[],
  allTopics: { id: number; name: string }[],
) {
  const nameToId = new Map<string, number>();
  for (const t of allTopics) {
    nameToId.set(t.name, t.id);
  }

  // Match fuzzy helper
  const findTopicId = (name: string): number | null => {
    const normalized = name.trim().toLowerCase().replace(/\s+/g, " ");
    // Exact match first
    for (const t of allTopics) {
      if (t.name === normalized) return t.id;
    }
    // Fuzzy match
    let best: { id: number; score: number } | null = null;
    for (const t of allTopics) {
      const score = similarity(normalized, t.name);
      if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
        best = { id: t.id, score };
      }
    }
    return best?.id ?? null;
  };

  let created = 0;
  for (const dep of deps) {
    const parentId = findTopicId(dep.padre);
    const childId = findTopicId(dep.hijo);
    if (parentId && childId && parentId !== childId) {
      try {
        await prisma.topicDependency.create({
          data: { parentId, childId },
        });
        created++;
      } catch {
        // Silently skip duplicates (unique constraint)
      }
    }
  }
  console.log(`[AutoPropagation] ${created} dependencias creadas por IA`);
}

/**
 * Audita el DAG para detectar y corregir nodos huérfanos (sin ninguna conexión).
 * Si la IA dejó temas sin conectar, los conecta al nodo más relacionado usando similitud.
 * Si no hay API key, conecta huérfanos al nodo raíz o al primer nodo conectado.
 */
export async function auditDAG() {
  const allTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
  });
  const allDeps = await prisma.topicDependency.findMany();

  // Encontrar nodos conectados (aparecen como padre o hijo)
  const connectedIds = new Set<number>();
  for (const d of allDeps) {
    connectedIds.add(d.parentId);
    connectedIds.add(d.childId);
  }

  // Encontrar huérfanos
  const orphans = allTopics.filter((t) => !connectedIds.has(t.id));

  if (orphans.length === 0) {
    console.log(
      `[AuditDAG] ✓ Todos los ${allTopics.length} temas están conectados`,
    );
    return;
  }

  console.log(
    `[AuditDAG] ⚠ ${orphans.length} tema(s) huérfano(s) detectado(s): ${orphans.map((o) => o.name).join(", ")}`,
  );

  // Encontrar nodos raíz (solo aparecen como padre, nunca como hijo)
  const childIds = new Set(allDeps.map((d) => d.childId));
  const connectedTopics = allTopics.filter((t) => connectedIds.has(t.id));
  const roots = connectedTopics.filter((t) => !childIds.has(t.id));

  // Usar IA si hay API key para conectar los huérfanos de forma inteligente
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && connectedTopics.length > 0) {
    try {
      await connectOrphansWithAI(orphans, connectedTopics, allDeps, allTopics);
      return;
    } catch (err: any) {
      console.warn(
        `[AuditDAG] IA falló para conectar huérfanos: ${err.message}, usando heurística`,
      );
    }
  }

  // Fallback heurístico: conectar huérfanos al nodo más similar entre los conectados
  const anchor = roots[0] || connectedTopics[0];
  if (!anchor) {
    // No hay nodos conectados aún — crear cadena entre todos los huérfanos
    for (let i = 0; i < orphans.length - 1; i++) {
      try {
        await prisma.topicDependency.create({
          data: { parentId: orphans[i].id, childId: orphans[i + 1].id },
        });
      } catch {}
    }
    console.log(`[AuditDAG] ${orphans.length} huérfanos encadenados entre sí`);
    return;
  }

  let connected = 0;
  for (const orphan of orphans) {
    // Buscar el tema conectado más similar por nombre
    let bestMatch = anchor;
    let bestScore = 0;
    for (const ct of connectedTopics) {
      const score = similarity(orphan.name, ct.name);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = ct;
      }
    }

    // Determinar dirección: ¿el huérfano es más básico o más avanzado?
    // Heurística: si el nombre del huérfano contiene palabras como "básico", "fundamento", "introducción"
    // es más probable que sea prerrequisito
    const basicKeywords = [
      "básic",
      "fundament",
      "introduc",
      "nocion",
      "concept",
      "definic",
      "operacion",
      "número",
      "conjunt",
    ];
    const isBasic = basicKeywords.some((kw) => orphan.name.includes(kw));

    try {
      if (isBasic) {
        // Huérfano es prerrequisito del matched
        await prisma.topicDependency.create({
          data: { parentId: orphan.id, childId: bestMatch.id },
        });
      } else {
        // Huérfano depende del matched
        await prisma.topicDependency.create({
          data: { parentId: bestMatch.id, childId: orphan.id },
        });
      }
      connected++;
    } catch {
      /* skip duplicates */
    }
  }
  console.log(`[AuditDAG] ${connected} huérfanos conectados por heurística`);
}

/**
 * Usa IA para conectar temas huérfanos al DAG existente de forma pedagógicamente correcta.
 */
async function connectOrphansWithAI(
  orphans: { id: number; name: string }[],
  connectedTopics: { id: number; name: string }[],
  existingDeps: { parentId: number; childId: number }[],
  allTopics: { id: number; name: string }[],
) {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  });

  const depsText = existingDeps
    .slice(0, 50)
    .map((d) => {
      const parent = allTopics.find((t) => t.id === d.parentId)?.name || "?";
      const child = allTopics.find((t) => t.id === d.childId)?.name || "?";
      return `"${parent}" → "${child}"`;
    })
    .join("\n");

  const prompt = `Eres un experto en pedagogía matemática. Hay temas huérfanos (sin conexión) en un DAG de aprendizaje que necesitan conectarse.

TEMAS HUÉRFANOS (necesitan conectarse):
${orphans.map((o) => `- "${o.name}"`).join("\n")}

TEMAS YA CONECTADOS EN EL DAG:
${connectedTopics.map((t) => `- "${t.name}"`).join("\n")}

DEPENDENCIAS ACTUALES:
${depsText}

Para CADA tema huérfano, indica a qué tema(s) del DAG debe conectarse y en qué dirección.
La matemática siempre se relaciona — encuentra la conexión pedagógica real.

Responde SOLO con JSON válido:
{
  "conexiones": [
    { "padre": "nombre del prerrequisito", "hijo": "nombre del tema que depende" }
  ]
}

Reglas:
- Cada huérfano debe aparecer al menos una vez (como padre o hijo)
- Usa los nombres EXACTOS de las listas
- Un prerrequisito "padre" es lo que se debe saber ANTES del "hijo"`;

  const result = await model.generateContent(prompt);
  const texto = result.response.text();

  let jsonStr = "";
  const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
  }

  if (!jsonStr) throw new Error("IA no retornó JSON");

  const parsed = JSON.parse(jsonStr);
  const conexiones: { padre: string; hijo: string }[] = parsed.conexiones || [];

  let connected = 0;
  for (const con of conexiones) {
    const parentId = findTopicIdInList(con.padre, allTopics);
    const childId = findTopicIdInList(con.hijo, allTopics);
    if (parentId && childId && parentId !== childId) {
      try {
        await prisma.topicDependency.create({
          data: { parentId, childId },
        });
        connected++;
      } catch {
        /* skip duplicates */
      }
    }
  }
  console.log(`[AuditDAG] ${connected} huérfanos conectados por IA`);
}

/**
 * Fallback: DAG lineal basado en orden cronológico de aparición de temas.
 */
async function buildLinearDAG(allTopics: { id: number; name: string }[]) {
  const classLogs = await prisma.classLog.findMany({
    orderBy: { date: "asc" },
    select: { topics: true },
  });

  const ordered: string[] = [];
  for (const cl of classLogs) {
    const temas = cl.topics ? JSON.parse(cl.topics) : [];
    if (Array.isArray(temas)) {
      for (const t of temas.map(normalizeTopicName)) {
        if (!ordered.includes(t)) ordered.push(t);
      }
    }
  }

  // Agregar topics que no aparecen en clases (del seed)
  for (const t of allTopics) {
    if (!ordered.includes(t.name)) ordered.push(t.name);
  }

  const nameToId = new Map(allTopics.map((t) => [t.name, t.id]));
  let created = 0;

  for (let i = 0; i < ordered.length - 1; i++) {
    const parentId = nameToId.get(ordered[i]);
    const childId = nameToId.get(ordered[i + 1]);
    if (parentId && childId) {
      try {
        await prisma.topicDependency.create({
          data: { parentId, childId },
        });
        created++;
      } catch {
        /* skip duplicates */
      }
    }
  }
  console.log(
    `[AutoPropagation] ${created} dependencias lineales creadas (fallback)`,
  );
}

/**
 * Extiende el DAG buscando prerrequisitos más profundos con IA.
 * Crea nuevos topics y genera ejercicios para ellos.
 * Retorna los nuevos topics y dependencias creados.
 */
export async function extendDAG(): Promise<{
  newTopics: { id: number; name: string }[];
  newDependencies: number;
  newExercises: number;
}> {
  console.log(`[ExtendDAG] Iniciando extensión del DAG`);

  const existingTopics = await prisma.topic.findMany({
    select: { id: true, name: true },
    orderBy: { id: "asc" },
  });

  if (existingTopics.length === 0) {
    return { newTopics: [], newDependencies: 0, newExercises: 0 };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY necesaria para extender DAG");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
  });

  // Obtener dependencias actuales para contexto
  const existingDeps = await prisma.topicDependency.findMany();
  const depsText =
    existingDeps.length > 0
      ? existingDeps
          .map((d) => {
            const parent =
              existingTopics.find((t) => t.id === d.parentId)?.name || "?";
            const child =
              existingTopics.find((t) => t.id === d.childId)?.name || "?";
            return `${parent} → ${child}`;
          })
          .join("\n")
      : "(sin dependencias aún)";

  const prompt = `Eres un experto en pedagogía matemática. Analiza este DAG de aprendizaje y sugiere temas PRERREQUISITOS que faltan.

Temas actuales del curso:
${existingTopics.map((t) => `- ${t.name}`).join("\n")}

Dependencias actuales:
${depsText}

Identifica 3-5 temas PRERREQUISITOS fundamentales que los estudiantes deberían dominar ANTES de estos temas, y que NO están en la lista actual. Piensa en conceptos más básicos que son base de los existentes.

Por ejemplo, si el curso tiene "Ecuación de una Recta", un prerrequisito podría ser "Sistemas de coordenadas" o "Variables y expresiones algebraicas".

Responde SOLO con JSON válido:
{
  "nuevosTemas": [
    {
      "nombre": "nombre del tema prerrequisito",
      "dependesDe": [],
      "esPrerrequistoDe": ["nombre de tema existente que depende de este"]
    }
  ]
}

Reglas:
- Los nombres en "esPrerrequistoDe" deben ser EXACTOS de la lista de temas actuales
- "dependesDe" puede incluir otros temas nuevos que propongas o temas existentes
- Solo propón temas realmente fundamentales que faltan`;

  const result = await model.generateContent(prompt);
  const texto = result.response.text();

  let jsonStr = "";
  const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
  }

  if (!jsonStr) throw new Error("IA no retornó JSON válido");

  const parsed = JSON.parse(jsonStr);
  const nuevosTemas: {
    nombre: string;
    dependesDe: string[];
    esPrerrequistoDe: string[];
  }[] = parsed.nuevosTemas || [];

  if (nuevosTemas.length === 0) {
    console.log(`[ExtendDAG] IA no sugirió temas nuevos`);
    return { newTopics: [], newDependencies: 0, newExercises: 0 };
  }

  // Create new topics
  const createdTopics: { id: number; name: string }[] = [];
  for (const tema of nuevosTemas) {
    const normalized = normalizeTopicName(tema.nombre);
    const exists = await findExistingTopic(normalized);
    if (exists) {
      console.log(`[ExtendDAG] Tema "${normalized}" ya existe, omitiendo`);
      createdTopics.push(exists);
      continue;
    }

    const newTopic = await prisma.topic.create({
      data: { name: normalized },
    });
    createdTopics.push({ id: newTopic.id, name: normalized });
    console.log(
      `[ExtendDAG] Nuevo tema creado: "${normalized}" (id: ${newTopic.id})`,
    );
  }

  // Create dependencies: new topics → existing topics
  let newDeps = 0;
  const allTopicsNow = [...existingTopics, ...createdTopics];

  for (let i = 0; i < nuevosTemas.length; i++) {
    const tema = nuevosTemas[i];
    const topicInfo = createdTopics[i];
    if (!topicInfo) continue;

    // This new topic is prerequisite of existing topics
    for (const childName of tema.esPrerrequistoDe) {
      const childId = findTopicIdInList(childName, allTopicsNow);
      if (childId && childId !== topicInfo.id) {
        try {
          await prisma.topicDependency.create({
            data: { parentId: topicInfo.id, childId },
          });
          newDeps++;
        } catch {
          /* skip duplicates */
        }
      }
    }

    // Dependencies between new topics
    for (const depName of tema.dependesDe) {
      const parentId = findTopicIdInList(depName, allTopicsNow);
      if (parentId && parentId !== topicInfo.id) {
        try {
          await prisma.topicDependency.create({
            data: { parentId, childId: topicInfo.id },
          });
          newDeps++;
        } catch {
          /* skip duplicates */
        }
      }
    }
  }

  // Generate exercises for truly new topics (those not previously existing)
  let totalExercises = 0;
  const newTopicIds = createdTopics.filter(
    (ct) => !existingTopics.some((et) => et.id === ct.id),
  );

  for (const topicInfo of newTopicIds) {
    try {
      const resultado = await generarEjercicios([topicInfo.name], 3);
      const ejerciciosValidos = resultado.ejercicios.filter(
        (ej) => ej.pregunta.trim().length >= 5,
      );

      if (ejerciciosValidos.length > 0) {
        const diffMap: Record<string, string> = {
          facil: "easy",
          medio: "medium",
          dificil: "hard",
        };
        await prisma.exercise.createMany({
          data: ejerciciosValidos.map((ej) => ({
            topicId: topicInfo.id,
            latex: ej.pregunta,
            difficulty: diffMap[ej.dificultad] || ej.dificultad,
            steps: ej.solucion || null,
            hints: ej.pistas ? JSON.stringify(ej.pistas) : null,
          })),
        });
        totalExercises += ejerciciosValidos.length;
        console.log(
          `[ExtendDAG] ✓ ${ejerciciosValidos.length} ejercicios para "${topicInfo.name}"`,
        );
      }
    } catch (err: any) {
      console.error(
        `[ExtendDAG] Error generando ejercicios para "${topicInfo.name}": ${err.message}`,
      );
    }
  }

  console.log(
    `[ExtendDAG] Completado: ${newTopicIds.length} temas nuevos, ${newDeps} dependencias, ${totalExercises} ejercicios`,
  );

  // Auditar para asegurar que los nuevos temas queden conectados
  await auditDAG();

  return {
    newTopics: newTopicIds,
    newDependencies: newDeps,
    newExercises: totalExercises,
  };
}

/**
 * Helper to find topic ID by name in a list (fuzzy match)
 */
function findTopicIdInList(
  name: string,
  topics: { id: number; name: string }[],
): number | null {
  const normalized = normalizeTopicName(name);
  // Exact match
  for (const t of topics) {
    if (t.name === normalized) return t.id;
  }
  // Fuzzy match
  let best: { id: number; score: number } | null = null;
  for (const t of topics) {
    const score = similarity(normalized, t.name);
    if (score >= SIMILARITY_THRESHOLD && (!best || score > best.score)) {
      best = { id: t.id, score };
    }
  }
  return best?.id ?? null;
}

/**
 * Rollback de una clase: elimina todos los artifacts generados por ella
 */
export async function rollbackClass(classId: number) {
  console.log(`[Rollback] Iniciando rollback para clase ${classId}`);

  // Verificar que la clase existe
  const classLog = await prisma.classLog.findUnique({ where: { id: classId } });
  if (!classLog) {
    throw new Error(`Clase ${classId} no encontrada`);
  }

  // Ejecutar en transacción
  await prisma.$transaction(async (tx) => {
    // 1. Eliminar tips de ejercicios generados por esta clase, luego los ejercicios
    const exercisesOfClass = await tx.exercise.findMany({
      where: { generatedByClassId: classId },
      select: { id: true },
    });
    const exerciseIds = exercisesOfClass.map(e => e.id);
    if (exerciseIds.length > 0) {
      await tx.exerciseTip.deleteMany({ where: { exerciseId: { in: exerciseIds } } });
    }
    const deletedExercises = await tx.exercise.deleteMany({
      where: { generatedByClassId: classId },
    });
    console.log(`[Rollback] Eliminados ${deletedExercises.count} ejercicios y sus tips`);

    // 2. Eliminar dependencias generadas por esta clase
    const deletedDependencies = await tx.topicDependency.deleteMany({
      where: { generatedByClassId: classId },
    });
    console.log(
      `[Rollback] Eliminadas ${deletedDependencies.count} dependencias`,
    );

    // 3. Eliminar topics creados por esta clase, solo si no son referenciados por otras clases
    const topicsCreated = await tx.topic.findMany({
      where: { createdByClassId: classId },
    });

    // Obtener todas las demás clases para verificar si usan estos topics
    const otrasClases = await tx.classLog.findMany({
      where: { id: { not: classId } },
      select: { topics: true },
    });
    const temasOtrasClases = new Set<string>();
    for (const otra of otrasClases) {
      const temas = otra.topics ? JSON.parse(otra.topics) : [];
      if (Array.isArray(temas)) {
        temas.forEach((t: string) =>
          temasOtrasClases.add(t.trim().toLowerCase().replace(/\s+/g, " ")),
        );
      }
    }

    for (const topic of topicsCreated) {
      if (temasOtrasClases.has(topic.name)) {
        // Otra clase también tiene este tema, no borrar
        await tx.topic.update({
          where: { id: topic.id },
          data: { createdByClassId: null },
        });
        console.log(
          `[Rollback] Topic ${topic.name} mantenido (usado por otras clases)`,
        );
      } else {
        // Verificar que no tenga ejercicios manuales (sin generatedByClassId)
        const ejerciciosManuales = await tx.exercise.count({
          where: { topicId: topic.id, generatedByClassId: null },
        });
        if (ejerciciosManuales > 0) {
          await tx.topic.update({
            where: { id: topic.id },
            data: { createdByClassId: null },
          });
          console.log(
            `[Rollback] Topic ${topic.name} mantenido (tiene ejercicios manuales)`,
          );
        } else {
          // Eliminar tips de ejercicios del topic
          const topicExercises = await tx.exercise.findMany({
            where: { topicId: topic.id },
            select: { id: true },
          });
          if (topicExercises.length > 0) {
            await tx.exerciseTip.deleteMany({ where: { exerciseId: { in: topicExercises.map(e => e.id) } } });
          }
          // Eliminar documentación del topic
          await tx.topicDoc.deleteMany({ where: { topicId: topic.id } });
          // Eliminar TODOS los ejercicios del topic (no solo los de esta clase)
          await tx.exercise.deleteMany({ where: { topicId: topic.id } });
          // Eliminar fórmulas asociadas antes de borrar el topic
          await tx.formula.deleteMany({ where: { topicId: topic.id } });
          // Eliminar progreso asociado
          await tx.progress.deleteMany({ where: { topicId: topic.id } });
          // Eliminar dependencias que referencian este topic
          await tx.topicDependency.deleteMany({
            where: { OR: [{ parentId: topic.id }, { childId: topic.id }] },
          });
          await tx.topic.delete({ where: { id: topic.id } });
          console.log(`[Rollback] Eliminado topic huérfano: ${topic.name}`);
        }
      }
    }

    // 4. Eliminar imágenes asociadas a la clase
    await tx.classImage.deleteMany({ where: { classId } });

    // 5. Eliminar chunks de indexación (RAG)
    await tx.classChunk.deleteMany({ where: { classId } });

    // 6. Eliminar apuntes generados
    await tx.classNote.deleteMany({ where: { classId } });

    // 7. Eliminar la clase
    await tx.classLog.delete({ where: { id: classId } });
    console.log(`[Rollback] Eliminada clase ${classId}`);
  });

  // 8. Reconstruir DAG después del rollback
  await rebuildDAG();

  console.log(`[Rollback] Rollback completado para clase ${classId}`);
}
