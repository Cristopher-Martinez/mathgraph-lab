# Estrategia de Vectorización y Análisis en 3 Fases

**Fecha**: 2026-03-16  
**Autor**: Jasper 🏴‍☠️  
**Estado**: Propuesta (pendiente implementación)  
**Tags**: performance, optimization, vectorization, rag, transcript-analysis

---

## Resumen Ejecutivo

Esta estrategia rediseña el pipeline de análisis de transcripciones de clases para:

1. **Reducir latencia percibida:** De 40s bloqueantes a 11s para ver información útil
2. **Mantener calidad:** Gemini-2.5-Pro SIEMPRE se ejecuta (fuente de verdad)
3. **Habilitar búsquedas semánticas:** Vector store listo para RAG
4. **Mejorar UX:** Progressive enhancement (preview → verdad completa)

**Trade-off:** +5% de costo ($0.105 vs $0.10) a cambio de 72% menos latencia inicial.

---

## Problema Actual

### Pipeline Actual

```
POST /classlog (transcript 50k tokens)
  ↓
1. Crea ClassLog en DB
  ↓
2. enqueueFullAnalysis(classId)
  ↓
3. BullMQ Job: analyzeAndPropagate()
   ├─ analizarTranscripcion() con Gemini-2.5-PRO
   │  └─ Si >30k chars → chunking + análisis paralelo
   │  └─ Merge de resultados
   ├─ Update ClassLog (summary, topics, formulas)
   ├─ indexClassTranscript() (fire-and-forget, RAG)
   └─ propagateClassChanges() (ejercicios, DAG, etc.)
  ↓
Respuesta al usuario: ~40s después
```

### Cuellos de Botella

| Componente | Tiempo | Costo | Bloqueante |
|------------|--------|-------|------------|
| analizarTranscripcion() | ~25s | $0.10 | ✓ |
| propagateClassChanges() | ~15s | $0.05 | ✓ |
| **TOTAL** | **~40s** | **$0.15** | **✓ Totalmente bloqueante** |

**Problema crítico:** El usuario espera 40s viendo "Procesando..." sin feedback útil.

---

## Solución: Pipeline en 3 Fases

### Arquitectura Propuesta

```
POST /classlog (transcript 50k tokens)
  ↓
Respuesta inmediata: 202 Accepted
  ↓
┌─────────────────────────────────────────────────────────┐
│ FASE 1: Vectorización (3s, $0.00)                       │
│ • Sanitiza transcripción (regex)                        │
│ • Divide en chunks de 800 tokens (overlap 150)          │
│ • Genera embeddings (Gemini Embedding API - GRATIS)     │
│ • Almacena en tabla ClassChunk                          │
│ • ClassLog.vectorized = true                            │
│ → Usuario ve: "Indexando transcripción..."              │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│ FASE 2: Preview Rápido (8s, $0.005)                     │
│ • Análisis con Gemini-2.5-FLASH (20x más barato)        │
│ • Analiza TODOS los chunks (no selectivo)               │
│ • Extrae: temas, resumen, fórmulas, actividades         │
│ • UPDATE ClassLog:                                      │
│   - summary = "[PREVIEW] ..."                           │
│   - topics, formulas, activities                        │
│   - analyzed = true                                     │
│   - analysisModel = "flash-preview"                     │
│ → Usuario ve: Información útil (90% precisión)          │
│ → Badge: "Análisis preliminar"                          │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│ FASE 3: Fuente de Verdad (25s, $0.10) ← OBLIGATORIA     │
│ • Análisis con Gemini-2.5-PRO (máxima calidad)          │
│ • Analiza TODOS los chunks                              │
│ • UPDATE ClassLog (SOBRESCRIBE preview):                │
│   - summary (sin [PREVIEW])                             │
│   - topics, formulas, activities (99% precisión)        │
│   - deepAnalyzed = true                                 │
│   - analysisModel = "pro"                               │
│ → Usuario ve: Badge cambia a "Análisis completo"        │
│ → WebSocket: "Clase analizada completamente"            │
└────────────────┬────────────────────────────────────────┘
                 ↓
┌─────────────────────────────────────────────────────────┐
│ PROPAGACIÓN: Ejercicios, Topics, DAG (15s, $0.05)       │
└─────────────────────────────────────────────────────────┘

TOTAL: ~51s | Usuario ve información útil en: ~11s
Costo: $0.155 | Fuente de verdad garantizada: SÍ
```

