# DripCartel code fixes

## Payment X button
- Fixed the payment modal close button so it stays above dynamically replaced payment content.
- Added a delegated click fallback for `#closePayment`.
- Added mobile/touch-friendly pointer handling.
- Restored focus safely after closing the payment modal.

## Modal behavior
- Added Escape-key support for product, cart, checkout, and payment modals.
- Prevented the payment overlay from intercepting clicks while it is closing.
- Kept the existing payment flow and data handling intact.

## Validation
- JavaScript syntax was checked after the changes.
- Existing file structure and assets were preserved.


## Landing animation and Explore randomization
- Restored the original landing/page-transition animation timing and behavior from the pre-optimization project.
- Removed the optimization-added 900ms landing overlay startup.
- Explore category cards now choose a product image from their own category on each page opener.
- T-Shirts, Hoodies, and Tote Bags randomize independently.
- The previous image is avoided when a category has multiple available products, so reopening the page normally produces a different image.

## Product front/back hover views
- Fixed product-card hover swapping so products with two gallery images reliably show the back view.
- Back-view images are eagerly loaded and additionally preloaded on pointer/focus so the first hover does not race image loading.
- Added explicit front/back stacking, opacity, and pointer-event rules for predictable hover behavior.
- Normalized remote/local catalogue image paths before rendering.
- Bumped the catalogue cache version so stale browser catalogue data is refreshed during development.

## Catalogue/admin data integrity
- Fixed product catalogue merging so saved/API gallery data is not silently replaced by the default gallery.
- Fixed the admin product PATCH flow so omitted gallery data is preserved instead of being cleared.
- Fixed admin product editing so changing the front image preserves an existing back image.
- Aligned admin image upload size with the current backend JSON request limit.
- Fixed private admin discovery feedback to use the storefront's own transition/toast functions instead of an unavailable `DripCommon` dependency.
- Added regression tests for front/back galleries, asset references, and gallery-preserving product updates.
