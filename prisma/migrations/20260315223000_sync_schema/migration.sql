-- AlterTable
ALTER TABLE "TopicDependency" ADD COLUMN "generatedByClassId" INTEGER;

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClassChunk" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "embedding" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    CONSTRAINT "ClassChunk_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClassNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassNote_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicDoc" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topicId" INTEGER NOT NULL,
    "conceptos" TEXT NOT NULL,
    "ejemplos" TEXT NOT NULL,
    "casosDeUso" TEXT NOT NULL,
    "curiosidades" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TopicDoc_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExerciseTip" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "exerciseId" INTEGER NOT NULL,
    "tips" TEXT NOT NULL,
    "classContext" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExerciseTip_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "title" TEXT,
    "transcript" TEXT NOT NULL,
    "summary" TEXT,
    "topics" TEXT,
    "formulas" TEXT,
    "activities" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_ClassLog" ("createdAt", "date", "formulas", "id", "summary", "title", "topics", "transcript") SELECT "createdAt", "date", "formulas", "id", "summary", "title", "topics", "transcript" FROM "ClassLog";
DROP TABLE "ClassLog";
ALTER TABLE "new_ClassLog" RENAME TO "ClassLog";
CREATE TABLE "new_Exercise" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "topicId" INTEGER NOT NULL,
    "latex" TEXT NOT NULL,
    "difficulty" TEXT NOT NULL,
    "generatedByClassId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hints" TEXT,
    "steps" TEXT,
    "socratic" TEXT,
    CONSTRAINT "Exercise_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Exercise" ("createdAt", "difficulty", "hints", "id", "socratic", "steps", "topicId") SELECT "createdAt", "difficulty", "hints", "id", "socratic", "steps", "topicId" FROM "Exercise";
DROP TABLE "Exercise";
ALTER TABLE "new_Exercise" RENAME TO "Exercise";
CREATE TABLE "new_Topic" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdByClassId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Topic" ("createdAt", "id") SELECT "createdAt", "id" FROM "Topic";
DROP TABLE "Topic";
ALTER TABLE "new_Topic" RENAME TO "Topic";
CREATE UNIQUE INDEX "Topic_name_key" ON "Topic"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "ClassChunk_classId_idx" ON "ClassChunk"("classId");

-- CreateIndex
CREATE INDEX "ClassNote_classId_idx" ON "ClassNote"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicDoc_topicId_key" ON "TopicDoc"("topicId");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseTip_exerciseId_key" ON "ExerciseTip"("exerciseId");

-- CreateIndex
CREATE UNIQUE INDEX "TopicDependency_parentId_childId_key" ON "TopicDependency"("parentId", "childId");