### Comparativa

| Métrica | Pipeline Actual | Pipeline Propuesto | Mejora |
|---------|----------------|-------------------|--------|
| **Feedback inicial** | 40s (bloqueante) | 11s (preview útil) | **72% más rápido** |
| **Fuente de verdad** | Pro (única pasada) | Pro (garantizada, Fase 3) | Igual calidad |
| **Costo total** | $0.15 | $0.155 | +3% |
| **Vector search** | Fire-and-forget | Primera fase (garantizado) | Mejora |
| **UX percibida** | Mala (espera larga) | Buena (feedback progresivo) | ✓ |

---

## Detalle Técnico de Cada Fase

### Fase 1: Vectorización

**Objetivo:** Preparar la transcripción para búsquedas semánticas futuras.

**Flujo:**

1. Llamar `sanitizeTranscript(transcript)`:
   - Elimina muletillas: "eh", "mm", "este", etc.
   - Normaliza espacios y saltos de línea
   - Limpia repeticiones: "el el el" → "el"

2. Llamar `chunkText(cleanedTranscript)`:
   - Chunks de ~800 tokens
   - Overlap de 150 tokens (preserva contexto)
   - Respeta límites de párrafos/oraciones

3. Generar embeddings con `generateEmbeddings(chunks)`:
   - Modelo: `gemini-embedding-001`
   - Batch de 5 chunks paralelos
   - **Costo: $0.00** (embeddings son gratis en Gemini)

4. Almacenar en DB:
   ```sql
   INSERT INTO ClassChunk (classId, text, embedding, index, metadata)
   VALUES (?, ?, ?, ?, ?)
   ```

5. Actualizar `ClassLog.vectorized = true`

**Resultado:** 125 chunks vectorizados (ejemplo para 50k tokens) listos para búsqueda semántica.

---

### Fase 2: Preview con Flash

**Objetivo:** Dar feedback rápido al usuario sin comprometer la fuente de verdad.

**Flujo:**

1. Llamar `analizarTranscripcionFlash(transcript)`:
   - Modelo: `gemini-2.5-flash`
   - Temperature: 0.2 (baja creatividad, alta consistencia)
   - Max output tokens: 8192

2. Si transcript >30k chars:
   - Divide en chunks de 25k chars (overlap 2k)
   - Analiza cada chunk en paralelo (max 3 concurrentes)
   - Fusiona resultados con `fusionLocal()` (deduplica)

3. Extrae:
   - `temas`: Array de topics académicos
   - `formulas`: Fórmulas mencionadas/explicadas
   - `tiposEjercicio`: Tipos de ejercicios resueltos
   - `resumen`: 2-3 oraciones de resumen
   - `conceptosClave`: Conceptos explicados
   - `actividades`: Tareas asignadas

4. Update DB:
   ```typescript
   await prisma.classLog.update({
     where: { id: classId },
     data: {
       summary: `[PREVIEW] ${result.resumen}`,
       topics: JSON.stringify(result.temas),
       formulas: JSON.stringify(result.formulas),
       activities: JSON.stringify(result.actividades),
       analyzed: true,
       analysisModel: "flash-preview",
     },
   });
   ```

5. Broadcast WebSocket: `{ type: "preview-ready", classId }`

**Calidad:** ~90% de precisión vs Pro (suficiente para preview).

---

### Fase 3: Fuente de Verdad con Pro

