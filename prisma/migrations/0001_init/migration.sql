-- Migration initiale ServiSen
-- Générée automatiquement par Prisma lors de : npx prisma migrate dev --name init
-- Ne pas modifier manuellement

-- CreateEnum
CREATE TYPE "TypeCompte" AS ENUM ('INDIVIDUEL', 'ENTREPRISE');
CREATE TYPE "StatutMission" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE', 'EXPIREE', 'COMPLETEE');
CREATE TYPE "TypePaiement" AS ENUM ('ABONNEMENT_CLIENT', 'INSCRIPTION_PRESTATAIRE', 'MENSUALITE_PRESTATAIRE');
CREATE TYPE "StatutPaiement" AS ENUM ('EN_ATTENTE', 'SUCCES', 'ECHEC', 'ANNULE');

-- CreateTable clients
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "ville" TEXT,
    "quartier" TEXT,
    "abonne" BOOLEAN NOT NULL DEFAULT false,
    "dateAbonnement" TIMESTAMP(3),
    "fcmToken" TEXT,
    "bloque" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "clients_telephone_key" ON "clients"("telephone");

-- CreateTable prestataires
CREATE TABLE "prestataires" (
    "id" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "typeCompte" "TypeCompte" NOT NULL DEFAULT 'INDIVIDUEL',
    "metier" TEXT NOT NULL,
    "description" TEXT,
    "region" TEXT NOT NULL,
    "ville" TEXT,
    "quartier" TEXT,
    "photo" TEXT,
    "cniRecto" TEXT,
    "cniVerso" TEXT,
    "certificat" TEXT,
    "noteAverage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalMissions" INTEGER NOT NULL DEFAULT 0,
    "disponible" BOOLEAN NOT NULL DEFAULT true,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "bloque" BOOLEAN NOT NULL DEFAULT false,
    "fcmToken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prestataires_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prestataires_telephone_key" ON "prestataires"("telephone");

-- CreateTable missions
CREATE TABLE "missions" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "prestataireId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photoUrl" TEXT,
    "statut" "StatutMission" NOT NULL DEFAULT 'EN_ATTENTE',
    "refusRaison" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "refusedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "missions_pkey" PRIMARY KEY ("id")
);

-- CreateTable paiements
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "waveSessionId" TEXT NOT NULL,
    "wavePaymentId" TEXT,
    "montant" INTEGER NOT NULL,
    "devise" TEXT NOT NULL DEFAULT 'XOF',
    "typePaiement" "TypePaiement" NOT NULL,
    "statut" "StatutPaiement" NOT NULL DEFAULT 'EN_ATTENTE',
    "clientId" TEXT,
    "prestataireId" TEXT,
    "mensualiteId" TEXT,
    "webhookRecu" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "paiements_waveSessionId_key" ON "paiements"("waveSessionId");
CREATE UNIQUE INDEX "paiements_mensualiteId_key" ON "paiements"("mensualiteId");

-- CreateTable mensualites
CREATE TABLE "mensualites" (
    "id" TEXT NOT NULL,
    "prestataireId" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "nbMissions" INTEGER NOT NULL DEFAULT 0,
    "montantDu" INTEGER NOT NULL,
    "payee" BOOLEAN NOT NULL DEFAULT false,
    "datePaiement" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mensualites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "mensualites_prestataireId_mois_annee_key" ON "mensualites"("prestataireId", "mois", "annee");

-- CreateTable avis
CREATE TABLE "avis" (
    "id" TEXT NOT NULL,
    "missionId" TEXT NOT NULL,
    "note" INTEGER NOT NULL,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "avis_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "avis_missionId_key" ON "avis"("missionId");

-- CreateTable otp_sessions
CREATE TABLE "otp_sessions" (
    "id" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "typeUtilisateur" TEXT NOT NULL,
    "verifie" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT,
    "prestataireId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable parametres
CREATE TABLE "parametres" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "valeur" TEXT NOT NULL,
    "label" TEXT,
    CONSTRAINT "parametres_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "parametres_cle_key" ON "parametres"("cle");

-- AddForeignKeys
ALTER TABLE "missions" ADD CONSTRAINT "missions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "missions" ADD CONSTRAINT "missions_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "prestataires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "prestataires"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_mensualiteId_fkey" FOREIGN KEY ("mensualiteId") REFERENCES "mensualites"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "mensualites" ADD CONSTRAINT "mensualites_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "prestataires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "avis" ADD CONSTRAINT "avis_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "missions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "otp_sessions" ADD CONSTRAINT "otp_sessions_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "otp_sessions" ADD CONSTRAINT "otp_sessions_prestataireId_fkey" FOREIGN KEY ("prestataireId") REFERENCES "prestataires"("id") ON DELETE SET NULL ON UPDATE CASCADE;
