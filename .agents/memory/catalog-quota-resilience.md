---
name: Catalog quota resilience
description: The product catalog must remain searchable when Firestore reads are throttled.
---

The local catalog export is the authoritative read source for manager name and barcode lookup; Firestore is only needed for checking existing saved products and saving the selected product.

**Why:** The catalog is large, and scanning or reseeding it through Firestore can exhaust the project quota and make the manager screen report a misleading connection error.

**How to apply:** Keep local catalog loading cached in memory, avoid Firestore fallback when the local export is present, and make existing-product checks non-blocking when Firestore is temporarily unavailable.