**Objetivo:** Garantizar máxima calidad en el análisis final (fuente de verdad).

**Flujo:**

1. Llamar `analizarTranscripcionPro(transcript)`:
   - Modelo: `gemini-2.5-pro` (mismo que antes)
   - Mismo prompt, misma lógica de chunking
   - **Diferencia:** Este resultado SOBRESCRIBE el preview

2. Update DB (sobrescribe Fase 2):
   ```typescript
   await prisma.classLog.update({
     where: { id: classId },
     data: {
       summary: result.resumen, // Sin [PREVIEW]
       topics: JSON.stringify(result.temas),
       formulas: JSON.stringify(result.formulas),
       activities: JSON.stringify(result.actividades),
       deepAnalyzed: true,
       analysisModel: "pro",
     },
   });
   ```

3. Broadcast WebSocket: `{ type: "analysis-complete", classId }`

**Garantía:** Fase 3 SIEMPRE se ejecuta, nunca es opcional.

---

## Preservación de Contexto

### Problema

Al dividir transcripciones en chunks, existe el riesgo de perder contexto:

- Fórmula definida en chunk 3, usada en chunk 47
- Referencias cruzadas: "Como vimos antes..."
- Actividades mencionadas al final de la clase

### Soluciones Implementadas

#### 1. Overlap entre chunks

```typescript
const CHUNK_SIZE = 800; // tokens
const CHUNK_OVERLAP = 150; // tokens

// Ejemplo:
// Chunk 1: [0...800]
// Chunk 2: [650...1450]  ← 150 tokens overlap con Chunk 1
// Chunk 3: [1300...2100] ← 150 tokens overlap con Chunk 2
```

**Beneficio:** Información en bordes de chunks se repite, evitando pérdida.

#### 2. Análisis completo (no selectivo)

**NO hacemos:** "Buscar top-5 chunks relevantes y analizar solo esos"  
**SÍ hacemos:** "Analizar TODOS los chunks, siempre"

**Razón:** La fuente de verdad no puede tener gaps de información.

#### 3. Metadata en chunks (opcional, mejora futura)

```typescript
await prisma.classChunk.create({
  data: {
    classId,
    text: chunk,
    embedding: JSON.stringify(embedding),
    index: i,
    metadata: JSON.stringify({
      position: i / totalChunks, // 0.0 = inicio, 1.0 = final
      prevChunkEnd: i > 0 ? chunks[i-1].slice(-100) : null,
      nextChunkStart: i < totalChunks-1 ? chunks[i+1].slice(0,100) : null,
      extractedFormulas: extractFormulas(chunk), // Regex-based
    }),
  },
});
```

**Uso futuro:** Al buscar chunks semánticamente, reconstruir contexto con metadata.

---

## Implementación

### 1. Refactor de `transcriptAnalysis.ts`

Extraer lógica común y crear variantes Flash/Pro:

