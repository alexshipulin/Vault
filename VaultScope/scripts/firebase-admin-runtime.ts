import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "..");
const FIREBASERC_PATH = path.join(PROJECT_ROOT, ".firebaserc");
const SERVICE_ACCOUNT_PATH = path.join(PROJECT_ROOT, "serviceAccountKey.json");
const functionsRequire = createRequire(path.join(PROJECT_ROOT, "functions", "package.json"));

type FirebaseAdminAppModule = {
  applicationDefault: () => unknown;
  cert: (serviceAccount: Record<string, unknown>) => unknown;
  getApps: () => unknown[];
  initializeApp: (options?: Record<string, unknown>) => unknown;
};

type FirebaseAdminFirestoreModule = {
  getFirestore: () => {
    collection: (path: string) => {
      limit: (limit: number) => {
        get: () => Promise<{ size: number; forEach: (callback: (doc: { data: () => Record<string, unknown> }) => void) => void }>;
      };
      count: () => { get: () => Promise<{ data: () => { count: number } }> };
      orderBy: (fieldPath: string, direction?: "asc" | "desc") => {
        limit: (limit: number) => {
          get: () => Promise<{ empty: boolean; docs: Array<{ data: () => Record<string, unknown> }> }>;
        };
      };
      where: (fieldPath: string, opStr: string, value: unknown) => {
        limit: (limit: number) => {
          get: () => Promise<{ empty: boolean; size: number; docs: Array<{ data: () => Record<string, unknown> }> }>;
        };
        count: () => { get: () => Promise<{ data: () => { count: number } }> };
        where: (nestedFieldPath: string, nestedOpStr: string, nestedValue: unknown) => {
          limit: (limit: number) => {
            get: () => Promise<{ empty: boolean; size: number; docs: Array<{ data: () => Record<string, unknown> }> }>;
          };
          count: () => { get: () => Promise<{ data: () => { count: number } }> };
        };
      };
    };
  };
};

const adminApp = functionsRequire("firebase-admin/app") as FirebaseAdminAppModule;
const adminFirestore = functionsRequire("firebase-admin/firestore") as FirebaseAdminFirestoreModule;

function resolveProjectId(): string {
  const envProjectId = process.env.FIREBASE_PROJECT_ID?.trim();
  if (envProjectId) {
    return envProjectId;
  }

  if (!existsSync(FIREBASERC_PATH)) {
    throw new Error("VaultScope/.firebaserc is missing");
  }

  const parsed = JSON.parse(readFileSync(FIREBASERC_PATH, "utf8")) as {
    projects?: { default?: string };
  };
  const projectId = parsed.projects?.default?.trim();

  if (!projectId || projectId === "your-firebase-project-id" || projectId === "your-actual-firebase-project-id") {
    throw new Error("VaultScope/.firebaserc does not contain a real Firebase project ID");
  }

  return projectId;
}

export function initializeAdmin() {
  const projectId = resolveProjectId();

  if (adminApp.getApps().length === 0) {
    if (existsSync(SERVICE_ACCOUNT_PATH)) {
      const serviceAccount = JSON.parse(readFileSync(SERVICE_ACCOUNT_PATH, "utf8")) as Record<string, unknown>;
      adminApp.initializeApp({
        credential: adminApp.cert(serviceAccount),
        projectId
      });
    } else {
      adminApp.initializeApp({
        credential: adminApp.applicationDefault(),
        projectId
      });
    }
  }

  return {
    db: adminFirestore.getFirestore(),
    projectId
  };
}
