import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

type EnvMap = Record<string, string>;

function parseDotEnv(raw: string): EnvMap {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .reduce<EnvMap>((acc, line) => {
      const [key, ...rest] = line.split("=");
      acc[key] = rest.join("=").trim();
      return acc;
    }, {});
}

const projectRoot = path.join(__dirname, "..", "..");
const envPath = path.join(projectRoot, ".env.local");
const envFile = readFileSync(envPath, "utf8");
const env = parseDotEnv(envFile);
const hasLiveConfig = Boolean(
  env.EXPO_PUBLIC_FIREBASE_API_KEY &&
    env.EXPO_PUBLIC_FIREBASE_PROJECT_ID &&
    env.EXPO_PUBLIC_GEMINI_API_KEY,
);
const runLiveAnalysisTest = process.env.RUN_LIVE_ANALYSIS_TEST === "true";

const liveIt = hasLiveConfig && runLiveAnalysisTest ? it : it.skip;

describe("live remote analysis verification", () => {
  liveIt(
    "verifies real live analysis dependencies and persistence through the probe script",
    () => {
      const output = execFileSync("node", ["scripts/verify-live-analysis.mjs"], {
        cwd: projectRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });

      expect(output).toContain("PASS  Gemini");
      expect(output).toContain("PASS  Firestore comparables");
      expect(output).toContain("PASS  Discogs");
      expect(output).toContain("PASS  Firebase persistence");
      expect(output).not.toContain("FAIL");
    },
    30_000,
  );
});