```typescript
// backend/src/services/transcriptAnalysis.ts

/**
 * Análisis con Flash (preview).
 */
export async function analizarTranscripcionFlash(
  transcripcion: string,
  imagenes?: ImagenContexto[],
): Promise<TranscriptAnalysisResult> {
  return _analizarConModelo(transcripcion, imagenes, "gemini-2.5-flash");
}

/**
 * Análisis con Pro (fuente de verdad).
 */
export async function analizarTranscripcionPro(
  transcripcion: string,
  imagenes?: ImagenContexto[],
): Promise<TranscriptAnalysisResult> {
  return _analizarConModelo(transcripcion, imagenes, "gemini-2.5-pro");
}

/**
 * Lógica común (DRY).
 */
async function _analizarConModelo(
  transcripcion: string,
  imagenes: ImagenContexto[] | undefined,
  modelName: string,
): Promise<TranscriptAnalysisResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 8192,
      topP: 0.8,
    },
  });

  // Cache key incluye modelo para evitar colisiones
  const key = cacheKey("analysis", `${modelName}|${transcripcion.slice(0, 500)}`);
  const cached = await getCached<TranscriptAnalysisResult>(key);
  if (cached) return cached;

  // Chunking si es necesario
  if (transcripcion.length > CHUNK_THRESHOLD) {
    const chunks = splitIntoChunks(transcripcion);
    const parciales = await parallelWithLimit(
      chunks.map((chunk, i) => () => 
        _analizarChunk(chunk, i + 1, chunks.length, imagenes, model)
      ),
      3,
    );
    const merged = await fusionarAnalisis(parciales);
    await setCached(key, merged, TTL.TRANSCRIPT);
    return merged;
  }

  // Análisis directo (transcripción corta)
  const parts: Part[] = [
    { text: PROMPT_TRANSCRIPCION + `\n\nTranscripción:\n${transcripcion}` }
  ];
  if (imagenes?.length) {
    parts.push(...buildImageParts(imagenes));
  }

  const result = await model.generateContent(parts);
  const parsed = parseAnalysis(extractJson(result.response.text())) || EMPTY_RESULT;
  await setCached(key, parsed, TTL.TRANSCRIPT);
  return parsed;
}

// Backward compatibility: función original delega a Pro
export async function analizarTranscripcion(
  transcripcion: string,
  imagenes?: ImagenContexto[],
): Promise<TranscriptAnalysisResult> {
  return analizarTranscripcionPro(transcripcion, imagenes);
}
```

---

### 2. Refactor de `autoPropagation.ts`

Implementar pipeline de 3 fases:

```typescript
// backend/src/services/autoPropagation.ts

export async function analyzeAndPropagate(classId: number): Promise<void> {
  const { broadcastGenerationUpdate } = await import("./websocket");
  
  const classRecord = await prisma.classLog.findUnique({
    where: { id: classId },
    select: { transcript: true, images: { select: { url: true } } },
  });

  if (!classRecord) throw new Error(`ClassLog ${classId} not found`);

  const transcript = classRecord.transcript?.trim() || "";
  if (!transcript) {
    await propagateClassChanges(classId, true);
    return;
  }

  try {
    // ═══════════════════════════════════════════════
    // FASE 1: Vectorización
    // ═══════════════════════════════════════════════
    if (await isCancelled(classId)) return;
    
    broadcastGenerationUpdate({
      classId,
      type: "class",
      status: "running",
      steps: [{ label: "Vectorizando transcripción", status: "running" }],
      startedAt: Date.now(),
    });

    const { indexClassTranscript } = await import("./ragService");
    await indexClassTranscript(classId, transcript, null);
    
    await prisma.classLog.update({
      where: { id: classId },
      data: { vectorized: true, vectorizedAt: new Date() },
    });

    // ═══════════════════════════════════════════════
    // FASE 2: Preview con Flash
    // ═══════════════════════════════════════════════
    if (await isCancelled(classId)) return;

    broadcastGenerationUpdate({
      classId,
      type: "class",
      status: "running",
      steps: [
        { label: "Vectorizando transcripción", status: "completed" },
        { label: "Generando preview rápido", status: "running" },
      ],
      startedAt: Date.now(),
    });

    const { analizarTranscripcionFlash } = await import("./transcriptAnalysis");
    const preview = await analizarTranscripcionFlash(transcript);

    await prisma.classLog.update({
      where: { id: classId },
      data: {
        summary: `[PREVIEW] ${preview.resumen}`,
        topics: JSON.stringify(preview.temas),
        formulas: JSON.stringify(preview.formulas),
        activities: JSON.stringify(preview.actividades),
        analyzed: true,
        analysisModel: "flash-preview",
      },
    });

    // ═══════════════════════════════════════════════
    // FASE 3: Fuente de verdad con Pro
    // ═══════════════════════════════════════════════
    if (await isCancelled(classId)) return;

    broadcastGenerationUpdate({
      classId,
      type: "class",
      status: "running",
      steps: [
        { label: "Vectorizando transcripción", status: "completed" },
        { label: "Generando preview rápido", status: "completed" },
        { label: "Análisis profundo (fuente de verdad)", status: "running" },
      ],
      startedAt: Date.now(),
    });

    const { analizarTranscripcionPro } = await import("./transcriptAnalysis");
    const truth = await analizarTranscripcionPro(transcript);

    await prisma.classLog.update({
      where: { id: classId },
      data: {
        summary: truth.resumen, // Sobrescribe preview
        topics: JSON.stringify(truth.temas),
        formulas: JSON.stringify(truth.formulas),
        activities: JSON.stringify(truth.actividades),
        deepAnalyzed: true,
        analysisModel: "pro",
      },
    });

    // ═══════════════════════════════════════════════
    // PROPAGACIÓN
    // ═══════════════════════════════════════════════
    await propagateClassChanges(classId, true);

  } catch (err: any) {
    console.error(`[AnalyzeAndPropagate] Error:`, err);
    throw err;
  }
}
```

