import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(projectRoot, "..");

function fileExists(relativePath, fromRoot = projectRoot) {
  return fs.existsSync(path.join(fromRoot, relativePath));
}

function readText(relativePath, fromRoot = projectRoot) {
  return fs.readFileSync(path.join(fromRoot, relativePath), "utf8");
}

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, "");
      accumulator[key] = value;
      return accumulator;
    }, {});
}

function addCheck(target, group, label, passed, detail, blocking = true) {
  target.push({ group, label, passed, detail, blocking });
}

const checks = [];
const env = {
  ...parseDotEnv(path.join(projectRoot, ".env.local")),
  ...process.env
};

addCheck(
  checks,
  "Local flow",
  "Expo app shell exists",
  fileExists("app/_layout.tsx") && fileExists("app/(tabs)/_layout.tsx"),
  "Root stack and tab shell files must exist."
);
addCheck(
  checks,
  "Local flow",
  "App runtime moved out of router directories",
  fileExists("src/core/app/AppProvider.tsx") &&
    fileExists("src/core/app/container.ts") &&
    fileExists("src/core/app/runtime.ts") &&
    !fileExists("src/app"),
  "Runtime/container files should live in src/core/app and src/app should not exist."
);
addCheck(
  checks,
  "Local flow",
  "Mock analysis pipeline exists",
  fileExists("src/features/scan/FakeScanProcessingPipeline.ts") &&
    fileExists("src/features/scan/MockScanResultFactory.ts"),
  "Fake processing and mock result generation should be present."
);
addCheck(
  checks,
  "Local flow",
  "Local persistence exists",
  fileExists("src/data/local/AsyncStorageCollectionRepository.ts") &&
    fileExists("src/data/local/AsyncStorageTemporaryScanSessionStore.ts") &&
    fileExists("src/data/local/AsyncStoragePreferencesStore.ts"),
  "Collection, temporary session, and preferences stores should exist."
);
addCheck(
  checks,
  "Local flow",
  "Mock chat exists",
  fileExists("src/features/chat/LocalMockChatResponseGenerator.ts") &&
    fileExists("src/data/local/AsyncStorageItemChatSessionStore.ts"),
  "Item-specific AI chat mock and local chat store should exist."
);
addCheck(
  checks,
  "Search layer",
  "Remote search adapter present",
  fileExists("src/data/remote/LegacyRemoteServices.ts") &&
    fileExists("lib/firebase/search.ts"),
  "Legacy remote search bridge and Firebase search adapter should exist.",
  false
);
addCheck(
  checks,
  "Search layer",
  "Functions and scrapers are present",
  fileExists("VaultScope/functions/src/index.ts", repoRoot) &&
    fileExists("VaultScope/scrapers/run_all.py", repoRoot),
  "Cloud Functions and auction scrapers should exist in the legacy backend source.",
  false
);
addCheck(
  checks,
  "Expo workflow",
  "No stale native iOS directory is committed",
  !fileExists("ios"),
  "Expo Go is the primary workflow, so ios/ should not remain as stale generated source.",
  false
);
addCheck(
  checks,
  "Expo workflow",
  "No stale Detox config points at legacy app",
  !fileExists(".detoxrc.json"),
  "Legacy Detox config should be removed instead of pointing at the old VaultScopeMobile app.",
  false
);

const firebaseVars = [
  "EXPO_PUBLIC_FIREBASE_API_KEY",
  "EXPO_PUBLIC_FIREBASE_PROJECT_ID",
  "EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "EXPO_PUBLIC_FIREBASE_APP_ID",
  "EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"
];
const missingFirebaseVars = firebaseVars.filter((key) => !env[key]);
addCheck(
  checks,
  "Firebase",
  "Expo Firebase environment variables",
  missingFirebaseVars.length === 0,
  missingFirebaseVars.length === 0
    ? "All required Firebase Expo env vars are present."
    : `Missing: ${missingFirebaseVars.join(", ")}`
);

const firebaseRcExists = fileExists("VaultScope/.firebaserc", repoRoot);
const firebaseRcText = firebaseRcExists ? readText("VaultScope/.firebaserc", repoRoot) : "";
addCheck(
  checks,
  "Firebase",
  "Firebase project is not a placeholder",
  firebaseRcExists && !firebaseRcText.includes("your-firebase-project-id"),
  firebaseRcExists
    ? "The legacy Firebase project id should be real, not the placeholder from the template."
    : "VaultScope/.firebaserc is missing."
);

addCheck(
  checks,
  "Firebase",
  "Firebase rules/config files present",
  fileExists("VaultScope/firebase.json", repoRoot) &&
    fileExists("VaultScope/firestore.rules", repoRoot) &&
    fileExists("VaultScope/storage.rules", repoRoot),
  "firebase.json, firestore.rules, and storage.rules should exist.",
  false
);

const geminiReady = Boolean(env.EXPO_PUBLIC_GEMINI_API_KEY);
addCheck(
  checks,
  "AI",
  "Gemini API key configured",
  geminiReady,
  geminiReady ? "Gemini API key detected." : "EXPO_PUBLIC_GEMINI_API_KEY is missing."
);
addCheck(
  checks,
  "AI",
  "Legacy AI client exists",
  fileExists("lib/gemini/client.ts") && fileExists("lib/scan/pipeline.ts"),
  "Legacy Gemini client and scan pipeline must exist for remote integration.",
  false
);

const blockingFailures = checks.filter((check) => check.blocking && !check.passed);

console.log("Vault React readiness audit");
console.log("==========================");

for (const group of [...new Set(checks.map((check) => check.group))]) {
  console.log(`\n${group}`);
  for (const check of checks.filter((entry) => entry.group === group)) {
    console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.label}`);
    console.log(`      ${check.detail}`);
  }
}

if (blockingFailures.length > 0) {
  console.error(`\nBlocking readiness failures: ${blockingFailures.length}`);
  process.exit(1);
}

console.log("\nAll blocking readiness checks passed.");
