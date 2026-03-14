-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN "hints" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "socratic" TEXT;
ALTER TABLE "Exercise" ADD COLUMN "steps" TEXT;

-- CreateTable
CREATE TABLE "ClassLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" DATETIME NOT NULL,
    "title" TEXT,
    "transcript" TEXT NOT NULL,
    "summary" TEXT,
    "topics" TEXT,
    "formulas" TEXT,
    "exercises" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ClassImage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "classId" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,
    CONSTRAINT "ClassImage_classId_fkey" FOREIGN KEY ("classId") REFERENCES "ClassLog" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TopicDependency" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "parentId" INTEGER NOT NULL,
    "childId" INTEGER NOT NULL
);
