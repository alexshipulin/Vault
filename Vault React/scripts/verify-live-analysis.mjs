#!/usr/bin/env node

import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const projectRoot = process.cwd();
const repoRoot = path.resolve(projectRoot, "..");
const firebaseAdminAppPath = path.resolve(
  projectRoot,
  "../VaultScope/functions/node_modules/firebase-admin/lib/app/index.js",
);
const firebaseAdminFirestorePath = path.resolve(
  projectRoot,
  "../VaultScope/functions/node_modules/firebase-admin/lib/firestore/index.js",
);
const { initializeApp, cert, getApps } = require(firebaseAdminAppPath);
const { getFirestore } = require(firebaseAdminFirestorePath);

const PCGS_API_BASE = "https://api.pcgs.com/publicapi";
const DISCOGS_API_BASE = "https://api.discogs.com";
const METALS_API_BASES = ["https://metals-api.com/api", "https://api.metals-api.com/api"];
const DISCOGS_USER_AGENT = "VaultScope/1.0 +https://vaultscope.app";

function parseDotEnv(raw) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((acc, line) => {
      const [key, ...rest] = line.split("=");
      acc[key] = rest.join("=").trim().replace(/^['"]|['"]$/g, "");
      return acc;
    }, {});
}

function loadEnv() {
  const env = {};

  for (const fileName of [".env.local", ".env"]) {
    const envPath = path.resolve(projectRoot, fileName);
    if (!existsSync(envPath)) {
      continue;
    }

    Object.assign(env, parseDotEnv(readFileSync(envPath, "utf8")));
  }

  return { ...env, ...process.env };
}

function summarizeError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function truncate(value, length = 220) {
  if (!value) {
    return value;
  }

  return value.length > length ? `${value.slice(0, length - 1)}…` : value;
}

function normalizeKeywords(text) {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "from",
    "into",
    "over",
    "under",
  ]);

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

async function runCheck(label, probe, { critical = false } = {}) {
  const startedAt = Date.now();

  try {
    const message = await probe();
    return {
      label,
      status: "PASS",
      critical,
      durationMs: Date.now() - startedAt,
      message,
    };
  } catch (error) {
    return {
      label,
      status: critical ? "FAIL" : "WARN",
      critical,
      durationMs: Date.now() - startedAt,
      message: truncate(summarizeError(error)),
    };
  }
}

