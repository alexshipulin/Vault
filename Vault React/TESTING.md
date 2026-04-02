# VaultScope Testing Checklist

## Before Testing Remote Mode

- [ ] Firebase project configured in `VaultScope/.firebaserc`
- [ ] Environment variables filled in `.env.local`
- [ ] Firebase indexes deployed
- [ ] Cloud Functions deployed
- [ ] `antique_auctions` collection has data (run the seed script)
- [ ] Gemini API key is valid

## Manual Testing Steps

### 1. Local Mock Mode

- [ ] Set `EXPO_PUBLIC_VAULT_REMOTE_BACKEND=false`
- [ ] Run the app with `npm start`
- [ ] Take a photo or use mock capture
- [ ] Processing completes in under 5 seconds
- [ ] Result shows mock data
- [ ] Save works locally

### 2. Remote Live Mode

- [ ] Set `EXPO_PUBLIC_VAULT_REMOTE_BACKEND=true`
- [ ] Run the app with `npm start`
- [ ] Check `Profile > Debug` shows `Remote Live`
- [ ] Take a photo of an actual coin, antique, vinyl, or card
- [ ] Processing shows `Live Analysis`
- [ ] Wait up to 15 seconds for the result
- [ ] Result shows live Firestore-backed data
- [ ] Check Firestore console for a new `scan_results` document
- [ ] Save mirrors to the remote collection

### 3. Error Cases

- [ ] Test with no internet connection
- [ ] Test with an invalid Gemini API key
- [ ] Test with an empty `antique_auctions` collection
- [ ] Verify graceful fallback or error messages

### 4. Performance

- [ ] Processing time stays under 15 seconds in remote mode
- [ ] No obvious UI freezes
- [ ] Progress updates feel smooth
- [ ] No memory spikes after repeated scans

## Automated Coverage in This Repo

### Jest Integration Tests

- `__tests__/integration/remote-scan.test.ts`
  - stage order
  - remote analysis invocation
  - rejection path without fallback
  - fallback-to-local path

### Jest Performance Tests

- `src/features/scan/__tests__/performance.test.ts`
  - local mock completes under 5 seconds
  - remote orchestrator completes under 15 seconds with mocked analysis

### Detox Scaffold

- `e2e/scan-flow-remote.test.ts`
  - prepared with real app `testID` selectors
  - requires Detox installation and config before execution

## Notes

- Current CI/runtime test stack is Jest-based.
- The Detox file is a ready-to-wire scaffold, not an active executable target yet.
- Remote mode should not be considered production-ready until readiness checks pass and the Firebase ingestion pipeline is live.