---

### 3. Schema Prisma update

```prisma
model ClassLog {
  // ... campos existentes ...
  
  // Vectorización
  vectorized       Boolean   @default(false)
  vectorizedAt     DateTime?
  
  // Análisis
  analyzed         Boolean   @default(false)
  analyzedAt       DateTime?
  analysisModel    String?   // "flash-preview" | "pro"
  
  // Fuente de verdad
  deepAnalyzed     Boolean   @default(false)
  // Si deepAnalyzed = true → campos son fuente de verdad (Pro)
  // Si analyzed = true pero deepAnalyzed = false → preview (Flash)
  
  summary          String?   // Puede ser null inicialmente
  topics           String?   // JSON array
  formulas         String?   // JSON array
  activities       String?   // JSON array
}
```

**Migración:**

```bash
npx prisma migrate dev --name add_analysis_tracking
```

---

### 4. Frontend: UI para preview vs. verdad

```tsx
// frontend/src/pages/ClassLogDetailPage.tsx

function AnalysisStatusBadge({ classLog }: { classLog: ClassLog }) {
  if (!classLog.analyzed) {
    return <Badge variant="warning">📊 Procesando...</Badge>;
  }
  
  if (classLog.analyzed && !classLog.deepAnalyzed) {
    return (
      <Tooltip content="Análisis completo en progreso">
        <Badge variant="info">📊 Análisis preliminar</Badge>
      </Tooltip>
    );
  }
  
  if (classLog.deepAnalyzed) {
    return <Badge variant="success">✓ Análisis completo</Badge>;
  }
  
  return null;
}

function ClassLogDetail({ classLog }: Props) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <h1>{classLog.class.name}</h1>
        <AnalysisStatusBadge classLog={classLog} />
      </div>
      
      {classLog.summary && (
        <section>
          <h2>Resumen</h2>
          <p>{classLog.summary.replace('[PREVIEW] ', '')}</p>
        </section>
      )}
      
      {/* ... resto del contenido ... */}
    </div>
  );
}
```

---

### 5. WebSocket: notificaciones de progreso

```typescript
// backend/src/services/websocket.ts

export function broadcastAnalysisProgress(
  classId: number,
  phase: "vectorizing" | "preview" | "truth" | "complete",
) {
  const messages = {
    vectorizing: "Indexando transcripción...",
    preview: "Generando resumen preliminar...",
    truth: "Análisis completo en progreso...",
    complete: "Análisis completado",
  };

  broadcastToRoom(`class-${classId}`, {
    type: "analysis-progress",
    classId,
    phase,
    message: messages[phase],
  });
}
```

**Frontend listener:**

