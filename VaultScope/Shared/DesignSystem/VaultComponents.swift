import SwiftUI

// MARK: - VaultHeaderAction

/// Optional action metadata for the sharp centered screen header.
struct VaultHeaderAction {
    let title: String?
    let systemImage: String?
    let accessibilityLabel: String
    let action: () -> Void

    init(
        title: String? = nil,
        systemImage: String? = nil,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) {
        self.title = title
        self.systemImage = systemImage
        self.accessibilityLabel = accessibilityLabel
        self.action = action
    }
}

// MARK: - VaultScreenHeader

/// Centered header with optional left and right actions, designed for compact monochrome screens.
struct VaultScreenHeader: View {
    let title: String
    let subtitle: String?
    let leadingAction: VaultHeaderAction?
    let trailingAction: VaultHeaderAction?

    init(
        title: String,
        subtitle: String? = nil,
        leadingAction: VaultHeaderAction? = nil,
        trailingAction: VaultHeaderAction? = nil
    ) {
        self.title = title
        self.subtitle = subtitle
        self.leadingAction = leadingAction
        self.trailingAction = trailingAction
    }

    var body: some View {
        VStack(alignment: .leading, spacing: VaultSpacing.xs) {
            ZStack {
                HStack {
                    headerActionButton(leadingAction, alignment: .leading)
                    Spacer()
                    headerActionButton(trailingAction, alignment: .trailing)
                }

                Text(title)
                    .font(VaultTypography.screenTitle)
                    .foregroundStyle(VaultColor.foreground)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .frame(maxWidth: .infinity)
            }

            if let subtitle, subtitle.isEmpty == false {
                Text(subtitle)
                    .font(VaultTypography.body)
                    .foregroundStyle(VaultColor.foregroundMuted)
            }
        }
    }

    @ViewBuilder
    private func headerActionButton(
        _ action: VaultHeaderAction?,
        alignment: Alignment
    ) -> some View {
        if let action {
            Button(action: action.action) {
                Group {
                    if let systemImage = action.systemImage {
                        Image(systemName: systemImage)
                            .font(.system(size: VaultIconSize.sm, weight: .medium))
                    } else {
                        Text(action.title ?? "")
                            .font(VaultTypography.micro)
                    }
                }
                .foregroundStyle(VaultColor.foreground)
                .frame(width: 44, height: 32, alignment: alignment)
                .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
            }
            .buttonStyle(.plain)
            .accessibilityLabel(action.accessibilityLabel)
        } else {
            Color.clear
                .frame(width: 44, height: 32)
        }
    }
}

// MARK: - VaultSegmentedOption

/// Data model for the monochrome segmented mode switch.
struct VaultSegmentedOption<Value: Hashable>: Identifiable {
    let value: Value
    let title: String

    var id: Value {
        value
    }
}

// MARK: - VaultSegmentedModeSwitch

/// Sharp segmented switch used for category or mode toggles.
struct VaultSegmentedModeSwitch<Value: Hashable>: View {
    let options: [VaultSegmentedOption<Value>]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(options.enumerated()), id: \.element.id) { index, option in
                Button {
                    selection = option.value
                } label: {
                    Text(option.title)
                        .font(VaultTypography.micro)
                        .textCase(.uppercase)
                        .tracking(0.8)
                        .foregroundStyle(selection == option.value ? VaultColor.inverseForeground : VaultColor.foreground)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, VaultSpacing.sm)
                        .background(selection == option.value ? VaultColor.fillSelected : VaultColor.surface)
                }
                .buttonStyle(.plain)

                if index < options.count - 1 {
                    Rectangle()
                        .fill(VaultColor.borderMuted)
                        .frame(width: VaultBorder.hairline)
                }
            }
        }
        .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
    }
}

// MARK: - VaultSearchField

