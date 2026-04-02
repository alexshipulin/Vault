"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractKeywords = extractKeywords;
const STOP_WORDS = new Set([
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
]);
function extractKeywords(text) {
    const tokens = text.toLowerCase().match(/[a-z0-9]+(?:'[a-z0-9]+)?/g) || [];
    const keywords = [];
    const seen = new Set();
    for (const token of tokens) {
        if (token.length <= 2 || STOP_WORDS.has(token) || seen.has(token)) {
            continue;
        }
        seen.add(token);
        keywords.push(token);
    }
    return keywords;
}
//# sourceMappingURL=keywords.js.map