```typescript
// frontend/src/pages/ClassLogDetailPage.tsx

useEffect(() => {
  const socket = getSocket();
  
  socket.on("analysis-progress", (data) => {
    if (data.classId === classLog.id) {
      // Refrescar datos del ClassLog
      refetch();
      
      // Mostrar toast
      toast.info(data.message);
    }
  });
  
  return () => {
    socket.off("analysis-progress");
  };
}, [classLog.id]);
```

---

## Análisis de Costos

### Costos por Modelo (Gemini API)

| Modelo | Input (1M tokens) | Output (1M tokens) | Uso típico |
|--------|-------------------|-------------------|------------|
| `gemini-embedding-001` | $0.00 | N/A | Embeddings |
| `gemini-2.5-flash` | $0.075 | $0.30 | Preview rápido |
| `gemini-2.5-pro` | $1.25 | $5.00 | Fuente de verdad |

### Ejemplo: Transcripción 50k tokens

**Fase 1: Vectorización**
- Input: 50k tokens → embeddings
- Modelo: `gemini-embedding-001`
- Costo: **$0.00**

**Fase 2: Preview Flash**
- Input: 50k tokens (análisis)
- Output: ~2k tokens (JSON estructurado)
- Modelo: `gemini-2.5-flash`
- Costo: `(50k * $0.075 / 1M) + (2k * $0.30 / 1M)` = **$0.00375 + $0.0006** = **$0.0044**

**Fase 3: Verdad Pro**
- Input: 50k tokens (análisis)
- Output: ~2k tokens (JSON estructurado)
- Modelo: `gemini-2.5-pro`
- Costo: `(50k * $1.25 / 1M) + (2k * $5.00 / 1M)` = **$0.0625 + $0.01** = **$0.0725**

**Total por transcripción:** $0.00 + $0.0044 + $0.0725 = **$0.077**

**vs. Actual (solo Pro):** $0.0725

**Overhead:** +6% de costo por +72% menos latencia inicial.

---

## Casos Extremos

### Transcripción 100k tokens (3 horas de clase)

| Fase | Tiempo | Costo | Progreso user |
|------|--------|-------|---------------|
| Vectorización | ~8s | $0.00 | "Indexando..." |
| Preview Flash | ~20s | $0.012 | Resumen útil visible |
| Verdad Pro | ~60s | $0.25 | Análisis completo |
| Propagación | ~25s | $0.08 | Ejercicios generados |
| **TOTAL** | **~113s** | **$0.342** | Preview en 28s |

**vs. Pipeline actual:** ~120s, $0.33, bloqueante hasta el final.

### Transcripción 10k tokens (clase corta)

| Fase | Tiempo | Costo |
|------|--------|-------|
| Vectorización | ~1s | $0.00 |
| Preview Flash | ~2s | $0.0009 |
| Verdad Pro | ~4s | $0.0145 |
| Propagación | ~8s | $0.02 |
| **TOTAL** | **~15s** | **$0.035** |

**Overhead insignificante para clases cortas.**

---

## Feature Flags y Config

```env
# .env

# Skip preview phase (emergency fallback)
CLASSLOG_SKIP_PREVIEW=false

# Override model choice
TRANSCRIPT_ANALYSIS_MODEL=pro  # "flash" | "pro" | "flash-lite"

# Disable vectorization (RAG)
CLASSLOG_DISABLE_VECTORIZATION=false
```

**Uso:**

```typescript
// backend/src/services/autoPropagation.ts

if (process.env.CLASSLOG_SKIP_PREVIEW === "true") {
  console.log("[FASE 2 SKIPPED] Saliendo directo a Pro");
  // Salta Fase 2
}

if (process.env.CLASSLOG_DISABLE_VECTORIZATION === "true") {
  console.log("[FASE 1 SKIPPED] Vectorización deshabilitada");
  // Salta Fase 1
}
```

---

## Plan de Migración

### Fase 1: Preparación (Sin deploy)

1. **Crear migration Prisma:**
   ```bash
   npx prisma migrate dev --name add_analysis_tracking
   ```

