import Foundation

// MARK: - ItemChatContext

struct ItemChatContext: Sendable, Equatable {
    let itemID: UUID
    let displayItem: CollectibleListItem
    let category: CollectibleCategory?
    let titleText: String
    let subtitleText: String
    let priceText: String
    let originText: String
    let conditionText: String?
    let year: Int?
    let noteText: String
}

// MARK: - ItemChatResponseGenerating

protocol ItemChatResponseGenerating {
    func suggestedPrompts(for context: ItemChatContext) -> [String]
    func introduction(for context: ItemChatContext) -> String
    func response(
        to message: String,
        context: ItemChatContext,
        history: [ChatMessage]
    ) async -> String
}

// MARK: - LocalMockItemChatResponseGenerator

final class LocalMockItemChatResponseGenerator: ItemChatResponseGenerating {
    func suggestedPrompts(for context: ItemChatContext) -> [String] {
        switch context.category {
        case .coin:
            return [
                vsLocalized("feature.chat.prompt.authentic"),
                vsLocalized("feature.chat.prompt.rare_variant"),
                vsLocalized("feature.chat.prompt.sell")
            ]
        case .vinyl:
            return [
                vsLocalized("feature.chat.prompt.first_pressing"),
                vsLocalized("feature.chat.prompt.sell"),
                vsLocalized("feature.chat.prompt.storage")
            ]
        case .antique:
            return [
                vsLocalized("feature.chat.prompt.authentic"),
                vsLocalized("feature.chat.prompt.maker"),
                vsLocalized("feature.chat.prompt.sell")
            ]
        case .card:
            return [
                vsLocalized("feature.chat.prompt.authentic"),
                vsLocalized("feature.chat.prompt.grade"),
                vsLocalized("feature.chat.prompt.rare_variant")
            ]
        case .none:
            return [
                vsLocalized("feature.chat.prompt.authentic"),
                vsLocalized("feature.chat.prompt.sell"),
                vsLocalized("feature.chat.prompt.storage")
            ]
        }
    }

    func introduction(for context: ItemChatContext) -> String {
        let title = context.titleText
        let category = context.displayItem.categoryText
        let price = context.priceText

        return String(
            format: NSLocalizedString("feature.chat.intro_format", comment: ""),
            title,
            category,
            price
        )
    }

    func response(
        to message: String,
        context: ItemChatContext,
        history: [ChatMessage]
    ) async -> String {
        let normalized = message.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let historyCount = history.filter { $0.role == .user }.count

        try? await Task.sleep(nanoseconds: 250_000_000)

        if normalized.contains("authentic") || normalized.contains("real") || normalized.contains("genuine") {
            return authenticityResponse(for: context)
        }

        if normalized.contains("sell") || normalized.contains("marketplace") || normalized.contains("auction") {
            return sellingResponse(for: context)
        }

        if normalized.contains("rare") || normalized.contains("variant") || normalized.contains("key date") {
            return rarityResponse(for: context)
        }

        if normalized.contains("grade") || normalized.contains("condition") {
            return conditionResponse(for: context)
        }

        if normalized.contains("store") || normalized.contains("protect") || normalized.contains("safely") {
            return storageResponse(for: context)
        }

        if normalized.contains("maker") || normalized.contains("who made") || normalized.contains("manufact") {
            return makerResponse(for: context)
        }

        if normalized.contains("pressing") || normalized.contains("runout") || normalized.contains("matrix") {
            return pressingResponse(for: context)
        }

        return generalResponse(for: context, turn: historyCount + 1)
    }
}

// MARK: - Response Helpers

private extension LocalMockItemChatResponseGenerator {
    func authenticityResponse(for context: ItemChatContext) -> String {
        switch context.category {
        case .coin:
            return "For \(context.titleText), I would verify weight, diameter, edge details, and the mint mark against trusted reference photos. At the current saved estimate of \(context.priceText), sharper obverse, reverse, and edge shots would be the next step before calling it authentic."
        case .vinyl:
            return "For this record, authenticity usually comes down to the runout or matrix marks, label layout, and sleeve printing details. I would compare those against a documented pressing entry before relying on the current \(context.priceText) estimate."
        case .antique:
            return "For an antique like \(context.titleText), I would look for construction clues, maker marks, and wear that makes sense for the claimed age. Provenance and close photos of joins, hardware, and the base would matter more than the estimate alone."
        case .card:
            return "For a card, I would check stock texture, print pattern, edges, and any numbering or holo treatment against known authentic examples. If this piece might be valuable, a grading submission would be the safest next proof point."
        case .none:
            return "Authenticity usually comes from physical details, provenance, and strong comparison photos. I would treat the saved estimate as directional until you verify maker marks, serials, or other unique identifiers."
        }
    }

