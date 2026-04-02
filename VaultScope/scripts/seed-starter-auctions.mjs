import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FIREBASERC_PATH = path.join(PROJECT_ROOT, ".firebaserc");
const SERVICE_ACCOUNT_PATH = path.join(PROJECT_ROOT, "serviceAccountKey.json");
const STARTER_DATA_PATH = path.join(PROJECT_ROOT, "data", "raw", "starter-seed.json");
const functionsRequire = createRequire(path.join(PROJECT_ROOT, "functions", "package.json"));

const {
  cert,
  getApps,
  initializeApp,
} = functionsRequire("firebase-admin/app");
const { getFirestore } = functionsRequire("firebase-admin/firestore");

function resolveProjectId() {
  const envProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (envProjectId) {
    return envProjectId;
  }

  const parsed = JSON.parse(readFileSync(FIREBASERC_PATH, "utf8"));
  const projectId = parsed?.projects?.default?.trim();
  if (!projectId) {
    throw new Error("VaultScope/.firebaserc does not contain a valid Firebase project ID");
  }
  return projectId;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function buildDocId(source, title) {
  return createHash("sha1")
    .update(`${source.toLowerCase()}::${title.toLowerCase()}`)
    .digest("hex");
}

function ensureAdmin(projectId) {
  if (getApps().length > 0) {
    return;
  }

  if (!existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new Error(`Missing service account file at ${SERVICE_ACCOUNT_PATH}`);
  }

  const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  initializeApp({
    credential: cert(serviceAccount),
    projectId,
  });
}

async function main() {
  const projectId = resolveProjectId();
  ensureAdmin(projectId);

  if (!existsSync(STARTER_DATA_PATH)) {
    throw new Error(`Starter seed file not found at ${STARTER_DATA_PATH}`);
  }

  const items = JSON.parse(readFileSync(STARTER_DATA_PATH, "utf8"));
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Starter seed file is empty");
  }

  const db = getFirestore();
  const batch = db.batch();
  let count = 0;

  for (const item of items) {
    const title = normalizeText(item.title);
    const source = normalizeText(item.source) || "starter-seed";
    if (!title) {
      continue;
    }

    const docId = buildDocId(source, title);
    const ref = db.collection("antique_auctions").doc(docId);
    batch.set(
      ref,
      {
        ...item,
        title,
        source,
        updatedAt: new Date().toISOString(),
        createdAt: item.scrapedAt ?? new Date().toISOString(),
      },
      { merge: true },
    );
    count += 1;
  }

  await batch.commit();
  console.log(`✅ Seeded ${count} starter auction documents into antique_auctions for ${projectId}`);
}

main().catch((error) => {
  console.error("❌ Failed to seed starter auction data");
  console.error(error);
  process.exit(1);
});