/// Monochrome bordered search field for local filtering inside feature screens.
struct VaultSearchField: View {
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: VaultSpacing.sm) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: VaultIconSize.sm, weight: .medium))
                .foregroundStyle(VaultColor.foregroundSubtle)

            TextField(
                "",
                text: $text,
                prompt: Text(placeholder)
                    .font(VaultTypography.body)
                    .foregroundStyle(VaultColor.foregroundFaint)
            )
            .font(VaultTypography.body)
            .foregroundStyle(VaultColor.foreground)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()

            if text.isEmpty == false {
                Button {
                    text = ""
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: VaultIconSize.xs, weight: .semibold))
                        .foregroundStyle(VaultColor.foregroundSubtle)
                        .frame(width: 24, height: 24)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(vsLocalized("feature.vault.search.clear"))
            }
        }
        .padding(.horizontal, VaultSpacing.md)
        .padding(.vertical, VaultSpacing.sm)
        .background(VaultColor.surface)
        .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
    }
}

// MARK: - VaultPrimaryCTAButtonStyle

/// Primary rectangular button style with inverse monochrome contrast.
struct VaultPrimaryCTAButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VaultTypography.button)
            .foregroundStyle(VaultColor.inverseForeground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(configuration.isPressed ? VaultColor.fillPressed : VaultColor.fillSelected)
            .overlay(Rectangle().stroke(VaultColor.borderStrong, lineWidth: VaultBorder.hairline))
    }
}

// MARK: - VaultSecondaryCTAButtonStyle

/// Secondary outlined button style for less prominent actions.
struct VaultSecondaryCTAButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(VaultTypography.button)
            .foregroundStyle(configuration.isPressed ? VaultColor.foregroundMuted : VaultColor.foreground)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 14)
            .background(VaultColor.surface)
            .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
    }
}

// MARK: - VaultTabItemLabel

/// Compact tab label designed to sit cleanly inside the system tab bar.
struct VaultTabItemLabel: View {
    let title: String
    let systemImage: String

    var body: some View {
        VStack(spacing: VaultSpacing.xxs) {
            Image(systemName: systemImage)
                .font(.system(size: VaultIconSize.md, weight: .medium))

            Text(title)
                .font(VaultTypography.tabLabel)
                .textCase(.uppercase)
                .tracking(0.8)
        }
    }
}

// MARK: - VaultInfoRow

/// Metadata row with strong left label and right aligned value.
struct VaultInfoRow: View {
    let label: String
    let value: String
    let detail: String?

    init(label: String, value: String, detail: String? = nil) {
        self.label = label
        self.value = value
        self.detail = detail
    }

    var body: some View {
        VStack(alignment: .leading, spacing: VaultSpacing.xxs) {
            HStack(alignment: .firstTextBaseline) {
                Text(label)
                    .font(VaultTypography.sectionLabel)
                    .textCase(.uppercase)
                    .tracking(0.8)
                    .foregroundStyle(VaultColor.foregroundSubtle)

                Spacer()

                Text(value)
                    .font(VaultTypography.rowValue)
                    .foregroundStyle(VaultColor.foreground)
                    .multilineTextAlignment(.trailing)
            }

            if let detail, detail.isEmpty == false {
                Text(detail)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundMuted)
            }
        }
    }
}

// MARK: - VaultRecentScanRow

/// Reusable list row for recent scans on the home screen.
struct VaultRecentScanRow: View {
    let item: CollectibleListItem
    let showsDivider: Bool

    init(item: CollectibleListItem, showsDivider: Bool = true) {
        self.item = item
        self.showsDivider = showsDivider
    }

