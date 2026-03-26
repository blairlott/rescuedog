

## Cart Marketing Features Plan

Wine industry e-commerce sites (like Winc, Naked Wines, WTSO) use smart cart nudges to increase AOV. Here's what we'll build:

### Features

**1. Free Shipping Progress Bar**
A visual progress bar in the CartDrawer showing how close the customer is to free shipping. Configurable threshold (e.g., $150 or 6 bottles). Shows messages like "Add 2 more bottles for FREE shipping!" with a filled progress indicator.

**2. Bottle Count Upsell Banner**
Contextual nudge when the customer is 1-2 bottles away from a case (12 bottles) or half-case (6 bottles) discount tier. Example: "You're 2 bottles away from a full case -- save 10%!"

**3. Wine Club Savings Callout**
A persistent banner in the cart showing how much the customer *would* save as a Wine Club member (20% off). Links to the Wine Club signup page. Only shown to non-club members.

**4. "Complete Your Collection" Product Suggestion**
Below cart items, show 1-2 recommended products from the same category the customer is already buying (e.g., if they have reds, suggest another red). Uses existing Shopify product data.

**5. Add-to-Cart Toast Enhancement**
After adding an item, the success toast includes a brief nudge like "Add 1 more for free shipping" instead of just "Added to cart."

### Technical Approach

All changes are frontend-only, no new database tables or edge functions needed.

**Files to create:**
- `src/components/cart/FreeShippingBar.tsx` -- progress bar component with configurable threshold
- `src/components/cart/CartUpsellBanner.tsx` -- contextual nudge messages (case discount, club savings)
- `src/components/cart/CartRecommendations.tsx` -- suggested products from existing Shopify data

**Files to modify:**
- `src/components/CartDrawer.tsx` -- integrate the new components above the item list and between total/checkout
- `src/components/ProductCard.tsx` -- enhance the add-to-cart toast with shipping nudge
- `src/pages/ProductDetail.tsx` -- same toast enhancement

**Configuration:**
- Free shipping threshold: $150 (or 6+ bottles), defined as constants
- Case discount messaging at 6 and 12 bottle thresholds
- Wine Club savings calculated at 20% off current cart total

### Cart Drawer Layout (top to bottom)

```text
+----------------------------------+
| Shopping Cart (header)           |
+----------------------------------+
| [=====>-------] $42 to free ship |  <-- FreeShippingBar
+----------------------------------+
| 🍷 Wine A        $25  qty: 2    |
| 🍷 Wine B        $30  qty: 1    |
+----------------------------------+
| "Add 1 more bottle for a        |  <-- CartUpsellBanner
|  half-case & save on shipping!"  |
+----------------------------------+
| 💡 Wine Club members save $16   |  <-- Club savings callout
|    on this order. Join now →     |
+----------------------------------+
| You might also like:             |  <-- CartRecommendations
| [Wine C thumbnail] Add $22      |
+----------------------------------+
| Subtotal              $80.00    |
| [Checkout Button]               |
+----------------------------------+
```

