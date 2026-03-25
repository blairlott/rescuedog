

## Add Page Size Selector to Rescue Partners Table

Add a dropdown selector allowing users to choose how many organizations to display per page (10, 25, 50, 100), matching the DataTables-style pattern from the original site.

### Changes

**File: `src/pages/MissionPage.tsx`**

1. Replace the `ITEMS_PER_PAGE` constant with a `pageSize` state initialized to 25
2. Add a Select dropdown above the table (next to the search input) with options: 10, 25, 50, 100
3. When page size changes, reset to page 1
4. Update all references from `ITEMS_PER_PAGE` to `pageSize`
5. Import `Select, SelectTrigger, SelectValue, SelectContent, SelectItem` from the existing UI components

Layout: Search input on the left, page size selector on the right, in a flex row above the table. Label: "Show [dropdown] entries".

