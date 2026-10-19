# Product

<!-- impeccable:product-schema 1 -->

## Platform

web (installable PWA; the owner app and the studio are used mostly on a phone). The user asked for an iOS design language (Apple HIG) for the studio on 19 Oct 2026: web, styled to feel native on iPhone.

## Users

- **Primary: the business owner.** Today: Indonesian UMKM (kos, minimarket, bimbel, small shops), not technical, mostly on a phone. They write how their business runs (an SOP) once, approve it with their fingerprint, and occasionally change a rule. Their work is spread across many platforms (Google Sheets, Gmail, WhatsApp/Telegram, POS, payment gateways), which Reeve connects.
- **Later: enterprise.** The same flow scales up to companies (more rules, more systems, roles); the studio must not assume a single tiny business forever.
- Secondary readers: judges and developers who want the technical proof (audit, sandbox, receipts).

## Job to be done

"Run my business the way I already run it, without me doing the repetitive part, and never do anything I haven't approved."

The studio's job: describe → Reeve turns it into rules → Reeve tests the rules on a practice month → the owner approves with a passkey → Reeve runs them on the owner's real apps → every step is provable.

## What makes it different

- Two agents: a Builder writes the code from the owner's SOP; an independent Auditor tries to break it (its own spec, planted defects, constraint checks) before the owner ever sees an approve button.
- Code runs in a CreateOS sandbox; keys stay in a broker; anything above the owner's limits waits for their passkey.
- Every run and approval goes on a hash-chained ledger, anchored on-chain (Monad testnet) as proof.
- Any model can read the SOP (Claude tiers, cheaper or free alternatives); the Auditor checks all of them the same way.

## Product truth to preserve

- Steps and their order: Describe, Rules, Audit (simulate + check), Approve (passkey), Run, Proof.
- Business types: Rent collection (kos), Stock and expiry (minimarket), Any SOP (own spreadsheet and apps).
- Real figures only (from runs); never invent customers, testimonials or results.
- Honesty notes stay: a KPI is "a target, not a promise"; actions not yet connected are "recorded, not sent".

## Voice

- **Assumed (not confirmed by the owner):** Indonesian everyday language for the owner-facing studio; technical terms hidden behind "Lihat detail". English remains for code, logs and developer detail.
- Plain verbs, short sentences, one action per screen.

## Accessibility

- Phone-first, 44px touch targets, readable at large text sizes, works in dark appearance (the brand is dark).
- Never rely on colour alone for pass/fail.

## Open decisions

- Whether the studio needs an English toggle (assumed: not yet).
- Roles and multi-business switching for enterprise (later).