    var body: some View {
        VStack(alignment: .leading, spacing: VaultSpacing.sm) {
            HStack(alignment: .top, spacing: VaultSpacing.md) {
                thumbnail

                VStack(alignment: .leading, spacing: VaultSpacing.xxs) {
                    Text(item.title)
                        .font(VaultTypography.rowTitle)
                        .foregroundStyle(VaultColor.foreground)

                    Text(item.subtitle)
                        .font(VaultTypography.body)
                        .foregroundStyle(VaultColor.foregroundMuted)
                }

                Spacer(minLength: VaultSpacing.sm)

                Text(item.valueText)
                    .font(VaultTypography.rowValue)
                    .foregroundStyle(VaultColor.foreground)
            }

            HStack {
                Text(item.categoryText)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)

                Spacer()

                Text(item.timestampText)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
            }

            if showsDivider {
                VaultDivider()
            }
        }
    }

    private var thumbnail: some View {
        Rectangle()
            .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
            .frame(width: 44, height: 44)
            .overlay(
                Text(item.thumbnailText)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foreground)
            )
    }
}

// MARK: - VaultGridCard

/// Strong bordered grid card for vault item overview blocks.
struct VaultGridCard: View {
    let thumbnailText: String
    let eyebrow: String
    let title: String
    let subtitle: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: VaultSpacing.md) {
            HStack(alignment: .top, spacing: VaultSpacing.md) {
                thumbnail

                Spacer(minLength: VaultSpacing.sm)

                Text(value)
                    .font(VaultTypography.bodyStrong)
                    .foregroundStyle(VaultColor.foreground)
                    .multilineTextAlignment(.trailing)
            }

            VStack(alignment: .leading, spacing: VaultSpacing.xxs) {
                Text(eyebrow)
                    .font(VaultTypography.sectionLabel)
                    .textCase(.uppercase)
                    .tracking(0.8)
                    .foregroundStyle(VaultColor.foregroundSubtle)

                Text(title)
                    .font(VaultTypography.rowTitle)
                    .foregroundStyle(VaultColor.foreground)
                    .lineLimit(2)

                Text(subtitle)
                    .font(VaultTypography.body)
                    .foregroundStyle(VaultColor.foregroundMuted)
                    .lineLimit(2)
            }
        }
        .padding(VaultSpacing.md)
        .frame(maxWidth: .infinity, minHeight: 176, alignment: .topLeading)
        .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
    }

    private var thumbnail: some View {
        Rectangle()
            .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
            .frame(width: 56, height: 56)
            .overlay(
                Text(thumbnailText)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foreground)
            )
    }
}

// MARK: - VaultProgressState

/// Visual state for scaffolded processing rows.
enum VaultProgressState {
    case complete
    case active
    case pending

    var statusText: String {
        switch self {
        case .complete:
            vsLocalized("design.progress.complete")
        case .active:
            vsLocalized("design.progress.active")
        case .pending:
            vsLocalized("design.progress.pending")
        }
    }
}

// MARK: - VaultProgressRow

/// Progress row for step-based processing and staged task lists.
struct VaultProgressRow: View {
    let title: String
    let state: VaultProgressState

    var body: some View {
        HStack(spacing: VaultSpacing.md) {
            Rectangle()
                .fill(indicatorColor)
                .frame(width: 10, height: 10)
                .overlay(Rectangle().stroke(VaultColor.borderStrong, lineWidth: VaultBorder.hairline))

            Text(title)
                .font(VaultTypography.body)
                .foregroundStyle(VaultColor.foreground)

            Spacer()

            Text(state.statusText)
                .font(VaultTypography.micro)
                .textCase(.uppercase)
                .tracking(0.8)
                .foregroundStyle(VaultColor.foregroundSubtle)
        }
    }

    private var indicatorColor: Color {
        switch state {
        case .complete:
            VaultColor.foreground
        case .active:
            VaultColor.foregroundMuted
        case .pending:
            .clear
        }
    }
}

// MARK: - VaultStickyActionBar

/// Bottom action shelf with strong divider for camera and result flows.
struct VaultStickyActionBar<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(spacing: 0) {
            VaultDivider()

            content
                .padding(.horizontal, VaultSpacing.lg)
                .padding(.vertical, VaultSpacing.md)
                .frame(maxWidth: .infinity)
                .background(VaultColor.background)
        }
    }
}

// MARK: - VaultChipButton

