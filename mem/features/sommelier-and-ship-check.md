---
name: AI sommelier and ship-state check
description: Floating Lovable AI sommelier widget on wine pages and a per-state shipping eligibility gate on PDP
type: feature
---
**AI Sommelier (`SommelierChat`)**
- Floating "Ask the Sommelier" button mounted globally in `App.tsx` via `<SommelierChat />`
- HIDDEN on `/merch`, `/crm`, `/cms`, `/sell`, `/donation`, `/login`, `/signup` (path matched in `AppContent`)
- Powered by edge function `ai-sommelier` using `google/gemini-2.5-flash` via Lovable AI Gateway (no API key needed)
- System prompt enforces: never invent SKUs/prices, never say "free shipping", redirect off-topic
- Accepts optional `catalog` string in body for catalog-grounded responses (not yet wired — opportunity)

**Ships-to-your-state (`ShipsToStateCheck` + `useShipState`)**
- State stored in `localStorage` key `rdw_ship_state`
- Source of truth: `src/lib/wineShippingStates.ts` (`SHIPS_TO_STATES`, `NO_SHIP_STATES`) — review with compliance team before relying on
- Mounted in `ProductDetail.tsx`; blocks Add-to-Cart when `state` is set and not in shippable list
- Auto-opens picker on first PDP visit; persists choice across sessions
