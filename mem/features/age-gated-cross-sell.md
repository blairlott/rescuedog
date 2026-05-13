---
name: Age-gated wine cross-sell
description: Wine recommendations and pair-with-wine widgets must be hidden from visitors who haven't confirmed 21+
type: feature
---
Use `isAgeVerified()` from `src/lib/ageVerification.ts` (reads `localStorage.rdw_age_verified === "true"`) before rendering any UI that suggests, recommends, or pairs WINE.

Currently gated:
- `CartRecommendations` — strips wine from pool and skips merch→wine heading when not verified
- `PairItPicker` (merch PDP → wine) — returns null when not verified
- `PairWineWithMerch` (wine PDP → merch) — wine PDPs are already behind the age gate, no extra check needed
- `MerchForWineLoversStrip` — merch only, no gate needed
- `WineBarStrip` — shows wine accessories (glassware, etc.), not wine; no gate needed

When adding any new component that pushes wine on /merch, /index, cart, or any non-age-gated route, gate it with `isAgeVerified()`.