    func sellingResponse(for context: ItemChatContext) -> String {
        switch context.category {
        case .coin:
            return "For \(context.titleText), I would start with collector-focused marketplaces and auction venues where condition language matters. If you want speed, a large marketplace works, but if you want stronger trust around the \(context.priceText) range, specialist coin channels are better."
        case .vinyl:
            return "For vinyl, the best sale venue depends on how certain you are about the pressing and condition. Collector marketplaces tend to reward accurate runout details, while general marketplaces are faster but usually less precise on premium pricing."
        case .antique:
            return "For antiques, local high-end dealers and curated online marketplaces are usually better than generic listings. The more you can document origin, maker, and wear honestly, the more believable the \(context.priceText) range becomes."
        case .card:
            return "For cards, sale strategy depends on whether it is graded. Raw cards move fastest on broad marketplaces, but if the condition could support a premium tier, grading first can make the pricing more defensible."
        case .none:
            return "I would choose a sale venue based on how documented the item is and how wide the potential buyer pool is. Specialist buyers usually pay more when the identifying details are clearly proven."
        }
    }

    func rarityResponse(for context: ItemChatContext) -> String {
        let yearFragment = context.year.map { " from \($0)" } ?? ""

        switch context.category {
        case .coin:
            return "A rare variant question for \(context.titleText)\(yearFragment) usually comes down to mint mark, die variety, and key-date status. I would inspect the date, lettering, and mint area closely because those details can matter more than the broad category."
        case .vinyl:
            return "For a record, the rare variant signal is usually in the pressing details rather than the cover alone. Early matrix codes, label text, and country-specific first issues are what I would compare next."
        case .antique:
            return "For antiques, rarity is often tied to workshop, maker, region, and surviving examples rather than a simple model name. Any stamp, label, or material-specific construction detail could change how special it is."
        case .card:
            return "For cards, the rare variant question usually points to parallel type, print run, or short-print indicators. Serial numbering, foil treatment, and set-specific variant markers would be the first things I would verify."
        case .none:
            return "A rare variant usually depends on small identifying details rather than the broad object type. If you can isolate markings, numbering, or production clues, the answer becomes much more reliable."
        }
    }

    func conditionResponse(for context: ItemChatContext) -> String {
        if let conditionText = context.conditionText {
            return "Right now the saved record points to \(conditionText.lowercased()) condition for \(context.titleText). To tighten that judgment, I would want closer photos of edges, surfaces, and any wear hotspots that buyers care about most in this category."
        }

        return "Condition is still the biggest unknown for this item. Better closeups of wear, corners, surfaces, or labels would make the pricing discussion much more reliable."
    }

    func storageResponse(for context: ItemChatContext) -> String {
        switch context.category {
        case .coin:
            return "For coins, I would avoid PVC holders, keep handling to the edges, and store in a stable low-humidity environment. That helps preserve whatever value band this item could reasonably hold."
        case .vinyl:
            return "For vinyl, upright storage, inner sleeves that do not scuff, and temperature stability matter most. Protecting the cover and the playing surface is the fastest way to preserve collectibility."
        case .antique:
            return "For antiques, the safest move is stable temperature, low direct sunlight, and minimal aggressive cleaning. Original surfaces and honest wear usually matter more than making the piece look newly polished."
        case .card:
            return "For cards, I would sleeve it first, then use a rigid holder, and keep it flat in a dry environment. Corners, edges, and surface gloss are where condition can slip fastest."
        case .none:
            return "The safest preservation rule is stable environment, gentle handling, and no harsh cleaning until the material is identified more confidently."
        }
    }

    func makerResponse(for context: ItemChatContext) -> String {
        return "To narrow down the maker or origin of \(context.titleText), I would look for stamps, engravings, serial patterns, or manufacturing tells before trusting a market conclusion. The saved note already points to \(context.subtitleText.lowercased()), which is a useful starting clue."
    }

    func pressingResponse(for context: ItemChatContext) -> String {
        return "If this is a record, the fastest way to refine the value is the runout or matrix text. Those markings often decide whether the item is a common later issue or the pressing collectors actually pay up for."
    }

    func generalResponse(for context: ItemChatContext, turn: Int) -> String {
        let noteFragment = context.noteText.isEmpty ? "" : " The saved note says: \(context.noteText)"
        let turnFragment = turn > 2 ? " If you want, ask next about authenticity, sale venue, or rarity and I can stay focused on that angle." : ""

        return "For \(context.titleText), the current local estimate is \(context.priceText), and the strongest verified clue right now is \(context.subtitleText.lowercased()).\(noteFragment)\(turnFragment)"
    }
}
