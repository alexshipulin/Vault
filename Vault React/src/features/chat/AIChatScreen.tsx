import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";

import { useAppState } from "@src/app/AppProvider";
import type { ChatMessage, CollectibleItem, ItemChatContext, PreferredCurrency } from "@src/domain/models";
import {
  Chip,
  EmptyState,
  HeaderAction,
  MessageBubble,
  Panel,
  Screen,
  ScreenHeader,
  SecondaryButton,
  StickyActionBar,
  Thumbnail
} from "@src/shared/design-system/primitives";
import { colors, spacing, textStyles } from "@src/shared/design-system/tokens";
import { t } from "@src/shared/i18n/strings";
import {
  categoryDisplayName,
  collectibleListItemFromItem,
  conditionDisplayLabel,
  formatShortTime,
  valueRangeText
} from "@src/shared/utils/formatters";
import { createID } from "@src/shared/utils/id";

export function AIChatScreen() {
  const params = useLocalSearchParams<{ itemId: string }>();
  const router = useRouter();
  const { container, collectionVersion, selectedItem } = useAppState();
  const [context, setContext] = useState<ItemChatContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [draftMessage, setDraftMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(async () => {
    const [items, preferences] = await Promise.all([
      container.collectionRepository.fetchAll(),
      container.preferencesStore.load()
    ]);

    const stored = items.find((entry) => entry.id === params.itemId) ?? null;
    const resolvedContext = makeChatContext(stored, selectedItem, preferences.preferredCurrency);
    setContext(resolvedContext);

    const storedMessages = await container.itemChatSessionStore.load(resolvedContext.itemID);
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
    } else {
      const intro: ChatMessage = {
        id: createID("chat"),
        role: "assistant",
        content: container.chatResponseGenerator.introduction(resolvedContext),
        createdAt: new Date().toISOString()
      };
      setMessages([intro]);
      await container.itemChatSessionStore.save(resolvedContext.itemID, [intro]);
    }
    setQuickPrompts(container.chatResponseGenerator.suggestedPrompts(resolvedContext));
  }, [container, params.itemId, selectedItem]);

  useFocusEffect(
    useCallback(() => {
      void collectionVersion;
      void load();
    }, [collectionVersion, load])
  );

  const sendMessage = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !context || isSending) {
      return;
    }

    setDraftMessage("");
    setIsSending(true);

    const userMessage: ChatMessage = {
      id: createID("chat"),
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString()
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    await container.itemChatSessionStore.save(context.itemID, nextMessages);

    const reply = await container.chatResponseGenerator.response(trimmed, context, nextMessages);
    const assistantMessage: ChatMessage = {
      id: createID("chat"),
      role: "assistant",
      content: reply,
      createdAt: new Date().toISOString()
    };
    const updatedMessages = [...nextMessages, assistantMessage];
    setMessages(updatedMessages);
    await container.itemChatSessionStore.save(context.itemID, updatedMessages);
    setIsSending(false);
  };

  return (
    <Screen testID="chat.screen">
      <View style={{ flex: 1, paddingHorizontal: spacing.lg, paddingTop: 20, gap: spacing.lg }}>
        <ScreenHeader
          title={t("chat.title")}
          leftAction={<HeaderAction icon="chevron-back" onPress={() => router.back()} testID="chat.backButton" />}
          testID="chat.title"
        />

        {context ? (
          <>
            <Panel testID="chat.itemContext">
              <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
                <Thumbnail text={context.thumbnailText} size={56} />
                <View style={{ flex: 1, gap: spacing.xxs }}>
                  <Text style={[textStyles.rowTitle, { color: colors.foreground }]}>{context.titleText}</Text>
                  <Text style={[textStyles.body, { color: colors.foregroundMuted }]}>{context.subtitleText}</Text>
                  <Text style={[textStyles.micro, { color: colors.foregroundSubtle }]}>{context.priceText}</Text>
                </View>
              </View>
            </Panel>

            <Panel>
              <Text style={[textStyles.sectionLabel, { color: colors.foregroundSubtle }]}>
                {t("chat.quick_questions")}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  {quickPrompts.map((prompt, index) => (
                    <Chip
                      key={prompt}
                      title={prompt}
                      onPress={() => {
                        void sendMessage(prompt);
                      }}
                      testID={`chat.suggestedQuestion.${index}`}
                    />
                  ))}
                </View>
              </ScrollView>
            </Panel>

            <Panel>
              {messages.map((message, index) => (
                <MessageBubble
                  key={message.id}
                  content={message.content}
                  role={message.role}
                  timestamp={formatShortTime(message.createdAt)}
                  testID={`chat.message.${message.role}.${index}`}
                />
              ))}
            </Panel>
          </>
        ) : (
          <EmptyState title={t("chat.empty.title")} message={t("chat.empty.message")} />
        )}
      </View>

      {context ? (
        <StickyActionBar>
          <View style={{ flexDirection: "row", gap: spacing.sm }}>
            <TextInput
              placeholder={t("chat.input.placeholder")}
              placeholderTextColor={colors.foregroundFaint}
              style={{
                flex: 1,
                color: colors.foreground,
                borderWidth: 1,
                borderColor: colors.borderDefault,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm
              }}
              value={draftMessage}
              onChangeText={setDraftMessage}
              testID="chat.inputField"
            />
            <SecondaryButton
              title={t("chat.send")}
              onPress={() => {
                void sendMessage(draftMessage);
              }}
              disabled={!draftMessage.trim() || isSending}
              testID="chat.sendButton"
            />
          </View>
        </StickyActionBar>
      ) : null}
    </Screen>
  );
}

function makeChatContext(
  item: CollectibleItem | null,
  fallback: { id: string; title: string; subtitle: string; categoryText: string; valueText: string; noteText: string; thumbnailText: string } | null,
  currency: PreferredCurrency
): ItemChatContext {
  if (item) {
    const listItem = collectibleListItemFromItem(item, currency);
    return {
      itemID: item.id,
      titleText: item.name,
      subtitleText: `${categoryDisplayName(item.category)} · ${item.origin ?? fallback?.subtitle ?? t("common.unknown_origin")}`,
      category: ["coin", "vinyl", "antique", "card"].includes(String(item.category)) ? (item.category as ItemChatContext["category"]) : undefined,
      priceText: valueRangeText(item, currency),
      originText: item.origin ?? t("common.unknown_origin"),
      conditionText: conditionDisplayLabel(item.conditionRaw),
      year: item.year ?? null,
      noteText: item.historySummary || item.notes,
      thumbnailText: listItem.thumbnailText
    };
  }

  return {
    itemID: fallback?.id ?? paramsFallbackID(),
    titleText: fallback?.title ?? "Unknown item",
    subtitleText: `${fallback?.categoryText ?? t("common.unknown_category")} · ${fallback?.subtitle ?? t("common.unknown_origin")}`,
    priceText: fallback?.valueText ?? t("chat.value.unavailable"),
    originText: fallback?.subtitle ?? t("common.unknown_origin"),
    noteText: fallback?.noteText ?? "",
    thumbnailText: fallback?.thumbnailText ?? "VS"
  };
}

function paramsFallbackID(): string {
  return `fallback-${Date.now()}`;
}