async function probeGemini(env) {
  const apiKey = env.EXPO_PUBLIC_GEMINI_API_KEY;
  const model = env.EXPO_PUBLIC_GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_GEMINI_API_KEY");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: [
                  "Return compact JSON only.",
                  'Use shape: {"category":"general","name":"string","confidence":number}.',
                  "Name this probe object 'VaultScope readiness probe'.",
                ].join("\n"),
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.1,
          maxOutputTokens: 120,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini request failed (${response.status}): ${truncate(await response.text())}`);
  }

  const body = await response.json();
  const text = body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();

  if (!text) {
    throw new Error("Gemini returned no text output.");
  }

  const parsed = JSON.parse(text.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim());
  return `model=${model} category=${parsed.category ?? "unknown"} confidence=${parsed.confidence ?? "n/a"}`;
}

async function initAdmin(env) {
  const firebaseKeyPath = path.resolve(repoRoot, "VaultScope/serviceAccountKey.json");
  if (!existsSync(firebaseKeyPath)) {
    throw new Error("Missing VaultScope/serviceAccountKey.json");
  }

  const serviceAccount = JSON.parse(readFileSync(firebaseKeyPath, "utf8"));

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    });
  }

  return getFirestore();
}

async function probeFirestoreComparables(db) {
  const keywords = ["morgan", "dollar", "1921"];
  const snapshot = await db
    .collection("antique_auctions")
    .where("keywords", "array-contains-any", keywords)
    .limit(5)
    .get();

  if (snapshot.empty) {
    throw new Error("No comparable records returned for sample query [morgan, dollar, 1921].");
  }

  const first = snapshot.docs[0]?.data() ?? {};
  return `${snapshot.size} comparable(s), first=${first.title ?? "unknown"} source=${first.source ?? "unknown"}`;
}

async function probePcgs(env) {
  if (!env.PCGS_USERNAME || !env.PCGS_PASSWORD) {
    throw new Error("Missing PCGS_USERNAME or PCGS_PASSWORD");
  }

  const swaggerResponse = await fetch(`${PCGS_API_BASE}/swagger/docs/v1`);
  if (!swaggerResponse.ok) {
    throw new Error(`PCGS swagger unavailable (${swaggerResponse.status})`);
  }

  const swaggerText = await swaggerResponse.text();
  const exposesAuthEndpoint = swaggerText.includes("/account/authenticate");

  const authResponse = await fetch(`${PCGS_API_BASE}/account/authenticate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      userName: env.PCGS_USERNAME,
      password: env.PCGS_PASSWORD,
    }),
  });

  if (authResponse.status === 404) {
    throw new Error(
      `PCGS auth endpoint returned 404. Swagger docs do not expose /account/authenticate (${exposesAuthEndpoint ? "found" : "not found"} in swagger). Current username/password auth flow is not live-verifiable.`,
    );
  }

  if (!authResponse.ok) {
    throw new Error(`PCGS auth failed (${authResponse.status}): ${truncate(await authResponse.text())}`);
  }

  const authBody = await authResponse.json();
  const token = authBody?.token ?? authBody?.Token ?? authBody?.accessToken;

  if (!token) {
    throw new Error("PCGS auth succeeded but returned no token.");
  }

  const listingUrl = new URL(`${PCGS_API_BASE}/coindetail/GetCoinFactsListing`);
  listingUrl.searchParams.set("coinYear", "1921");
  listingUrl.searchParams.set("denomination", "Morgan Dollar");
  listingUrl.searchParams.set("mintMark", "S");

  const listingResponse = await fetch(listingUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      token,
    },
  });

  if (!listingResponse.ok) {
    throw new Error(`PCGS listing failed (${listingResponse.status}): ${truncate(await listingResponse.text())}`);
  }

  const listingBody = await listingResponse.json();
  const raw = Array.isArray(listingBody)
    ? listingBody
    : Array.isArray(listingBody?.Coins)
      ? listingBody.Coins
      : Array.isArray(listingBody?.Results)
        ? listingBody.Results
        : [];

  return `token ok, sample listing candidates=${raw.length}`;
}

async function probeDiscogs(env) {
  if (!env.DISCOGS_TOKEN) {
    throw new Error("Missing DISCOGS_TOKEN");
  }

  const headers = {
    Accept: "application/json",
    Authorization: `Discogs token=${env.DISCOGS_TOKEN}`,
    "User-Agent": DISCOGS_USER_AGENT,
  };

  const searchUrl = new URL(`${DISCOGS_API_BASE}/database/search`);
  searchUrl.searchParams.set("catno", "CL 1355");
  searchUrl.searchParams.set("type", "release");
  const searchResponse = await fetch(searchUrl, { headers });

  if (!searchResponse.ok) {
    throw new Error(`Discogs search failed (${searchResponse.status}): ${truncate(await searchResponse.text())}`);
  }

  const searchBody = await searchResponse.json();
  const release = Array.isArray(searchBody?.results) ? searchBody.results[0] : null;
  const releaseId = release?.id;

  if (!releaseId) {
    throw new Error("Discogs search returned no release id for CL 1355.");
  }

  const suggestionsResponse = await fetch(`${DISCOGS_API_BASE}/marketplace/price_suggestions/${releaseId}`, {
    headers,
  });

  if (suggestionsResponse.ok) {
    const suggestionsBody = await suggestionsResponse.json();
    const conditions = Object.keys(suggestionsBody ?? {});
    return `release=${releaseId} price_suggestions ok conditions=${conditions.length}`;
  }

  const suggestionsText = await suggestionsResponse.text();
  const shouldFallback =
    [401, 403, 404].includes(suggestionsResponse.status) ||
    /seller settings/i.test(suggestionsText);

  if (!shouldFallback) {
    throw new Error(`Discogs price suggestions failed (${suggestionsResponse.status}): ${truncate(suggestionsText)}`);
  }

  const statsResponse = await fetch(`${DISCOGS_API_BASE}/marketplace/stats/${releaseId}`, {
    headers,
  });

  if (!statsResponse.ok) {
    throw new Error(`Discogs stats fallback failed (${statsResponse.status}): ${truncate(await statsResponse.text())}`);
  }

  const statsBody = await statsResponse.json();
  const lowest = statsBody?.lowest_price?.value;
  return `release=${releaseId} fallback=stats lowest=${lowest ?? "n/a"}`;
}

