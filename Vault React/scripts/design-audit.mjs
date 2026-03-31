import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(process.cwd());
const repoRoot = path.resolve(projectRoot, "..");

function read(relativePath, fromRoot = projectRoot) {
  return fs.readFileSync(path.join(fromRoot, relativePath), "utf8");
}

function exists(relativePath, fromRoot = projectRoot) {
  return fs.existsSync(path.join(fromRoot, relativePath));
}

const pen = JSON.parse(read("untitled.pen", repoRoot));
const frameNames = new Set(
  (pen.children ?? [])
    .filter((node) => node.type === "frame")
    .map((node) => node.name)
);

const designFrames = [
  "1 — Home",
  "2 — Camera Scan",
  "3 — Processing",
  "4 — Scan Result",
  "5 — History",
  "6 — Item Details",
  "7 — AI Chat",
  "8 — Settings"
];

const audits = [
  {
    label: "Home screen structure",
    file: "src/features/home/HomeScreen.tsx",
    required: [
      'testID="home.screen"',
      'testID="home.title"',
      'testID="home.totalValue"',
      'testID="home.startScanButton"',
      'testID="home.viewAllButton"',
      'testID="home.recentScansSection"',
      'testPrefix="home.mode"'
    ]
  },
  {
    label: "Camera Scan structure",
    file: "src/features/scan/CameraScanScreen.tsx",
    required: [
      'testID="scan.screen"',
      'testID="scan.closeButton"',
      'testID="scan.captureButton"',
      'testID="scan.overlay"',
      'testPrefix="scan.mode"'
    ]
  },
  {
    label: "Processing structure",
    file: "src/features/scan/ProcessingScreen.tsx",
    required: [
      'testID="processing.screen"',
      'testID="processing.imagePreview"',
      'testID="processing.retakeButton"',
      'kind: "objectRecognition"',
      'kind: "conditionAssessment"',
      'kind: "priceLookup"',
      'kind: "historicalRecords"',
      'testID={`processing.step.${step.kind}`}',
      'testID="processing.sourcesLine"'
    ]
  },
  {
    label: "Result structure",
    file: "src/features/scan/ScanResultScreen.tsx",
    required: [
      'testID="result.screen"',
      'testID="result.image"',
      'testID="result.title"',
      'testID="result.subtitle"',
      'testID="result.confidence"',
      'testID="result.valueRange"',
      'testID="result.summary"',
      'testID="result.saveButton"',
      'testID="result.askAIButton"',
      'testID="result.shareButton"',
      'testID="result.disclaimer"'
    ]
  },
  {
    label: "Vault structure",
    file: "src/features/vault/VaultScreen.tsx",
    required: [
      'testID="vault.screen"',
      'testID="vault.title"',
      'testID="vault.searchField"',
      'testID="vault.itemCount"',
      'testID="vault.totalValue"',
      'testID="vault.grid"',
      'testID="vault.emptyState"'
    ]
  },
  {
    label: "Item details structure",
    file: "src/features/details/ItemDetailsScreen.tsx",
    required: [
      'testID="details.screen"',
      'testID="details.image"',
      'testID="details.title"',
      'testID="details.valueRange"',
      'testID="details.askAIButton"',
      'testID="details.shareButton"'
    ]
  },
  {
    label: "AI chat structure",
    file: "src/features/chat/AIChatScreen.tsx",
    required: [
      'testID="chat.screen"',
      'testID="chat.itemContext"',
      'testID="chat.inputField"',
      'testID="chat.sendButton"',
      'testID={`chat.suggestedQuestion.${index}`}',
      'testID={`chat.message.${message.role}.${index}`}'
    ]
  },
  {
    label: "Profile structure",
    file: "src/features/profile/ProfileScreen.tsx",
    required: [
      'testID="profile.screen"',
      'testID="profile.title"',
      'testID="profile.planRow"',
      'testID="profile.scansThisMonthRow"',
      'testID="profile.currencyRow"',
      'testID="profile.notificationsRow"',
      'testID="profile.exportDataRow"',
      'testID="profile.signOutRow"'
    ]
  },
  {
    label: "Tab shell structure",
    file: "src/shared/navigation/VaultTabBar.tsx",
    required: ['"tab.home"', '"tab.scan"', '"tab.vault"', '"tab.profile"']
  }
];

const tokenFile = read("src/shared/design-system/tokens.ts");
const tokenChecks = [
  { label: "Monochrome background", required: '#000000' },
  { label: "Monochrome foreground", required: '#FFFFFF' }
];

const failures = [];

console.log("Vault React design audit");
console.log("========================");

const missingFrames = designFrames.filter((frame) => !frameNames.has(frame));
if (missingFrames.length === 0) {
  console.log("PASS  Pencil design frames detected");
} else {
  console.log("FAIL  Pencil design frames detected");
  console.log(`      Missing frames: ${missingFrames.join(", ")}`);
  failures.push(...missingFrames.map((frame) => `Missing frame: ${frame}`));
}

for (const audit of audits) {
  if (!exists(audit.file)) {
    console.log(`FAIL  ${audit.label}`);
    console.log(`      File missing: ${audit.file}`);
    failures.push(`Missing file: ${audit.file}`);
    continue;
  }

  const source = read(audit.file);
  const missing = audit.required.filter((needle) => !source.includes(needle));
  if (missing.length === 0) {
    console.log(`PASS  ${audit.label}`);
  } else {
    console.log(`FAIL  ${audit.label}`);
    console.log(`      Missing markers: ${missing.join(", ")}`);
    failures.push(`${audit.label}: ${missing.join(", ")}`);
  }
}

for (const check of tokenChecks) {
  if (tokenFile.includes(check.required)) {
    console.log(`PASS  ${check.label}`);
  } else {
    console.log(`FAIL  ${check.label}`);
    console.log(`      Expected token not found: ${check.required}`);
    failures.push(`${check.label}: ${check.required}`);
  }
}

if (tokenFile.toLowerCase().includes("borderradius")) {
  console.log("FAIL  No rounded token usage");
  console.log("      Found borderRadius token usage in the design system tokens.");
  failures.push("Rounded token usage found in tokens.ts");
} else {
  console.log("PASS  No rounded token usage");
}

if (failures.length > 0) {
  console.error(`\nDesign audit failed with ${failures.length} issue(s).`);
  process.exit(1);
}

console.log("\nDesign audit passed with all required structural checks.");
