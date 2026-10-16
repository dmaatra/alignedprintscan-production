# APS reusable yard sign — Bannerology upload

**CONFIRMED IN CODE — generated and inspected 2026-10-16.**

Choose a 24-inch-wide × 18-inch-tall landscape, full-color, double-sided corrugated-plastic sign, quantity 5, with metal H-stakes. Upload `aps-yard-sign-24x18-front-and-back.pdf` as the front and use the **same file** for the back. Do not mirror, rotate, or stretch the back. If the vendor asks for two uploads, upload this identical file twice. No order has been placed.

The PDF has a 24 × 18-inch TrimBox and a 24.25 × 18.25-inch MediaBox/BleedBox (0.125-inch bleed on each edge), with no crop marks. All content is at least 0.5 inch inside trim. Fonts are embedded and QR modules are vector. The navy background extends to bleed.

Bannerology's published [coroplast specifications](https://bannerology.com/coroplast-yard-signs) and [FAQ](https://bannerology.com/faq) call for 100 DPI at finished size, 0.125-inch bleed, and a 0.5-inch safety margin (checked 2026-10-16). The supplied original raster logo is placed at 100 effective DPI without resampling/recreating its artwork; no vector logo was present in the repository. Its colors and aspect ratio are preserved. Text and QR are vector in the PDF/SVG. The logo's original dark background is retained.

The requested PNG is **7200 × 5400 pixels, RGB, opaque, 300 DPI**, at finished trim size. It does not include the additional bleed; use the PDF for Bannerology upload. The outlined SVG is the maintainable vector placement source; `scripts/generate-neighborhood-sign.py` plus the included licensed fonts provide text-editable regeneration. The output preview shows the trimmed finished sign.

Standalone QR assets: `assets/qr/neighborhood/neighborhood-services-qr.svg` and `.png`. Static HTTPS destination:

https://alignedprintscan.com/neighborhood?utm_source=yard_sign&utm_medium=offline&utm_campaign=neighborhood_services

The code uses error correction H, four white modules of quiet zone, navy square modules, and no overlay. Independently decoded both SVG renders, standalone PNG, and QR region of the 300-DPI sign PNG. Exact destination matched. No physical phone-camera test has been performed. Production destination/record attribution verification remains a release check; local attribution regression tests cover internal navigation and payload capture. The existing professional-card QR assets were not modified.

`verification.json` records dimensions and SHA-256 hashes. Front and back intentionally share one artwork file, guaranteeing identical content.
