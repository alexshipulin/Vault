import SwiftUI

// MARK: - AIChatView

struct AIChatView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var viewModel: AIChatViewModel

    init(viewModel: AIChatViewModel) {
        _viewModel = State(initialValue: viewModel)
    }

    var body: some View {
        @Bindable var bindableViewModel = viewModel

        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: VaultSpacing.lg) {
                    VaultScreenHeader(
                        title: vsLocalized("feature.chat.title"),
                        subtitle: nil,
                        leadingAction: VaultHeaderAction(
                            systemImage: "chevron.left",
                            accessibilityLabel: vsLocalized("feature.chat.back")
                        ) {
                            dismiss()
                        }
                    )

                    if let context = bindableViewModel.context {
                        contextPanel(context)
                        suggestedQuestionsPanel(bindableViewModel, context: context)
                        chatThread(bindableViewModel)
                    } else if bindableViewModel.isLoading {
                        VaultEmptyStateBlock(
                            title: vsLocalized("feature.chat.loading.title"),
                            message: vsLocalized("feature.chat.loading.message")
                        )
                    } else {
                        VaultEmptyStateBlock(
                            title: vsLocalized("feature.chat.empty.title"),
                            message: vsLocalized("feature.chat.empty.message")
                        )
                    }
                }
                .padding(.horizontal, VaultSpacing.lg)
                .padding(.top, 20)
                .padding(.bottom, 120)
            }
            .background(VaultColor.background.ignoresSafeArea())
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if bindableViewModel.hasLoadedContext {
                    inputBar(
                        draftMessage: $bindableViewModel.draftMessage,
                        canSend: bindableViewModel.canSendDraft
                    ) {
                        Task {
                            await bindableViewModel.sendDraft()
                        }
                    }
                }
            }
            .navigationTitle(vsLocalized("feature.chat.nav"))
            .vaultInlineNavigationTitleDisplayMode()
            .navigationBarBackButtonHidden()
            .vaultNavigationChrome()
            .task {
                await bindableViewModel.loadIfNeeded()
            }
            .onChange(of: bindableViewModel.messages.count) { _, _ in
                guard let lastID = bindableViewModel.messages.last?.id else {
                    return
                }

                withAnimation(.easeOut(duration: 0.2)) {
                    proxy.scrollTo(lastID, anchor: .bottom)
                }
            }
        }
    }

    private func contextPanel(_ context: ItemChatContext) -> some View {
        VaultPanel {
            HStack(alignment: .center, spacing: VaultSpacing.md) {
                Rectangle()
                    .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
                    .frame(width: 56, height: 56)
                    .overlay(
                        Text(context.displayItem.thumbnailText)
                            .font(VaultTypography.micro)
                            .foregroundStyle(VaultColor.foreground)
                    )

                VStack(alignment: .leading, spacing: VaultSpacing.xxs) {
                    Text(context.titleText)
                        .font(VaultTypography.rowTitle)
                        .foregroundStyle(VaultColor.foreground)

                    Text(context.subtitleText)
                        .font(VaultTypography.body)
                        .foregroundStyle(VaultColor.foregroundMuted)
                        .lineLimit(2)

                    Text(context.priceText)
                        .font(VaultTypography.micro)
                        .foregroundStyle(VaultColor.foregroundSubtle)
                        .textCase(.uppercase)
                        .tracking(0.8)
                }
            }
        }
    }

    private func suggestedQuestionsPanel(
        _ viewModel: AIChatViewModel,
        context: ItemChatContext
    ) -> some View {
        VaultPanel {
            VaultScopeSectionTitle(key: "feature.chat.quick_questions")

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: VaultSpacing.sm) {
                    ForEach(viewModel.quickPrompts, id: \.self) { prompt in
                        VaultChipButton(title: prompt) {
                            Task {
                                await viewModel.sendPrompt(prompt)
                            }
                        }
                    }
                }
            }
            .accessibilityLabel(context.titleText)
        }
    }

    private func chatThread(_ viewModel: AIChatViewModel) -> some View {
        VaultPanel {
            VStack(alignment: .leading, spacing: VaultSpacing.sm) {
                ForEach(viewModel.messages) { message in
                    chatBubble(message)
                        .id(message.id)
                }

                if viewModel.isSending {
                    HStack {
                        chatBubble(
                            ChatMessage(
                                id: UUID(),
                                role: .assistant,
                                content: vsLocalized("feature.chat.assistant.typing"),
                                createdAt: Date()
                            )
                        )

                        Spacer(minLength: 0)
                    }
                }
            }
        }
    }

    private func chatBubble(_ message: ChatMessage) -> some View {
        HStack {
            if message.role == .assistant {
                bubble(message, isUser: false)
                Spacer(minLength: VaultSpacing.xl)
            } else {
                Spacer(minLength: VaultSpacing.xl)
                bubble(message, isUser: true)
            }
        }
    }

    private func bubble(_ message: ChatMessage, isUser: Bool) -> some View {
        VStack(alignment: .leading, spacing: VaultSpacing.xs) {
            Text(message.content)
                .font(VaultTypography.body)
                .foregroundStyle(isUser ? VaultColor.inverseForeground : VaultColor.foreground)
                .multilineTextAlignment(.leading)

            Text(timestamp(for: message))
                .font(VaultTypography.micro)
                .foregroundStyle(isUser ? Color.black.opacity(0.72) : VaultColor.foregroundFaint)
                .textCase(.uppercase)
                .tracking(0.8)
        }
        .padding(VaultSpacing.md)
        .background(isUser ? VaultColor.fillSelected : VaultColor.surface)
        .overlay(
            Rectangle()
                .stroke(isUser ? VaultColor.borderStrong : VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
        )
    }

    private func inputBar(
        draftMessage: Binding<String>,
        canSend: Bool,
        onSend: @escaping () -> Void
    ) -> some View {
        VaultStickyActionBar {
            HStack(spacing: VaultSpacing.sm) {
                TextField(
                    "",
                    text: draftMessage,
                    prompt: Text(vsLocalized("feature.chat.input.placeholder"))
                        .font(VaultTypography.body)
                        .foregroundStyle(VaultColor.foregroundFaint)
                )
                .font(VaultTypography.body)
                .foregroundStyle(VaultColor.foreground)
                .textInputAutocapitalization(.sentences)
                .autocorrectionDisabled()
                .padding(.horizontal, VaultSpacing.md)
                .padding(.vertical, VaultSpacing.sm)
                .background(VaultColor.surface)
                .overlay(
                    Rectangle()
                        .stroke(VaultColor.borderDefault, lineWidth: VaultBorder.hairline)
                )

                Button(vsLocalized("feature.chat.send"), action: onSend)
                .buttonStyle(VaultPrimaryCTAButtonStyle())
                .frame(width: 88)
                .disabled(canSend == false)
            }
        }
    }

    private func timestamp(for message: ChatMessage) -> String {
        Self.timeFormatter.string(from: message.createdAt)
    }
}

// MARK: - Formatters

private extension AIChatView {
    static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .none
        formatter.timeStyle = .short
        return formatter
    }()
}
