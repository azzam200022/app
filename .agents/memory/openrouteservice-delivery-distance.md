---
name: Optional OpenRouteService delivery distance
description: Route distance is informational and must not change delivery fees or order eligibility.
---

Checkout can display an optional driving distance from the configured store coordinates to the selected delivery location. The backend environment variables are `OPENROUTESERVICE_API_KEY`, `STORE_LAT`, and `STORE_LNG`; keep the API key server-side only and never commit secret values.

The repository-level GitHub Actions secrets with these names are present, but this repository currently has no GitHub Actions workflows. GitHub repository secrets therefore do not automatically reach the backend runtime. Set the variables in the backend hosting environment to enable road-distance lookups. Without the key or explicit store coordinates, the route distance is omitted and existing zone pricing continues.

This routing pilot only displays route distance: delivery-area fees, area matching, and order-submission eligibility remain unchanged. Out-of-zone orders stay blocked.
