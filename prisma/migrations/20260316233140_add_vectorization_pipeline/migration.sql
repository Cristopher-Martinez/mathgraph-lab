-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ClassLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "title" TEXT,
    "transcript" TEXT NOT NULL,
    "transcriptHash" TEXT,
    "summary" TEXT,
    "topics" TEXT,
    "formulas" TEXT,
    "activities" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vectorized" BOOLEAN NOT NULL DEFAULT false,
    "vectorizedAt" DATETIME,
    "analyzed" BOOLEAN NOT NULL DEFAULT false,
    "analyzedAt" DATETIME,
    "analysisModel" TEXT,
    "deepAnalyzed" BOOLEAN NOT NULL DEFAULT false,
    "deepAnalyzedAt" DATETIME
);
INSERT INTO "new_ClassLog" ("activities", "createdAt", "date", "formulas", "id", "summary", "title", "topics", "transcript", "transcriptHash") SELECT "activities", "createdAt", "date", "formulas", "id", "summary", "title", "topics", "transcript", "transcriptHash" FROM "ClassLog";
DROP TABLE "ClassLog";
ALTER TABLE "new_ClassLog" RENAME TO "ClassLog";
CREATE INDEX "ClassLog_transcriptHash_createdAt_idx" ON "ClassLog"("transcriptHash", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
