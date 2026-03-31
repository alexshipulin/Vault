import Foundation

// MARK: - MockScanResultBuilding

protocol MockScanResultBuilding: AnyObject {
    func buildResult(for session: TemporaryScanSession) -> ScanResult
}

// MARK: - LocalMockScanResultFactory

final class LocalMockScanResultFactory: MockScanResultBuilding {
    func buildResult(for session: TemporaryScanSession) -> ScanResult {
        let template = selectedTemplate(for: session)
        let checksum = imageChecksum(for: session)
        let inputHashes = session.capturedImages.enumerated().map { index, image in
            "scan-\(index)-\(image.data.count)-\(checksum)"
        }

        let price = PriceData(
            low: template.low,
            mid: template.mid,
            high: template.high,
            currency: "USD",
            source: template.source,
            sourceLabel: template.sourceLabel,
            fetchedAt: session.createdAt,
            comparables: nil
        )

        return ScanResult(
            id: UUID(),
            category: template.category,
            name: template.name,
            year: template.year,
            origin: template.origin,
            condition: template.condition,
            conditionRangeLow: template.conditionRangeLow,
            conditionRangeHigh: template.conditionRangeHigh,
            historySummary: template.historySummary,
            confidence: template.confidence,
            priceData: price,
            rawAIResponse: "{\"mock\":true,\"mode\":\"\(session.mode.rawValue)\",\"checksum\":\(checksum)}",
            scannedAt: session.createdAt,
            inputImageHashes: inputHashes
        )
    }

    private func selectedTemplate(for session: TemporaryScanSession) -> MockScanResultTemplate {
        let templates: [MockScanResultTemplate]

        switch session.mode {
        case .standard:
            templates = [
                MockScanResultTemplate(
                    category: .coin,
                    name: "1909-S VDB Lincoln Cent",
                    year: 1909,
                    origin: "United States",
                    condition: .aboutUncirculated,
                    conditionRangeLow: .extremelyFine,
                    conditionRangeHigh: .mint,
                    confidence: 0.94,
                    source: .pcgs,
                    sourceLabel: "Based on recent PCGS guide references and collector market activity.",
                    low: 950,
                    mid: 1100,
                    high: 1250,
                    historySummary: "The 1909-S VDB Lincoln cent is one of the key-date coins in the Lincoln series. Its small original mintage and iconic reverse initials make it a staple of advanced U.S. coin collections."
                ),
                MockScanResultTemplate(
                    category: .card,
                    name: "1986 Fleer Michael Jordan Rookie",
                    year: 1986,
                    origin: "United States",
                    condition: .veryFine,
                    conditionRangeLow: .fine,
                    conditionRangeHigh: .aboutUncirculated,
                    confidence: 0.91,
                    source: .ebay,
                    sourceLabel: "Based on recent auction listings and closed marketplace sales.",
                    low: 4200,
                    mid: 5600,
                    high: 7100,
                    historySummary: "The 1986 Fleer Michael Jordan rookie is one of the most recognizable sports cards ever printed. Its cultural impact and demand across grading tiers continue to anchor the basketball card market."
                )
            ]

        case .mystery:
            templates = [
                MockScanResultTemplate(
                    category: .antique,
                    name: "Victorian Silver Tea Caddy",
                    year: 1885,
                    origin: "England",
                    condition: .fine,
                    conditionRangeLow: .veryGood,
                    conditionRangeHigh: .veryFine,
                    confidence: 0.86,
                    source: .antiqueDB,
                    sourceLabel: "Based on recent antique dealer references and estate sale archives.",
                    low: 700,
                    mid: 980,
                    high: 1280,
                    historySummary: "Victorian tea caddies were both decorative and functional objects in upper-middle-class households. Surviving examples with intact metalwork and proportionate form remain attractive to collectors of British domestic antiques."
                ),
                MockScanResultTemplate(
                    category: .vinyl,
                    name: "Blue Note First Press LP",
                    year: 1958,
                    origin: "United States",
                    condition: .veryGood,
                    conditionRangeLow: .good,
                    conditionRangeHigh: .fine,
                    confidence: 0.88,
                    source: .discogs,
                    sourceLabel: "Based on Discogs sale history and collector marketplace comps.",
                    low: 180,
                    mid: 260,
                    high: 390,
                    historySummary: "Blue Note first pressings are closely tracked for label variation, ear marks, and sleeve condition. Even partial identifiers can place a record within a collectible pressing window that strongly affects market value."
                )
            ]
        }

        let checksum = imageChecksum(for: session)
        let index = checksum % max(templates.count, 1)
        return templates[index]
    }

    private func imageChecksum(for session: TemporaryScanSession) -> Int {
        session.capturedImages.reduce(0) { partialResult, image in
            partialResult + image.data.reduce(0) { running, byte in
                running + Int(byte)
            }
        }
    }
}

// MARK: - MockScanResultTemplate

private struct MockScanResultTemplate {
    let category: CollectibleCategory
    let name: String
    let year: Int?
    let origin: String?
    let condition: ConditionGrade
    let conditionRangeLow: ConditionGrade
    let conditionRangeHigh: ConditionGrade
    let confidence: Double
    let source: PriceSource
    let sourceLabel: String
    let low: Decimal
    let mid: Decimal
    let high: Decimal
    let historySummary: String
}
