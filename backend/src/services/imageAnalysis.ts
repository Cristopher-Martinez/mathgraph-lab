import { GoogleGenerativeAI } from "@google/generative-ai";
import * as fs from "fs";
import * as path from "path";
import { parseGeminiJSON } from "../utils/parseGeminiJSON";
import { cacheKey, getCached, setCached, TTL } from "./geminiCache";

// Resultado del análisis de imagen
export interface ImageAnalysisResult {
  formulas: string[];
  ecuaciones: string[];
  diagramas: string[];
  sistemasCoordenados: string[];
  desigualdades: string[];
  textoDetectado: string;
}

// Resultado de procesamiento batch con info de errores
export interface BatchImageResult {
  resultados: ImageAnalysisResult[];
  errores: { indice: number; error: string }[];
  formulasConsolidadas: string[];
  textoConsolidado: string;
}

// Tamaño máximo de imagen en base64 (~10MB decoded ≈ ~13.3MB base64)
const MAX_IMAGE_BASE64_LENGTH = 13_500_000;
// Concurrencia máxima para procesamiento paralelo
const MAX_CONCURRENCY = 3;

const PROMPT_IMAGEN = `Analiza esta imagen de una clase de matemáticas.

Extrae lo siguiente:
- Fórmulas matemáticas
- Ecuaciones
- Diagramas (descríbelos)
- Sistemas de coordenadas
- Expresiones de desigualdades
- Cualquier texto escrito

Responde SOLO con JSON válido en este formato exacto:
{
  "formulas": ["lista de fórmulas encontradas"],
  "ecuaciones": ["lista de ecuaciones"],
  "diagramas": ["descripción de cada diagrama"],
  "sistemasCoordenados": ["descripción de sistemas coordenados"],
  "desigualdades": ["expresiones de desigualdades"],
  "textoDetectado": "todo el texto visible en la imagen"
}

Si no encuentras algún elemento, usa un arreglo vacío [] o cadena vacía "".`;

/**
 * Valida una imagen base64 antes de procesarla
 */
export function validarImagen(
  base64: string,
  mimeType: string,
): { valida: boolean; error?: string } {
  if (!base64 || typeof base64 !== "string" || base64.trim().length === 0) {
    return { valida: false, error: "Imagen vacía o formato inválido" };
  }

  if (base64.length > MAX_IMAGE_BASE64_LENGTH) {
    const sizeMB = Math.round((base64.length * 3) / 4 / 1024 / 1024);
    return {
      valida: false,
      error: `Imagen demasiado grande (${sizeMB}MB). Máximo permitido: 10MB`,
    };
  }

  const tiposPermitidos = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/heic",
    "image/heif",
  ];
  if (!tiposPermitidos.includes(mimeType)) {
    return {
      valida: false,
      error: `Tipo de imagen no soportado: ${mimeType}. Soportados: ${tiposPermitidos.join(", ")}`,
    };
  }

  return { valida: true };
}

/**
 * Analiza una imagen usando Gemini 2.5 Pro (multimodal)
 */
export async function analizarImagen(
  imagenBase64: string,
  mimeType: string = "image/jpeg",
): Promise<ImageAnalysisResult> {
  const key = cacheKey("img", imagenBase64.slice(0, 2048) + mimeType);
  const cached = await getCached<ImageAnalysisResult>(key);
  if (cached) return cached;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY no está configurada");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-pro",
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4000,
      topP: 0.8,
    },
  });

  const imagePart = {
    inlineData: {
      data: imagenBase64,
      mimeType,
    },
  };

  const result = await model.generateContent([PROMPT_IMAGEN, imagePart]);
  const texto = result.response.text();

  // Extraer JSON de la respuesta (puede estar en code block)
  let jsonStr = "";
  const codeBlockMatch = texto.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  } else {
    const jsonMatch = texto.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
  }

  if (!jsonStr) {
    return resultadoVacio(`No se pudo extraer JSON. Texto: ${texto}`);
  }

  try {
    const parsed = parseGeminiJSON(jsonStr);
    const result: ImageAnalysisResult = {
      formulas: parsed.formulas || [],
      ecuaciones: parsed.ecuaciones || [],
      diagramas: parsed.diagramas || [],
      sistemasCoordenados: parsed.sistemasCoordenados || [],
      desigualdades: parsed.desigualdades || [],
      textoDetectado: parsed.textoDetectado || "",
    };
    await setCached(key, result, TTL.IMAGE);
    return result;
  } catch {
    return resultadoVacio(`JSON inválido: ${texto}`);
  }
}

/**
 * OCR de respaldo usando Tesseract.js cuando Gemini falla
 */
