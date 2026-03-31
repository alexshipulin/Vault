import type { ChatResponseGenerator } from "@src/domain/contracts";
import type { ChatMessage, ItemChatContext } from "@src/domain/models";
import { t } from "@src/shared/i18n/strings";

export class LocalMockChatResponseGenerator implements ChatResponseGenerator {
  introduction(context: ItemChatContext): string {
    return t("chat.intro_format")
      .replace("%1$s", context.titleText)
      .replace("%2$s", context.subtitleText)
      .replace("%3$s", context.priceText);
  }

  suggestedPrompts(context: ItemChatContext): string[] {
    switch (context.category) {
      case "coin":
        return [t("chat.prompt.authentic"), t("chat.prompt.rare_variant"), t("chat.prompt.sell")];
      case "vinyl":
        return [t("chat.prompt.first_pressing"), t("chat.prompt.sell"), t("chat.prompt.storage")];
      case "antique":
        return [t("chat.prompt.authentic"), t("chat.prompt.maker"), t("chat.prompt.sell")];
      case "card":
        return [t("chat.prompt.authentic"), t("chat.prompt.grade"), t("chat.prompt.rare_variant")];
      default:
        return [t("chat.prompt.authentic"), t("chat.prompt.sell"), t("chat.prompt.storage")];
    }
  }

  async response(message: string, context: ItemChatContext, history: ChatMessage[]): Promise<string> {
    const normalized = message.trim().toLowerCase();
    const turn = history.filter((entry) => entry.role === "user").length + 1;

    await new Promise((resolve) => setTimeout(resolve, 250));

    if (!normalized) {
      return `I need a more specific question about ${context.titleText}.`;
    }

    if (normalized.includes("authentic") || normalized.includes("real")) {
      return `For ${context.titleText}, I would verify construction details, maker marks, and close-up wear patterns before trusting the current ${context.priceText} estimate as fully authentic.`;
    }

    if (normalized.includes("sell") || normalized.includes("where")) {
      return `If you want to sell ${context.titleText}, start with a collector-focused marketplace where the ${context.subtitleText.toLowerCase()} details can be documented properly. That gives the ${context.priceText} range more credibility.`;
    }

    if (normalized.includes("rare") || normalized.includes("variant")) {
      return `The rarity question for ${context.titleText} depends on specific identifying details, not just the broad category. I would compare the year, maker clues, and any numbering before treating it as a rare variant.`;
    }

    if (normalized.includes("grade") || normalized.includes("condition")) {
      return `The saved item currently points to ${context.conditionText ?? "an unconfirmed condition band"}. Better closeups of edges, surfaces, and wear hotspots would tighten the pricing view.`;
    }

    if (normalized.includes("store")) {
      return `For ${context.titleText}, I would focus on stable temperature, low humidity, and gentle handling. Preserving condition is usually the fastest way to protect value.`;
    }

    if (normalized.includes("maker")) {
      return `To narrow down the maker for ${context.titleText}, I would look for stamps, engravings, serial patterns, or manufacturing tells before relying on the market estimate alone.`;
    }

    return `For ${context.titleText}, the strongest clue right now is ${context.subtitleText.toLowerCase()}, and the current local estimate is ${context.priceText}. Ask next about authenticity, sale venue, or rarity if you want a more focused answer. (Turn ${turn})`;
  }
}
