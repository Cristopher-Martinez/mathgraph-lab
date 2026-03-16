-- AlterTable
ALTER TABLE "ClassLog" ADD COLUMN "transcriptHash" TEXT;

-- CreateIndex
CREATE INDEX "ClassLog_transcriptHash_createdAt_idx" ON "ClassLog"("transcriptHash", "createdAt");
