import Foundation
import Observation

// MARK: - AIChatViewModel

@MainActor
@Observable
final class AIChatViewModel {
    private let itemID: UUID?
    private let fallbackItem: CollectibleListItem?
    private let collectionRepository: CollectionRepositoryProtocol
    private let sessionStore: any ItemChatSessionStoring
    private let responseGenerator: any ItemChatResponseGenerating

    private(set) var context: ItemChatContext?
    private(set) var messages: [ChatMessage] = []
    private(set) var quickPrompts: [String] = []
    private(set) var isLoading = false
    private(set) var isSending = false
    private(set) var hasAttemptedLoad = false
    var draftMessage = ""

    init(
        itemID: UUID?,
        fallbackItem: CollectibleListItem?,
        collectionRepository: CollectionRepositoryProtocol,
        sessionStore: any ItemChatSessionStoring,
        responseGenerator: any ItemChatResponseGenerating
    ) {
        self.itemID = itemID
        self.fallbackItem = fallbackItem
        self.collectionRepository = collectionRepository
        self.sessionStore = sessionStore
        self.responseGenerator = responseGenerator
    }

    var hasLoadedContext: Bool {
        context != nil
    }

    var canSendDraft: Bool {
        draftMessage.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false && isSending == false
    }

    func loadIfNeeded() async {
        guard hasAttemptedLoad == false, isLoading == false else {
            return
        }

        await refresh()
    }

    func refresh() async {
        guard isLoading == false else {
            return
        }

        isLoading = true
        hasAttemptedLoad = true
        defer { isLoading = false }

        let resolvedContext = await resolveContext()
        context = resolvedContext
        quickPrompts = responseGenerator.suggestedPrompts(for: resolvedContext)

        let storedMessages = await sessionStore.messages(for: resolvedContext.itemID)
        if storedMessages.isEmpty {
            let introMessage = ChatMessage(
                id: UUID(),
                role: .assistant,
                content: responseGenerator.introduction(for: resolvedContext),
                createdAt: Date()
            )
            messages = [introMessage]
            await sessionStore.save(messages: messages, for: resolvedContext.itemID)
        } else {
            messages = storedMessages
        }
    }

    func sendDraft() async {
        let trimmed = draftMessage.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.isEmpty == false else {
            return
        }

        draftMessage = ""
        await send(message: trimmed)
    }

    func sendPrompt(_ prompt: String) async {
        await send(message: prompt)
    }
}

// MARK: - Sending

private extension AIChatViewModel {
    func send(message: String) async {
        guard isSending == false else {
            return
        }

        let resolvedContext: ItemChatContext
        if let context {
            resolvedContext = context
        } else {
            resolvedContext = await resolveContext()
        }
        context = resolvedContext
        quickPrompts = responseGenerator.suggestedPrompts(for: resolvedContext)

        isSending = true

        let userMessage = ChatMessage(
            id: UUID(),
            role: .user,
            content: message,
            createdAt: Date()
        )

        messages.append(userMessage)
        await sessionStore.save(messages: messages, for: resolvedContext.itemID)

        let responseText = await responseGenerator.response(
            to: message,
            context: resolvedContext,
            history: messages
        )

        let assistantMessage = ChatMessage(
            id: UUID(),
            role: .assistant,
            content: responseText,
            createdAt: Date()
        )

        messages.append(assistantMessage)
        await sessionStore.save(messages: messages, for: resolvedContext.itemID)
        isSending = false
    }
}

// MARK: - Context Resolution

private extension AIChatViewModel {
    func resolveContext() async -> ItemChatContext {
        let targetID = itemID ?? fallbackItem?.id ?? UUID()

        do {
            let items = try await collectionRepository.fetchAll()
            if let item = items.first(where: { $0.id == targetID }) {
                return makeContext(from: item)
            }
        } catch {
            // Fall back to the passed view state below.
        }

        if let fallbackItem {
            return makeFallbackContext(from: fallbackItem)
        }

        return makeFallbackContext(from: .placeholder)
    }

    func makeContext(from item: CollectibleItem) -> ItemChatContext {
        let displayItem = CollectibleListItem(item: item)
        let category = item.categoryEnum
        let conditionText = item.conditionGrade?.displayLabel
        let subtitleText = [displayItem.categoryText, displayItem.subtitle].joined(separator: " · ")

        return ItemChatContext(
            itemID: item.id,
            displayItem: displayItem,
            category: category,
            titleText: item.name,
            subtitleText: subtitleText,
            priceText: makePriceText(for: item),
            originText: item.origin ?? vsLocalized("feature.shared.unknown_origin"),
            conditionText: conditionText,
            year: item.year,
            noteText: item.historySummary.isEmpty ? item.notes : item.historySummary
        )
    }

    func makeFallbackContext(from item: CollectibleListItem) -> ItemChatContext {
        ItemChatContext(
            itemID: item.id,
            displayItem: item,
            category: category(from: item.categoryText),
            titleText: item.title,
            subtitleText: [item.categoryText, item.subtitle].joined(separator: " · "),
            priceText: item.valueText,
            originText: item.subtitle,
            conditionText: nil,
            year: nil,
            noteText: item.noteText
        )
    }

    func makePriceText(for item: CollectibleItem) -> String {
        let low = item.priceLow.map(decimalValue(from:))
        let high = item.priceHigh.map(decimalValue(from:))
        let mid = item.priceMid.map(decimalValue(from:))

        if let low, let high {
            return "\(CurrencyFormatter.string(from: low)) - \(CurrencyFormatter.string(from: high))"
        }

        if let mid {
            return CurrencyFormatter.string(from: mid)
        }

        if let low {
            return CurrencyFormatter.string(from: low)
        }

        if let high {
            return CurrencyFormatter.string(from: high)
        }

        return vsLocalized("feature.chat.value.unavailable")
    }

    func category(from text: String) -> CollectibleCategory? {
        let normalized = text.lowercased()

        if normalized.contains("coin") {
            return .coin
        }

        if normalized.contains("vinyl") {
            return .vinyl
        }

        if normalized.contains("antique") {
            return .antique
        }

        if normalized.contains("card") {
            return .card
        }

        return nil
    }

    func decimalValue(from amount: Double) -> Decimal {
        Decimal(string: String(amount)) ?? Decimal(amount)
    }
}
