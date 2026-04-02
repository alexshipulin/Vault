#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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

function normalizeKeywords(text) {
  const stopWords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "from", "into", "over", "under"]);
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/i)
        .map((keyword) => keyword.trim())
        .filter((keyword) => keyword.length > 2)
        .filter((keyword) => !stopWords.has(keyword)),
    ),
  ).slice(0, 10);
}

function buildPrompt(category, ocrText) {
  return [
    "Identify the collectible item shown in the attached images.",
    `User-selected category: "${category}".`,
    "You are identifying a coin or numismatic item.",
    "Look for denomination, mint mark, composition, variety, portrait, edge details, year, country, and notable wear.",
    `OCR text extracted from the item or label: """${ocrText}""". Use it only as supporting evidence.`,
    "Return JSON only. Do not wrap the response in markdown.",
    "Use this exact JSON shape: {\"category\":\"string\",\"name\":\"string\",\"year\":\"number | null\",\"origin\":\"string | null\",\"condition\":\"mint | near_mint | fine | very_good | good | poor\",\"conditionRange\":[\"condition\",\"condition\"],\"historySummary\":\"string\",\"confidence\":\"number\",\"searchKeywords\":[\"string\"],\"distinguishingFeatures\":[\"string\"]}",
  ].join("\n\n");
}

async function identifyWithGemini(apiKey, ocrText) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt("coin", ocrText) },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.2,
        maxOutputTokens: 500,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new Error("Gemini returned no text output.");
  }

  return JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
}

async function main() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  const env = parseDotEnv(readFileSync(envPath, "utf8"));
  const firebaseKeyPath = path.resolve(process.cwd(), "../VaultScope/serviceAccountKey.json");
  const serviceAccount = JSON.parse(readFileSync(firebaseKeyPath, "utf8"));

  if (!env.EXPO_PUBLIC_GEMINI_API_KEY) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY in Vault React/.env.local");
  }

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  const db = getFirestore();
  const ocrText = "1909-S VDB Lincoln Cent wheat penny key date coin";
  const identification = await identifyWithGemini(env.EXPO_PUBLIC_GEMINI_API_KEY, ocrText);
  const keywordSource = [identification.name, ...(identification.searchKeywords ?? []), ocrText].join(" ");
  const keywords = normalizeKeywords(keywordSource);

  let query = db.collection("antique_auctions").where("keywords", "array-contains-any", keywords.slice(0, 10));
  if (typeof identification.category === "string" && identification.category.trim()) {
    query = query.where("category", "==", identification.category.trim().toLowerCase());
  }
  query = query.orderBy("priceRealized", "desc").limit(5);

  const snapshot = await query.get();

  console.log("Gemini identification:");
  console.log(JSON.stringify(identification, null, 2));
  console.log("");
  console.log(`Firestore comparables found: ${snapshot.size}`);

  snapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`- ${data.title} | ${data.category} | $${data.priceRealized ?? "n/a"} | ${data.source}`);
  });

  if (snapshot.empty) {
    process.exitCode = 1;
    throw new Error("No Firestore comparables found for live analysis verification.");
  }
}

main().catch((error) => {
  console.error("Live analysis verification failed:", error);
  process.exit(1);
});
