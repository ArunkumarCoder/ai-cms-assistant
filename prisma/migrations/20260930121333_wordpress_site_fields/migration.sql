-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "wordpressAppPasswordCiphertext" TEXT,
ADD COLUMN     "wordpressUrl" TEXT,
ADD COLUMN     "wordpressUsername" TEXT,
ALTER COLUMN "sanityProjectId" DROP NOT NULL,
ALTER COLUMN "sanityDataset" DROP NOT NULL;
