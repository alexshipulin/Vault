export type AnalysisLogEntryKind = "stage" | "request" | "response" | "decision" | "warning" | "save";

export interface AnalysisLogEntry {
  at: string;
  elapsedMs: number;
  kind: AnalysisLogEntryKind;
  title: string;
  message: string;
  source?: string | null;
  details?: string[];
}

export interface AnalysisLogDocument {
  version: 1;
  createdAt: string;
  scanId?: string | null;
  appraisalMode: "standard" | "mystery";
  categoryHint: string;
  detectedCategory?: string | null;
  itemName?: string | null;
  finalSource?: string | null;
  entries: AnalysisLogEntry[];
  copyText: string;
}

type CreateAnalysisLogBuilderInput = {
  appraisalMode: "standard" | "mystery";
  categoryHint: string;
};

type BuildAnalysisLogInput = {
  scanId?: string | null;
  detectedCategory?: string | null;
  itemName?: string | null;
  finalSource?: string | null;
};

const MAX_DETAIL_COUNT = 4;
const MAX_LINE_LENGTH = 180;

function truncateLine(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (trimmed.length <= MAX_LINE_LENGTH) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_LINE_LENGTH - 1)}…`;
}

function sanitizeDetails(details: string[] | undefined): string[] | undefined {
  if (!details?.length) {
    return undefined;
  }

  const cleaned = details
    .map((detail) => truncateLine(detail))
    .filter(Boolean)
    .slice(0, MAX_DETAIL_COUNT);

  return cleaned.length ? cleaned : undefined;
}

function formatElapsed(elapsedMs: number): string {
  return elapsedMs >= 1_000 ? `${(elapsedMs / 1_000).toFixed(1)}s` : `${elapsedMs}ms`;
}

function entryPrefix(kind: AnalysisLogEntryKind): string {
  switch (kind) {
    case "request":
      return "Request";
    case "response":
      return "Response";
    case "decision":
      return "Decision";
    case "warning":
      return "Warning";
    case "save":
      return "Saved";
    case "stage":
    default:
      return "Stage";
  }
}

export function formatAnalysisLogCopyText(log: Omit<AnalysisLogDocument, "copyText">): string {
  const lines = [
    "VaultScope Analysis Log",
    `Mode: ${log.appraisalMode}`,
    `Category hint: ${log.categoryHint}`,
  ];

  if (log.scanId) {
    lines.push(`Scan ID: ${log.scanId}`);
  }
  if (log.detectedCategory) {
    lines.push(`Detected category: ${log.detectedCategory}`);
  }
  if (log.itemName) {
    lines.push(`Detected item: ${log.itemName}`);
  }
  if (log.finalSource) {
    lines.push(`Final source: ${log.finalSource}`);
  }

  lines.push("");
  lines.push("Timeline");

  for (const entry of log.entries) {
    lines.push(`[+${formatElapsed(entry.elapsedMs)}] ${entryPrefix(entry.kind)} · ${entry.title}`);
    lines.push(`  ${entry.message}`);
    if (entry.details?.length) {
      for (const detail of entry.details) {
        lines.push(`  - ${detail}`);
      }
    }
  }

  return lines.join("\n").trim();
}

export function attachScanIdToAnalysisLog(
  log: AnalysisLogDocument | null | undefined,
  scanId: string,
): AnalysisLogDocument | null {
  if (!log) {
    return null;
  }

  const base: Omit<AnalysisLogDocument, "copyText"> = {
    ...log,
    scanId,
  };

  return {
    ...base,
    copyText: formatAnalysisLogCopyText(base),
  };
}

export function createAnalysisLogBuilder({
  appraisalMode,
  categoryHint,
}: CreateAnalysisLogBuilderInput) {
  const createdAt = new Date().toISOString();
  const startedAt = Date.now();
  const entries: AnalysisLogEntry[] = [];

  return {
    add(
      kind: AnalysisLogEntryKind,
      title: string,
      message: string,
      options?: {
        source?: string | null;
        details?: string[];
      },
    ) {
      entries.push({
        at: new Date().toISOString(),
        elapsedMs: Date.now() - startedAt,
        kind,
        title: truncateLine(title),
        message: truncateLine(message),
        source: options?.source ?? null,
        details: sanitizeDetails(options?.details),
      });
    },

    build(input: BuildAnalysisLogInput = {}): AnalysisLogDocument {
      const base: Omit<AnalysisLogDocument, "copyText"> = {
        version: 1,
        createdAt,
        scanId: input.scanId ?? null,
        appraisalMode,
        categoryHint,
        detectedCategory: input.detectedCategory ?? null,
        itemName: input.itemName ?? null,
        finalSource: input.finalSource ?? null,
        entries: [...entries],
      };

      return {
        ...base,
        copyText: formatAnalysisLogCopyText(base),
      };
    },
  };
}