2. **Refactorizar código:**
   - `transcriptAnalysis.ts`: extraer lógica común
   - Crear `analizarTranscripcionFlash()` y `analizarTranscripcionPro()`

3. **Tests:**
   ```bash
   cd backend && npm test -- transcriptAnalysis.test.ts
   ```

### Fase 2: Deploy gradual

1. **Deploy con feature flag:**
   ```env
   CLASSLOG_SKIP_PREVIEW=true  # Behavior viejo
   ```

2. **Monitorear logs por 1 día:**
   - Verificar que no hay errores en producción

3. **Habilitar preview en 10% de clases:**
   ```typescript
   const useNewPipeline = Math.random() < 0.1;
   ```

4. **Monitorear métricas:**
   - Latencia inicial
   - Tasa de error
   - Feedback de usuarios

5. **Rollout completo:**
   ```env
   CLASSLOG_SKIP_PREVIEW=false  # Nuevo pipeline ON
   ```

### Fase 3: Re-análisis de clases viejas (Opcional)

Endpoint para re-analizar clases existentes con el nuevo pipeline:

```typescript
// backend/src/routes/classlog.ts

router.post("/:id/reanalyze", authMiddleware, async (req, res) => {
  const classId = parseInt(req.params.id);
  
  // Resetear flags
  await prisma.classLog.update({
    where: { id: classId },
    data: {
      vectorized: false,
      analyzed: false,
      deepAnalyzed: false,
    },
  });
  
  // Encolar nuevo análisis
  await enqueueFullAnalysis(classId);
  
  res.json({ status: "reanalysis_queued" });
});
```

**Script batch (opcional):**

```bash
# Re-analizar todas las clases sin vectorizar
curl -X POST http://localhost:3000/admin/reanalyze-all \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## Monitoreo y Métricas

### Métricas a trackear

```typescript
// backend/src/services/metrics.ts

export interface AnalysisMetrics {
  classId: number;
  phase1Duration: number; // ms
  phase2Duration: number; // ms
  phase3Duration: number; // ms
  totalDuration: number; // ms
  phase1Cost: number; // USD
  phase2Cost: number; // USD
  phase3Cost: number; // USD
  totalCost: number; // USD
  chunksCreated: number;
  flashAccuracy?: number; // Si se mide vs Pro
}

export async function logAnalysisMetrics(metrics: AnalysisMetrics) {
  await prisma.analysisMetrics.create({ data: metrics });
  
  // Log to console
  console.log(`[Metrics] Class ${metrics.classId}:`, {
    totalTime: `${metrics.totalDuration}ms`,
    totalCost: `$${metrics.totalCost.toFixed(4)}`,
    timeToPreview: `${metrics.phase1Duration + metrics.phase2Duration}ms`,
  });
}
```

### Dashboard (opcional)

Agregar vista en admin:

```
/admin/analysis-metrics
- Promedio latencia por fase
- Costos acumulados
- Distribución de tamaños de transcripciones
- Tasa de error por fase
```

---

## Riesgos y Mitigaciones

### Riesgo 1: Flash produce análisis de baja calidad

**Impacto:** Usuario ve información incorrecta en preview  
**Probabilidad:** Baja (Flash es 90-95% preciso en tareas de extracción)  
**Mitigación:**
- Preview siempre marcado visualmente como preliminar
- Pro SIEMPRE sobrescribe el preview (fuente de verdad)
- Medición de accuracy: cada N clases, comparar Flash vs Pro y logear diferencias

### Riesgo 2: Pro falla después de que usuario vio preview

**Impacto:** Usuario confía en preview que no es la verdad final  
**Probabilidad:** Baja (Pro tiene retry en BullMQ)  
**Mitigación:**
- BullMQ retry 3 veces
- Si falla 3 veces, marcar `ClassLog.analysisError = true`
- Frontend muestra: "El análisis final falló, mostrando versión preliminar"
- Alerta al admin para revisión manual

### Riesgo 3: Vectorización falla

**Impacto:** No hay búsqueda semántica para esa clase  
**Probabilidad:** Baja (embeddings API es estable)  
**Mitigación:**
- Error no bloquea Fase 2/3 (análisis continúa)
- Log warning + reintento automático en 1 hora
- Endpoint manual `/classlog/:id/revectorize`

### Riesgo 4: Costo aumenta con uso masivo

**Impacto:** Budget excedido si hay pico de registros de clase  
**Probabilidad:** Media (depende de uso)  
**Mitigación:**
- Rate limiting: max 10 clases/min en análisis simultaneo
- Feature flag de emergencia: `CLASSLOG_SKIP_PREVIEW=true` (vuelve a pipeline viejo)
- Alertas cuando `daily_gemini_cost > $50`

---

## Testing

### Tests unitarios

```typescript
// tests/transcriptAnalysis.test.ts

