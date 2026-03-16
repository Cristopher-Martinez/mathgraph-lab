import prisma from "../prismaClient";

/**
 * Crea o recupera una sesión de chat
 */
export async function getOrCreateSession(sessionId?: number) {
  if (sessionId) {
    const existing = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 50,
        },
      },
    });
    if (existing) return existing;
  }

  return prisma.chatSession.create({
    data: {},
    include: { messages: true },
  });
}

/**
 * Guarda un mensaje en una sesión
 */
export async function saveMessage(params: {
  sessionId: number;
  role: "user" | "assistant";
  text: string;
  images?: string[];
  sources?: Array<{ classId: number; text: string; score: number }>;
}) {
  const msg = await prisma.chatMessage.create({
    data: {
      sessionId: params.sessionId,
      role: params.role,
      text: params.text,
      images: params.images ? JSON.stringify(params.images) : null,
      sources: params.sources ? JSON.stringify(params.sources) : null,
    },
  });

  // Auto-title: si es el primer mensaje del usuario, usar como título
  if (params.role === "user") {
    const session = await prisma.chatSession.findUnique({
      where: { id: params.sessionId },
      select: { title: true },
    });
    if (!session?.title) {
      await prisma.chatSession.update({
        where: { id: params.sessionId },
        data: { title: params.text.slice(0, 100) },
      });
    }
  }

  return msg;
}

/**
 * Lista sesiones de chat recientes
 */
export async function listSessions(limit: number = 20) {
  return prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  });
}

/**
 * Obtiene mensajes de una sesión
 */
export async function getSessionMessages(sessionId: number) {
  return prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      text: true,
      images: true,
      sources: true,
      createdAt: true,
    },
  });
}

/**
 * Elimina una sesión
 */
export async function deleteSession(sessionId: number) {
  return prisma.chatSession.delete({ where: { id: sessionId } });
}