async function probeMetals(env) {
  if (!env.METALS_API_KEY) {
    throw new Error("Missing METALS_API_KEY");
  }

  const attempts = [];

  for (const baseUrl of METALS_API_BASES) {
    const url = new URL(`${baseUrl}/latest`);
    url.searchParams.set("access_key", env.METALS_API_KEY);
    url.searchParams.set("base", "USD");
    url.searchParams.set("symbols", "XAU,XAG,XPT,XPD");

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        attempts.push(`${baseUrl} -> ${response.status}`);
        continue;
      }

      const body = await response.json();
      if (!body?.rates?.XAU || !body?.rates?.XAG) {
        attempts.push(`${baseUrl} -> missing rates`);
        continue;
      }

      return `${baseUrl} ok XAU=${body.rates.XAU} XAG=${body.rates.XAG}`;
    } catch (error) {
      attempts.push(`${baseUrl} -> ${truncate(summarizeError(error), 80)}`);
    }
  }

  throw new Error(`Metals probe failed across all base URLs: ${attempts.join(" | ")}`);
}

async function probeFirebasePersistence(db) {
  const probeId = `live_probe_${Date.now()}`;
  const docRef = db.collection("scan_results").doc(probeId);
  const now = new Date().toISOString();

  await docRef.set({
    userId: "live-probe",
    category: "general",
    images: [],
    scannedAt: now,
    analysisLog: {
      version: 1,
      createdAt: now,
      scanId: probeId,
      appraisalMode: "standard",
      categoryHint: "general",
      entries: [],
      copyText: "Live probe",
    },
  });

  const snapshot = await docRef.get();
  const exists = snapshot.exists;
  await docRef.delete();

  if (!exists) {
    throw new Error("scan_results write succeeded but readback failed.");
  }

  return `scan_results write/read/delete ok (${probeId})`;
}

function formatRow(row) {
  const label = row.label.padEnd(24, " ");
  const status = row.status.padEnd(4, " ");
  const duration = `${row.durationMs}ms`.padStart(7, " ");
  return `${status}  ${label} ${duration}  ${row.message}`;
}

async function main() {
  const env = loadEnv();
  const db = await initAdmin(env);

  const rows = [];
  rows.push(await runCheck("Gemini", () => probeGemini(env), { critical: true }));
  rows.push(await runCheck("Firestore comparables", () => probeFirestoreComparables(db), { critical: true }));
  rows.push(await runCheck("PCGS", () => probePcgs(env)));
  rows.push(await runCheck("Discogs", () => probeDiscogs(env)));
  rows.push(await runCheck("Metals", () => probeMetals(env)));
  rows.push(await runCheck("Firebase persistence", () => probeFirebasePersistence(db), { critical: true }));

  console.log("VaultScope live analysis verification");
  console.log("===================================");
  for (const row of rows) {
    console.log(formatRow(row));
  }

  const failures = rows.filter((row) => row.status === "FAIL");
  const warnings = rows.filter((row) => row.status === "WARN");

  if (warnings.length > 0) {
    console.log("");
    console.log(`Warnings: ${warnings.length} optional source probe(s) need attention.`);
  }

  if (failures.length > 0) {
    console.error("");
    console.error(`Blocking failures: ${failures.length}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Live analysis verification failed:", error);
  process.exit(1);
});
