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
const METALS_API_BASE = "https://api.metalpriceapi.com/v1";
const EBAY_OAUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token";
const EBAY_BROWSE_API_BASE = "https://api.ebay.com/buy/browse/v1";
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

function toBase64Ascii(value) {
  return Buffer.from(value, "utf8").toString("base64");
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
  const apiToken = env.PCGS_API_KEY || (env.PCGS_EMAIL && env.PCGS_PASSWORD ? `${env.PCGS_EMAIL}:${env.PCGS_PASSWORD}` : null);
  if (!apiToken) {
    throw new Error("Missing PCGS_API_KEY (or fallback PCGS_EMAIL + PCGS_PASSWORD)");
  }

  const gradeProbeUrl = new URL(`${PCGS_API_BASE}/coindetail/GetCoinFactsByGrade`);
  gradeProbeUrl.searchParams.set("PCGSNo", "7296");
  gradeProbeUrl.searchParams.set("GradeNo", "12");
  gradeProbeUrl.searchParams.set("PlusGrade", "false");
  const response = await fetch(gradeProbeUrl, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`PCGS grade probe failed (${response.status}): ${truncate(await response.text())}`);
  }

  const body = await response.json();
  if (body?.IsValidRequest === false) {
    throw new Error(`PCGS probe responded with invalid request: ${body?.ServerMessage ?? "unknown"}`);
  }

  return `grade probe ok pcgsNo=${body?.PCGSNo ?? "unknown"} name=${body?.Name ?? "unknown"}`;
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

  const url = new URL(`${METALS_API_BASE}/latest`);
  url.searchParams.set("api_key", env.METALS_API_KEY);
  url.searchParams.set("base", "USD");
  url.searchParams.set("currencies", "EUR,XAU,XAG,XPT,XPD");

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Metals probe failed (${response.status}): ${truncate(await response.text())}`);
  }

  const body = await response.json();
  if (body?.success === false) {
    throw new Error(`Metals probe returned success=false: ${body?.error?.message ?? body?.error?.code ?? "unknown error"}`);
  }

  const rates = body?.rates ?? {};
  const xau = typeof rates?.USDXAU === "number" ? rates.USDXAU : typeof rates?.XAU === "number" ? 1 / rates.XAU : null;
  const xag = typeof rates?.USDXAG === "number" ? rates.USDXAG : typeof rates?.XAG === "number" ? 1 / rates.XAG : null;

  if (!(xau > 0) || !(xag > 0)) {
    throw new Error("Metals probe response is missing USDXAU/USDXAG rates.");
  }

  return `metalpriceapi ok XAU=${xau.toFixed(2)} XAG=${xag.toFixed(2)}`;
}

async function probeEbay(env) {
  const clientId = env.EBAY_CLIENT_ID;
  const clientSecret = env.EBAY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Missing EBAY_CLIENT_ID or EBAY_CLIENT_SECRET");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 10_000);

  let token = null;

  try {
    const tokenResponse = await fetch(EBAY_OAUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${toBase64Ascii(`${clientId}:${clientSecret}`)}`,
      },
      body: `grant_type=client_credentials&scope=${encodeURIComponent("https://api.ebay.com/oauth/api_scope")}`,
      signal: controller.signal,
    });

    const tokenText = await tokenResponse.text();
    if (!tokenResponse.ok) {
      if (tokenResponse.status === 401 && /invalid_client/i.test(tokenText)) {
        throw new Error(
          "eBay OAuth failed (401 invalid_client). Verify EBAY_CLIENT_ID and EBAY_CLIENT_SECRET are active production credentials for the same eBay app.",
        );
      }
      throw new Error(`eBay OAuth failed (${tokenResponse.status}): ${truncate(tokenText)}`);
    }

    token = JSON.parse(tokenText)?.access_token ?? null;
    if (!token) {
      throw new Error("eBay OAuth succeeded but access token was missing.");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("eBay OAuth probe timed out after 10000ms");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const searchUrl = new URL(`${EBAY_BROWSE_API_BASE}/item_summary/search`);
  searchUrl.searchParams.set("q", "dragon carving box");
  searchUrl.searchParams.set("limit", "3");
  searchUrl.searchParams.set("filter", "buyingOptions:{FIXED_PRICE|AUCTION},itemLocationCountry:US");

  const searchResponse = await fetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });

  const searchText = await searchResponse.text();
  if (!searchResponse.ok) {
    throw new Error(`eBay browse probe failed (${searchResponse.status}): ${truncate(searchText)}`);
  }

  const parsed = JSON.parse(searchText);
  const count = Array.isArray(parsed?.itemSummaries) ? parsed.itemSummaries.length : 0;
  return `oauth ok + browse ok (${count} listing(s) returned for probe query)`;
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

async function probeFirebaseAnonymousAuth(env) {
  const apiKey = env.EXPO_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Missing EXPO_PUBLIC_FIREBASE_API_KEY");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        returnSecureToken: true,
      }),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    if (/CONFIGURATION_NOT_FOUND/i.test(text)) {
      throw new Error(
        "Anonymous auth is not configured for this Firebase project. Enable Authentication > Sign-in method > Anonymous.",
      );
    }
    throw new Error(`Anonymous auth probe failed (${response.status}): ${truncate(text)}`);
  }

  const parsed = JSON.parse(text);
  const localId = parsed?.localId;
  return `anonymous auth signUp ok (uid=${localId ?? "unknown"})`;
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
  rows.push(await runCheck("eBay marketplace", () => probeEbay(env)));
  rows.push(await runCheck("Firebase anonymous auth", () => probeFirebaseAnonymousAuth(env)));
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
