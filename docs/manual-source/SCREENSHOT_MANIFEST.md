# Screenshot Manifest

Safety rule: capture only controlled synthetic records with no portal tokens, provider links/IDs, real customer PII, real payments, or document contents. A manifest entry marked **MANUAL SCREENSHOT REQUIRED** is intentional and must not be replaced by a fabricated image.

| ID | Chapter | Screen/state | Synthetic requirement | Teaching purpose | Status | Suggested caption |
|---|---|---|---|---|---|---|
| SS-001 | Requests | queue with synthetic service mix | TEST labels only | find/filter/open | MANUAL SCREENSHOT REQUIRED | Requests queue and service/status filters |
| SS-010 | Review Queue | cancellation/refund action | synthetic pending action | open exact blocker | MANUAL SCREENSHOT REQUIRED | Review Queue cancellation work |
| SS-020 | Overview | safe synthetic selected | no real contact visible | next action and totals | MANUAL SCREENSHOT REQUIRED | Request Overview |
| SS-030 | Documents | customer upload group | generic test PDF | provenance | MANUAL SCREENSHOT REQUIRED | Customer-provided source document |
| SS-031 | Documents | pending review output | generic output | review before release | MANUAL SCREENSHOT REQUIRED | Private deliverable awaiting review |
| SS-032 | Documents | eligible release control | generic output | release boundary | MANUAL SCREENSHOT REQUIRED | Release to Customer control |
| SS-040 | Quote | synthetic draft | generic items | save vs send | MANUAL SCREENSHOT REQUIRED | Quote builder |
| SS-050 | Payments | paid synthetic invoice | TEST payment only | ledger totals | MANUAL SCREENSHOT REQUIRED | Paid, refunded, net, outstanding |
| SS-052 | Payments | cancellation preview/refund workflow | safe synthetic only | decision/financial preview | MANUAL SCREENSHOT REQUIRED | Guided refund review |
| SS-060 | Messages | synthetic communication log | generic recipient | provider/log truth | MANUAL SCREENSHOT REQUIRED | Communication Log |
| SS-061 | Messages | preview/edit | generic template | Send Message | MANUAL SCREENSHOT REQUIRED | Informational send |
| SS-062 | Messages | maintained transition template | generic template | Send & Update Status | MANUAL SCREENSHOT REQUIRED | Message-driven transition |
| SS-070 | Fulfillment | RON before provider action | no access URL visible | 13-stage readiness | MANUAL SCREENSHOT REQUIRED | RON readiness and Proof boundary |
| SS-080 | Fulfillment | Mobile synthetic | generic address hidden | service facts/N/A | MANUAL SCREENSHOT REQUIRED | Mobile completion facts |
| SS-090 | Fulfillment | Print synthetic | generic specs | production/delivery | MANUAL SCREENSHOT REQUIRED | Print & Scan fulfillment |
| SS-100 | Portal | synthetic overview | redacted/scoped | customer-safe state | MANUAL SCREENSHOT REQUIRED | Customer Overview |
| SS-101 | Portal | synthetic released document | generic file only | secure document grouping | MANUAL SCREENSHOT REQUIRED | Released customer document |
| SS-110 | Portal | cancellation request form | synthetic unpaid | review-based request | MANUAL SCREENSHOT REQUIRED | Request Cancellation |
| SS-111 | Admin | cancellation review modal | synthetic | policy band/decision | MANUAL SCREENSHOT REQUIRED | Admin cancellation review |
| SS-112 | Portal | refund processed display | synthetic ledger | financial outcome | MANUAL SCREENSHOT REQUIRED | Customer refund status |

No screenshot was committed automatically in this release because the available live queue includes legitimate production records and provider identifiers. Capturing a full viewport would violate the safety rule. The exact safe states above are ready for a controlled redacted documentation session.