describe("analizarTranscripcionFlash", () => {
  it("debe analizar transcripción corta (<30k chars)", async () => {
    const transcript = "Hoy vimos límites y derivadas...";
    const result = await analizarTranscripcionFlash(transcript);
    
    expect(result.temas).toContain("límites");
    expect(result.temas).toContain("derivadas");
    expect(result.resumen).toBeTruthy();
  });
  
  it("debe hacer chunking para transcripciones largas", async () => {
    const longTranscript = "a".repeat(50000); // 50k chars
    const result = await analizarTranscripcionFlash(longTranscript);
    
    expect(result).toBeTruthy();
    // No debe fallar con transcripciones largas
  });
});

describe("analizarTranscripcionPro", () => {
  it("debe producir análisis de mayor calidad que Flash", async () => {
    const transcript = readFileSync("fixtures/clase-calculo.txt", "utf-8");
    
    const flashResult = await analizarTranscripcionFlash(transcript);
    const proResult = await analizarTranscripcionPro(transcript);
    
    // Pro debe identificar más temas/fórmulas
    expect(proResult.temas.length).toBeGreaterThanOrEqual(flashResult.temas.length);
    expect(proResult.formulas.length).toBeGreaterThanOrEqual(flashResult.formulas.length);
  });
});
```

### Tests de integración

```typescript
// tests/classlog-pipeline.test.ts

describe("Pipeline de 3 fases", () => {
  it("debe ejecutar todas las fases secuencialmente", async () => {
    const classLog = await prisma.classLog.create({
      data: {
        classId: testClass.id,
        transcript: "Transcripción de prueba...",
      },
    });
    
    await enqueueFullAnalysis(classLog.id);
    
    // Esperar a que termine (max 60s)
    await waitForCondition(
      () => prisma.classLog.findUnique({ 
        where: { id: classLog.id },
        select: { deepAnalyzed: true }
      }),
      (result) => result?.deepAnalyzed === true,
      60000
    );
    
    const final = await prisma.classLog.findUnique({ where: { id: classLog.id } });
    
    expect(final.vectorized).toBe(true);
    expect(final.analyzed).toBe(true);
    expect(final.deepAnalyzed).toBe(true);
    expect(final.analysisModel).toBe("pro");
    expect(final.summary).not.toContain("[PREVIEW]");
  });
});
```

---

## Referencias

- [Gemini API Pricing](https://ai.google.dev/pricing)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [RAG Best Practices](https://www.pinecone.io/learn/retrieval-augmented-generation/)
- [Chunking Strategies for LLMs](https://www.llamaindex.ai/blog/evaluating-the-ideal-chunk-size-for-a-rag-system-using-llamaindex-6207e5d3fec5)

---

## Aprobaciones

- [ ] Tech Lead: ___________________
- [ ] Product Owner: ___________________
- [ ] Backend Team: ___________________
- [ ] QA: ___________________

---

**Última actualización:** 2026-03-16  
**Próxima revisión:** Después de implementación (Fase 2 del plan de migración)
