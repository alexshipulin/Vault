import Foundation

// MARK: - MockDomainFactory

/// Shared factory for deterministic Domain-layer preview and test fixtures.
enum MockDomainFactory {
    static func scanImage() -> ScanImage {
        ScanImage(data: Data([0xFF, 0xD8, 0xFF, 0xD9]))
    }

    static func visionResult() -> VisionResult {
        VisionResult(
            croppedImage: scanImage(),
            extractedText: "1909 S VDB",
            detectedBarcodes: ["012345678905"],
            objectBounds: ImageBounds(x: 0.12, y: 0.18, width: 0.74, height: 0.68)
        )
    }

    static func comparableSales() -> [ComparableSale] {
        [
            ComparableSale(
                id: UUID(uuidString: "11111111-1111-1111-1111-111111111111") ?? UUID(),
                title: "1909-S VDB Lincoln Cent",
                price: Decimal(string: "1150") ?? 1150,
                soldAt: Date(timeIntervalSince1970: 1_710_000_000),
                sourceURL: URL(string: "https://www.ebay.com/itm/mock-1")
            ),
            ComparableSale(
                id: UUID(uuidString: "22222222-2222-2222-2222-222222222222") ?? UUID(),
                title: "1909-S VDB Penny AU Details",
                price: Decimal(string: "980") ?? 980,
                soldAt: Date(timeIntervalSince1970: 1_709_500_000),
                sourceURL: URL(string: "https://www.ebay.com/itm/mock-2")
            )
        ]
    }

    static func priceData() -> PriceData {
        PriceData(
            low: Decimal(string: "950") ?? 950,
            mid: Decimal(string: "1100") ?? 1100,
            high: Decimal(string: "1250") ?? 1250,
            currency: "USD",
            source: .ebay,
            sourceLabel: "Based on 12 recent eBay sales (last 30 days)",
            fetchedAt: Date(timeIntervalSince1970: 1_710_100_000),
            comparables: comparableSales()
        )
    }

    static func scanResult(priceData: PriceData? = nil) -> ScanResult {
        ScanResult(
            id: UUID(uuidString: "33333333-3333-3333-3333-333333333333") ?? UUID(),
            category: .coin,
            name: "1909-S VDB Lincoln Cent",
            year: 1909,
            origin: "United States",
            condition: .aboutUncirculated,
            conditionRangeLow: .extremelyFine,
            conditionRangeHigh: .mint,
            historySummary: "The 1909-S VDB Lincoln cent is one of the most collected key-date U.S. coins. Its low original mintage and famous designer initials make it a cornerstone for Lincoln cent sets.",
            confidence: 0.94,
            priceData: priceData,
            rawAIResponse: "{\"name\":\"1909-S VDB Lincoln Cent\"}",
            scannedAt: Date(timeIntervalSince1970: 1_710_050_000),
            inputImageHashes: ["abc123", "def456"]
        )
    }

    static func collectibleItem(priceData: PriceData? = nil) -> CollectibleItem {
        CollectibleItem(from: scanResult(priceData: priceData))
    }

    static func seededCollectibleItems() -> [CollectibleItem] {
        [
            CollectibleItem(
                id: UUID(uuidString: "44444444-4444-4444-4444-444444444444") ?? UUID(),
                name: "1909-S VDB Lincoln Cent",
                category: CollectibleCategory.coin.rawValue,
                conditionRaw: ConditionGrade.aboutUncirculated.rawValue,
                year: 1909,
                origin: "United States",
                notes: "",
                photoURLs: [],
                priceLow: 950,
                priceMid: 1100,
                priceHigh: 1250,
                priceSource: PriceSource.ebay.rawValue,
                priceFetchedAt: Date(timeIntervalSince1970: 1_710_100_000),
                historySummary: "A key-date coin with strong collector demand and highly visible design details.",
                addedAt: Date(timeIntervalSince1970: 1_710_050_000),
                updatedAt: Date(timeIntervalSince1970: 1_710_050_000),
                isSyncedToCloud: false
            ),
            CollectibleItem(
                id: UUID(uuidString: "55555555-5555-5555-5555-555555555555") ?? UUID(),
                name: "Blue Note Mono Pressing",
                category: CollectibleCategory.vinyl.rawValue,
                conditionRaw: ConditionGrade.veryFine.rawValue,
                year: 1964,
                origin: "United States",
                notes: "",
                photoURLs: [],
                priceLow: 180,
                priceMid: 240,
                priceHigh: 320,
                priceSource: PriceSource.discogs.rawValue,
                priceFetchedAt: Date(timeIntervalSince1970: 1_710_120_000),
                historySummary: "A collectible jazz pressing where matrix details and sleeve condition influence value heavily.",
                addedAt: Date(timeIntervalSince1970: 1_711_000_000),
                updatedAt: Date(timeIntervalSince1970: 1_711_000_000),
                isSyncedToCloud: false
            ),
            CollectibleItem(
                id: UUID(uuidString: "66666666-6666-6666-6666-666666666666") ?? UUID(),
                name: "Victorian Brass Compass",
                category: CollectibleCategory.antique.rawValue,
                conditionRaw: ConditionGrade.fine.rawValue,
                year: 1880,
                origin: "England",
                notes: "",
                photoURLs: [],
                priceLow: 420,
                priceMid: 560,
                priceHigh: 740,
                priceSource: PriceSource.antiqueDB.rawValue,
                priceFetchedAt: Date(timeIntervalSince1970: 1_710_160_000),
                historySummary: "A decorative antique where maker marks, original finish, and completeness are the primary value drivers.",
                addedAt: Date(timeIntervalSince1970: 1_712_000_000),
                updatedAt: Date(timeIntervalSince1970: 1_712_000_000),
                isSyncedToCloud: false
            )
        ]
    }
}
