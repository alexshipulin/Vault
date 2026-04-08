import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const projectRoot = path.resolve(__dirname, "..");
const repoRoot = projectRoot;

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function envKeys(content: string): Set<string> {
  return new Set(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => line.split("=", 1)[0]?.trim() ?? "")
      .filter(Boolean),
  );
}

describe("verification contracts", () => {
  it("keeps required secret placeholders in .env.example and actual values in .env.local", () => {
    const requiredKeys = [
      "PCGS_USERNAME",
      "PCGS_EMAIL",
      "PCGS_PASSWORD",
      "DISCOGS_TOKEN",
      "METALS_API_KEY",
    ];

    const envExample = readFile(".env.example");
    const envLocal = readFile(".env.local");
    const exampleKeys = envKeys(envExample);
    const localKeys = envKeys(envLocal);

    requiredKeys.forEach((key) => {
      expect(exampleKeys.has(key)).toBe(true);
      expect(localKeys.has(key)).toBe(true);
      expect(new RegExp(`^${key}=.+$`, "m").test(envLocal)).toBe(true);
    });
  });

  it("keeps local secret files out of git tracking", () => {
    const tracked = execSync("git ls-files -- '.env' '.env.local'", {
      cwd: repoRoot,
      encoding: "utf8",
    }).trim();

    expect(tracked).toBe("");
  });

  it("uses the general category hint and no longer references the experimental Gemini model", () => {
    const legacyRemote = readFile("src/data/remote/LegacyRemoteServices.ts");
    expect(legacyRemote).toContain('const categoryHint = "general";');
    expect(legacyRemote).not.toContain('? "general" : "coin"');

    expect(() =>
      execSync("rg -n 'gemini-2\\.0-flash-exp' .", {
        cwd: repoRoot,
        encoding: "utf8",
        stdio: "pipe",
      }),
    ).toThrow();
  });

  it("keeps the pricing router wired for PCGS, Discogs, Metals, Firestore, and AI fallback", () => {
    const source = readFile("src/services/pricing/priceRouter.ts");

    expect(source).toContain('identification.category === "coin"');
    expect(source).toContain("pcgsClient.safeLookup");
    expect(source).toContain('identification.category === "vinyl"');
    expect(source).toContain("discogsClient.lookupVinyl");
    expect(source).toContain("identification.isBullion === true");
    expect(source).toContain("metalsClient.estimateBullionValue");
    expect(source).toContain('source: "ai_estimate"');
    expect(source).toContain('"high" | "medium" | "low"');
  });
});
