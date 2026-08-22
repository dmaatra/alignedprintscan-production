# APS Digital Card QR Assets

These QR codes are governed APS assets for the permanent, extensionless digital-card routes.

| Identity | Permanent route | SVG | PNG |
| --- | --- | --- | --- |
| Aligned Print & Scan | `https://alignedprintscan.com/card` | `aps-company-card-qr.svg` | `aps-company-card-qr.png` |
| Doneisha Maat Ra | `https://alignedprintscan.com/doneisha` | `doneisha-maat-ra-card-qr.svg` | `doneisha-maat-ra-card-qr.png` |

The SVG files are the authoritative print/vector assets. The PNG files are high-resolution placement assets for digital documents, Canva, email, social use, and basic print work.

## Production standard

- Encode only the permanent HTTPS card route. Do not encode a `.html` fallback, UTM parameters, phone number, email address, or vCard payload.
- Keep the four-module quiet zone, square black modules, white background, and high error-correction level unless a replacement has been independently print-and-scan tested.
- Do not stretch, crop, recolor, decorate, or place artwork over the modules.
- Future card content changes do not require a new physical QR while the canonical route remains unchanged.

## Professional-card convention

Future APS professional cards should follow this relationship:

`professional route` → `professional digital card` → `professional vCard` → `professional QR`

For example:

`/doneisha` → Doneisha digital card → `doneisha.vcf` → `doneisha-maat-ra-card-qr.svg` / `.png`

This convention documents reusable asset relationships only. It does not implement staff-profile, route, vCard, or QR automation.

## Generation and verification

Generated with Python `qrcode` 8.2 using QR error correction H, a four-module quiet zone, square modules, and black-on-white output. PNG modules use 24 pixels per module. SVG output uses vector paths and a white background.

Release verification independently renders each SVG with CairoSVG and decodes every SVG-rendered image and PNG with OpenCV's `QRCodeDetector`. Every decoded value must exactly match the permanent route listed above.
