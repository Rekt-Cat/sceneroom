-- CreateTable
CREATE TABLE "collab_document" (
    "name" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collab_document_pkey" PRIMARY KEY ("name")
);
