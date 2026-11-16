# Streak image sharing

The Dashboard share button uses the existing PC app's image renderer and bundled fonts. `scripts/copy-streak-share-ui.mjs` records source and output hashes in `streak-share-source.json`. The cloud wrapper owns the dialog and preview URL. The renderer uses the account's longest streak and saved record counts from the Dashboard response.

The image is prepared before the user taps Share. Browsers with file sharing open their share sheet from that tap. Other browsers offer a PNG download. Cancelling the share sheet leaves the preview open. Closing or replacing the dialog releases the preview URL. The Android bridge is removed from this copy.

Local Chrome checks cover the Dashboard entry point, production content policy, loaded icon font, 900 × 890 PNG output, viewport fit, direct user activation, share cancellation, download fallback and dialog cleanup. Native OS share-sheet appearance still needs an installed-device check.