/// Sharp outlined chip button for AI chat suggested prompts.
struct VaultChipButton: View {
    let title: String
    let isSelected: Bool
    let action: () -> Void

    init(title: String, isSelected: Bool = false, action: @escaping () -> Void) {
        self.title = title
        self.isSelected = isSelected
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(VaultTypography.micro)
                .foregroundStyle(isSelected ? VaultColor.inverseForeground : VaultColor.foreground)
                .padding(.horizontal, VaultSpacing.sm)
                .padding(.vertical, VaultSpacing.xs)
                .background(isSelected ? VaultColor.fillSelected : VaultColor.surface)
                .overlay(
                    Rectangle()
                        .stroke(isSelected ? VaultColor.borderStrong : VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
                )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - VaultSettingsRow

/// Row primitive for the profile/settings area with optional detail and icon.
struct VaultSettingsRow: View {
    let title: String
    let detail: String?
    let systemImage: String?
    let showsDisclosure: Bool

    init(
        title: String,
        detail: String? = nil,
        systemImage: String? = nil,
        showsDisclosure: Bool = true
    ) {
        self.title = title
        self.detail = detail
        self.systemImage = systemImage
        self.showsDisclosure = showsDisclosure
    }

    var body: some View {
        HStack(spacing: VaultSpacing.md) {
            if let systemImage {
                Image(systemName: systemImage)
                    .font(.system(size: VaultIconSize.sm, weight: .medium))
                    .foregroundStyle(VaultColor.foreground)
                    .frame(width: 20)
            }

            Text(title)
                .font(VaultTypography.body)
                .foregroundStyle(VaultColor.foreground)

            Spacer()

            if let detail, detail.isEmpty == false {
                Text(detail)
                    .font(VaultTypography.micro)
                    .foregroundStyle(VaultColor.foregroundSubtle)
            }

            if showsDisclosure {
                Image(systemName: "chevron.right")
                    .font(.system(size: VaultIconSize.xs, weight: .semibold))
                    .foregroundStyle(VaultColor.foregroundFaint)
            }
        }
        .padding(.vertical, VaultSpacing.sm)
    }
}

// MARK: - VaultEmptyStateBlock

/// Empty state block used when a feature has no live content yet.
struct VaultEmptyStateBlock: View {
    let title: String
    let message: String
    let actionTitle: String?
    let action: (() -> Void)?

    init(
        title: String,
        message: String,
        actionTitle: String? = nil,
        action: (() -> Void)? = nil
    ) {
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    var body: some View {
        VStack(alignment: .leading, spacing: VaultSpacing.md) {
            Text(title)
                .font(VaultTypography.rowTitle)
                .foregroundStyle(VaultColor.foreground)

            Text(message)
                .font(VaultTypography.body)
                .foregroundStyle(VaultColor.foregroundMuted)

            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(VaultPrimaryCTAButtonStyle())
            }
        }
        .padding(VaultSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
    }
}

// MARK: - VaultDivider

/// Thin monochrome divider used between dense rows and sections.
struct VaultDivider: View {
    var body: some View {
        Rectangle()
            .fill(VaultColor.divider)
            .frame(height: VaultBorder.hairline)
    }
}

// MARK: - VaultPanel

/// Strong bordered surface container shared by cards, rows, and screen blocks.
struct VaultPanel<Content: View>: View {
    let content: Content

    init(@ViewBuilder content: () -> Content) {
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: VaultSpacing.md) {
            content
        }
        .padding(VaultSpacing.md)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(VaultColor.surface)
        .overlay(Rectangle().stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline))
    }
}

// MARK: - VaultMicroSectionLabel

/// Uppercase micro label for restrained editorial section headings.
struct VaultMicroSectionLabel: View {
    let title: String

    var body: some View {
        Text(title)
            .font(VaultTypography.sectionLabel)
            .textCase(.uppercase)
            .tracking(0.8)
            .foregroundStyle(VaultColor.foregroundSubtle)
    }
}
