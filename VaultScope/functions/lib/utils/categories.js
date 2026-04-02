"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detectCategory = detectCategory;
exports.normalizeCategory = normalizeCategory;
const CATEGORY_RULES = {
    furniture: ["furniture", "chair", "table"],
    ceramics: ["ceramic", "porcelain", "pottery", "vase"],
    art: ["painting", "art", "print", "canvas"],
    jewelry: ["jewelry", "ring", "necklace", "bracelet"],
    general: [],
};
function detectCategory(title) {
    const normalized = title.toLowerCase();
    for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
        if (category === "general") {
            continue;
        }
        if (keywords.some((keyword) => normalized.includes(keyword))) {
            return category;
        }
    }
    return "general";
}
function normalizeCategory(value) {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "furniture") {
        return "furniture";
    }
    if (normalized === "ceramics" || normalized === "ceramic") {
        return "ceramics";
    }
    if (normalized === "art") {
        return "art";
    }
    if (normalized === "jewelry" || normalized === "jewellery") {
        return "jewelry";
    }
    return "general";
}
//# sourceMappingURL=categories.js.map