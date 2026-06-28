# CFE Sprint · 25-Day Exam Engine

A focused, mobile-first study app for the **Certified Fraud Examiner (CFE)** exam, aligned to the **June 2026 three-section blueprint**.

Built as a static site (GitHub Pages) with optional **Supabase** progress sync so a streak/score earned on your phone shows up on your laptop automatically.

## What's inside
- **25-day plan** — Section 1 (Days 1–8), Section 2 (Days 9–17, with extra Law focus), Section 3 (Days 18–22), mock exams (Days 23–25).
- **Three-layer lessons** — essentials run-up, real-world **case files** across industries (casino, banking, healthcare, insurance, procurement, retail, crypto…), and an **examiner's eye** detection note. Every question is taught in that day's lesson first.
- **165 scenario-based questions** with full rationales, **30 spaced-repetition flashcards**, and **section mock exams**.
- **75% pass gate** per the real exam. Lessons stay open for revision; clearing the drill at 75% advances your streak.
- **Ask-Claude hooks** to expand any topic or drill weak areas on demand.

## Cross-device sync
Open **Set up sync**, choose a private code, and enter the same code on every device. Progress is stored in Supabase keyed to that code. Without configuration the app still works fully and saves locally (with Export/Import).

## Stack
Vanilla HTML/CSS/JS, no build step. Navy-and-gold ledger theme. `@supabase/supabase-js` via CDN.

*Personal study tool. Not affiliated with or endorsed by the ACFE.*