export async function ocrRespaldo(imagenBase64: string): Promise<string> {
  try {
    const Tesseract = await import("tesseract.js");
    // Convertir base64 a buffer
    const buffer = Buffer.from(imagenBase64, "base64");
    const tempPath = path.join(__dirname, `temp_ocr_${Date.now()}.png`);

    fs.writeFileSync(tempPath, buffer);

    const { data } = await Tesseract.recognize(tempPath, "spa+eng");

    // Limpiar archivo temporal
    fs.unlinkSync(tempPath);

    return data.text || "";
  } catch (error) {
    console.error("Error en OCR de respaldo:", error);
    return "";
  }
}

/**
 * Pipeline completo de análisis de imagen con fallback
 */
export async function procesarImagen(
  imagenBase64: string,
  mimeType: string = "image/jpeg",
): Promise<ImageAnalysisResult> {
  // Validar imagen
  const validacion = validarImagen(imagenBase64, mimeType);
  if (!validacion.valida) {
    console.warn(`[ImageAnalysis] Imagen rechazada: ${validacion.error}`);
    return resultadoVacio(validacion.error || "Imagen inválida");
  }

  try {
    // Intentar con Gemini primero
    const resultado = await analizarImagen(imagenBase64, mimeType);
    return resultado;
  } catch (error) {
    console.warn("Gemini falló para imagen, usando OCR de respaldo:", error);
    // Fallback a OCR
    const textoOCR = await ocrRespaldo(imagenBase64);
    return {
      formulas: [],
      ecuaciones: [],
      diagramas: [],
      sistemasCoordenados: [],
      desigualdades: [],
      textoDetectado: textoOCR,
    };
  }
}

/**
 * Procesa múltiples imágenes en paralelo con límite de concurrencia.
 * Continúa procesando incluso si alguna imagen falla.
 */
export async function procesarImagenesBatch(
  imagenes: { base64: string; mimeType: string; caption?: string }[],
): Promise<BatchImageResult> {
  const resultados: ImageAnalysisResult[] = [];
  const errores: { indice: number; error: string }[] = [];

  if (!imagenes || imagenes.length === 0) {
    return {
      resultados,
      errores,
      formulasConsolidadas: [],
      textoConsolidado: "",
    };
  }

  console.log(
    `[ImageAnalysis] Procesando batch de ${imagenes.length} imágenes (concurrencia: ${MAX_CONCURRENCY})`,
  );

  // Procesar en lotes concurrentes
  for (let i = 0; i < imagenes.length; i += MAX_CONCURRENCY) {
    const batch = imagenes.slice(i, i + MAX_CONCURRENCY);
    const batchPromises = batch.map(async (img, batchIdx) => {
      const globalIdx = i + batchIdx;
      try {
        console.log(
          `[ImageAnalysis] Procesando imagen ${globalIdx + 1}/${imagenes.length}`,
        );
        const resultado = await procesarImagen(
          img.base64,
          img.mimeType || "image/jpeg",
        );
        return { idx: globalIdx, resultado, error: null };
      } catch (err: any) {
        const errorMsg = err?.message || "Error desconocido";
        console.error(
          `[ImageAnalysis] Error en imagen ${globalIdx + 1}:`,
          errorMsg,
        );
        return { idx: globalIdx, resultado: null, error: errorMsg };
      }
    });

    const batchResults = await Promise.allSettled(batchPromises);

    for (const settled of batchResults) {
      if (settled.status === "fulfilled") {
        const { idx, resultado, error } = settled.value;
        if (resultado) {
          resultados.push(resultado);
        } else {
          errores.push({ indice: idx, error: error || "Error desconocido" });
          resultados.push(resultadoVacio(error || "Error procesando imagen"));
        }
      } else {
        errores.push({
          indice: -1,
          error: settled.reason?.message || "Error no manejado",
        });
      }
    }
  }

  // Consolidar fórmulas y texto de todas las imágenes
  const formulasConsolidadas = deduplicar(
    resultados.flatMap((r) => [...r.formulas, ...r.ecuaciones]),
  );
  const textoConsolidado = resultados
    .map((r) => r.textoDetectado)
    .filter(Boolean)
    .join("\n---\n");

  console.log(
    `[ImageAnalysis] Batch completado: ${resultados.length} procesadas, ${errores.length} errores, ${formulasConsolidadas.length} fórmulas encontradas`,
  );

  return { resultados, errores, formulasConsolidadas, textoConsolidado };
}

function deduplicar(items: string[]): string[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const lower = item.toLowerCase().trim();
    if (!lower || seen.has(lower)) return false;
    seen.add(lower);
    return true;
  });
}

function resultadoVacio(textoDetectado: string): ImageAnalysisResult {
  return {
    formulas: [],
    ecuaciones: [],
    diagramas: [],
    sistemasCoordenados: [],
    desigualdades: [],
    textoDetectado,
  };
}
