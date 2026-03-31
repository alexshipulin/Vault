import type { ChatMessage, ItemChatContext } from "@src/domain/models";
import { LocalMockChatResponseGenerator } from "@src/features/chat/LocalMockChatResponseGenerator";

const context: ItemChatContext = {
  itemID: "coin-1",
  titleText: "1909-S VDB Lincoln Cent",
  subtitleText: "Coins · United States",
  category: "coin",
  priceText: "$950 - $1,250",
  originText: "United States",
  conditionText: "About Uncirculated",
  year: 1909,
  noteText: "Key date cent.",
  thumbnailText: "19"
};

describe("LocalMockChatResponseGenerator", () => {
  it("produces an introduction and contextual prompts", () => {
    const generator = new LocalMockChatResponseGenerator();

    expect(generator.introduction(context)).toContain(context.titleText);
    expect(generator.suggestedPrompts(context)).toEqual(
      expect.arrayContaining(["Is it authentic?", "Rare variant?", "Where to sell?"])
    );
  });

  it("returns contextual replies for authenticity and selling prompts", async () => {
    const generator = new LocalMockChatResponseGenerator();
    const history: ChatMessage[] = [];

    await expect(generator.response("Is it authentic?", context, history)).resolves.toContain(context.titleText);
    await expect(generator.response("Where should I sell it?", context, history)).resolves.toContain(context.priceText);
  });

  it("handles empty prompts safely", async () => {
    const generator = new LocalMockChatResponseGenerator();

    await expect(generator.response("   ", context, [])).resolves.toContain("more specific question");
  });
});
