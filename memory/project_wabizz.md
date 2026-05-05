---
name: WA Bizz Project Overview
description: Self-hosted per-business WhatsApp SaaS platform for Sri Lankan SMEs — full architecture and build roadmap
type: project
---

WA Bizz is a multi-tenant WhatsApp automation SaaS. Each SME gets their own isolated Hetzner CX21 VPS with Evolution API, Node.js bot, PostgreSQL, Redis, and a React dashboard. Central control plane manages billing (Stripe/PayHere), auto-provisioning, and fleet updates.

**Why:** Owner wants a scalable, zero-shared-data platform targeting Sri Lankan clothing/perfume/food sellers. Sells at Rs 3,500–9,000/month per business.

**Tech stack (per-business VPS):** Evolution API, Node.js 20 + Express, Redis, PostgreSQL 16, React 18 + Vite + Tailwind, Nginx, Docker Compose, PM2, Certbot.

**Tech stack (central):** Node.js Fleet Manager API, React admin UI, Stripe + PayHere, Hetzner Cloud API, Cloudflare API, Resend email.

**Build phases:**
- Phase 1 (Weeks 1-4): Core bot — WhatsApp conversation flow, session state machine, product/order DB
- Phase 2 (Weeks 5-7): Owner dashboard — real-time orders, product catalog management, QR reconnect
- Phase 3 (Weeks 8-9): Payment integration — PayHere + Stripe
- Phase 4 (Weeks 10-13): Auto-provisioning pipeline — Hetzner API, SSH automation, Cloudflare DNS, onboarding email
- Phase 5 (Weeks 14-16): Remote updates + Fleet Manager UI
- Phase 6 (Weeks 17-20): Multi-business-type templates, CSV import, analytics, backups

**How to apply:** Start each new conversation by picking up where the last phase ended. Phase 1 is being built first.
