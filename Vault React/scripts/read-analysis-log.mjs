#!/usr/bin/env node

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const firebaseAdminAppPath = path.resolve(
  process.cwd(),
  "../VaultScope/functions/node_modules/firebase-admin/lib/app/index.js",
);
const firebaseAdminFirestorePath = path.resolve(
  process.cwd(),
  "../VaultScope/functions/node_modules/firebase-admin/lib/firestore/index.js",
);
const { initializeApp, cert, getApps } = require(firebaseAdminAppPath);
const { getFirestore } = require(firebaseAdminFirestorePath);

function parseDotEnv(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split("=");
      acc[key] = rest.join("=").trim();
      return acc;
    }, {});
}

function loadEnv() {
  const localPath = path.resolve(process.cwd(), ".env.local");
  const fallbackPath = path.resolve(process.cwd(), ".env");
  const envPath = existsSync(localPath) ? localPath : fallbackPath;

  if (!existsSync(envPath)) {
    throw new Error("Missing .env.local (or .env) in Vault React.");
  }

  return parseDotEnv(readFileSync(envPath, "utf8"));
}

function usage() {
  console.log("Usage:");
  console.log("  npm run logs:analysis -- <scanId>");
  console.log("  npm run logs:analysis -- --latest");
  console.log("  npm run logs:analysis");
  console.log("");
  console.log("If no scanId is provided, the most recent scan log is printed.");
}

async function resolveSnapshot(db, scanId) {
  if (scanId) {
    const snapshot = await db.collection("scan_results").doc(scanId).get();
    if (!snapshot.exists) {
      throw new Error(`scan_results/${scanId} was not found.`);
    }
    return snapshot;
  }

  const latestSnapshot = await db
    .collection("scan_results")
    .orderBy("scannedAt", "desc")
    .limit(1)
    .get();

  if (latestSnapshot.empty) {
    throw new Error("No scan_results documents were found.");
  }

  return latestSnapshot.docs[0];
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    usage();
    return;
  }

  const requestedScanId = args.find((argument) => argument !== "--latest") ?? null;
  const env = loadEnv();
  const firebaseKeyPath = path.resolve(process.cwd(), "../VaultScope/serviceAccountKey.json");
  const serviceAccount = JSON.parse(readFileSync(firebaseKeyPath, "utf8"));

  if (!env.EXPO_PUBLIC_FIREBASE_PROJECT_ID) {
    throw new Error("Missing EXPO_PUBLIC_FIREBASE_PROJECT_ID in .env.local or .env");
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  const db = getFirestore();
  const snapshot = await resolveSnapshot(db, requestedScanId);
  const data = snapshot.data();
  const analysisLog = data?.analysisLog ?? null;

  console.log(`Scan ID: ${snapshot.id}`);
  console.log(`Scanned at: ${data?.scannedAt ?? "unknown"}`);
  console.log("");

  if (analysisLog?.copyText) {
    console.log(analysisLog.copyText);
    return;
  }

  console.log("No saved analysis log was found for this scan.");
}

main().catch((error) => {
  console.error("Failed to read analysis log:", error);
  process.exit(1);
});
