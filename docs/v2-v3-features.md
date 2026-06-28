# LabTestCompare — v2 & v3 Feature Roadmap

**Domain:** labtestcompare.com
**Last updated:** 2026-06-28

---

## v1 Recap (What Ships First)

For context, v1 delivers: price comparison across 10 ordering services for 12 tests, search with autocomplete, test detail pages with clinical content, affiliate click tracking, price history charts, saved tests, basic price alerts ("any drop" or target price), admin panel with scrape approval queue, SEO, and daily automated scraping.

---

## v2 — Engagement, Intelligence & Content Depth

v2 turns LabTestCompare from a lookup tool into something users return to weekly. The theme is **"know more, pay less, come back."**

### Price Alert & Email System (Enhanced)

| # | Feature | Description |
|---|---------|-------------|
| 2.1 | **Biomarker sale alerts** | Email users when any biomarker on their watch list drops in price at any vendor. "Vitamin D just dropped to $28 at Life Extension — the lowest price in 90 days." |
| 2.2 | **Weekly price digest** | Opt-in weekly email summarizing price changes across saved tests. "3 of your 7 saved tests got cheaper this week." Includes mini trend sparklines. |
| 2.3 | **Price drop leaderboard email** | Monthly "biggest drops" email showing the top 10 price decreases across the entire catalog — drives re-engagement and discovery. |
| 2.4 | **Back-in-stock alerts** | Notify users when a test that was unavailable at a specific vendor becomes available again. |
| 2.5 | **Smart alert thresholds** | System suggests alert thresholds based on historical price data. "TSH has never been below $18 — setting your alert at $20 gives you a 73% chance of triggering in the next 6 months." |
| 2.6 | **Alert delivery preferences** | Let users choose email, SMS (via Twilio), or push notification per alert. |

### Biomarker & Clinical Content Depth

| # | Feature | Description |
|---|---------|-------------|
| 2.7 | **Biomarker encyclopedia** | Dedicated pages for each biomarker (e.g., `/biomarkers/cholesterol-ldl`). What it measures, why it matters, optimal vs. normal ranges, when to retest, what affects results. Interlinked with tests that include that biomarker. |
| 2.8 | **"What does my result mean?" guide** | For each biomarker, show range bands (Low / Normal / Optimal / High) with plain-language explanations. Not a diagnosis — a starting point for conversation with a doctor. |
| 2.9 | **Test preparation deep-dives** | Expanded prep content: fasting requirements, medication interactions, best time of day, hydration tips. Sourced from publicly available clinical references. |
| 2.10 | **Related tests suggestions** | "People who order TSH also compare: Free T3, Free T4, Thyroid Panel." Based on co-occurrence in saved tests and search sessions. |
| 2.11 | **Biomarker-to-test mapping search** | User searches "cholesterol" and sees every test that includes cholesterol as a biomarker (Lipid Panel, VAP, NMR LipoProfile, etc.) with a comparison of which tests give the most biomarkers per dollar. |
| 2.12 | **Normal range by age/sex** | Display reference ranges segmented by demographics where clinically appropriate (e.g., testosterone ranges differ significantly by age and sex). |

### Admin Intelligence & Gap Analysis

| # | Feature | Description |
|---|---------|-------------|
| 2.13 | **Search analytics dashboard** | What users are searching for, ranked by frequency. Clickable drill-down to see which queries returned results and which didn't. |
| 2.14 | **Zero-result gap report** | Automated weekly report of search queries that returned no results, ranked by frequency. "83 users searched for 'ANA test' this week — we don't have it." Actionable: one-click to create a new test entry from the gap report. |
| 2.15 | **Biomarker coverage heatmap** | Visual grid showing which biomarkers are covered across which vendors. Spots gaps at a glance (e.g., "No vendor has Insulin-like Growth Factor priced"). |
| 2.16 | **Price anomaly dashboard** | Flag prices that are statistical outliers — a vendor suddenly charging 3x the median could be a scrape error or a real price hike. Admin sees it before users do. |
| 2.17 | **Vendor health scorecard** | Per-vendor reliability metrics: scrape success rate, average staleness, price change frequency, data quality score. Helps prioritize which vendors need scraper maintenance. |
| 2.18 | **Affiliate click-through report** | Which tests drive the most clicks? Which vendors get the most orders? Revenue attribution by test and vendor. |

### User Suggestions & Community Input

| # | Feature | Description |
|---|---------|-------------|
| 2.19 | **Suggest a test** | Public form: "Can't find your test? Suggest it." Captures test name, why they need it, and email for notification when added. Feeds into admin gap analysis. |
| 2.20 | **Suggest a vendor/lab** | "Know an ordering service we're missing? Tell us." Captures vendor name, URL, and what tests they offer. Admin reviews and decides whether to add. |
| 2.21 | **Report a price** | "See a different price? Let us know." User submits vendor + test + price they see. Creates a flagged entry for admin review. Crowdsourced price verification. |
| 2.22 | **Upvote tests to add** | Public voting board for suggested tests. Most-requested tests get prioritized for catalog addition. Drives engagement and shows users they're heard. |

### Test Bundles & Panels

| # | Feature | Description |
|---|---------|-------------|
| 2.23 | **Panel builder** | Users create custom test bundles ("My Annual Checkup": CBC + CMP + Lipid + TSH + Vitamin D). System shows total cost per vendor and highlights the cheapest combination. |
| 2.24 | **Pre-built wellness panels** | Curated bundles: "Basic Wellness," "Hormone Check," "Heart Health," "Diabetes Monitor." Each shows which individual tests are included and the combined cost across vendors. |
| 2.25 | **Bundle price comparison** | Some vendors sell panels (e.g., "Comprehensive Wellness Panel" for $199). Compare the vendor's panel price vs. ordering each test individually — show which is cheaper. |

### Vendor Ratings & Reviews

| # | Feature | Description |
|---|---------|-------------|
| 2.26 | **User ratings** | Rate ordering services on: price accuracy, ease of ordering, results turnaround, customer service. 1-5 stars per dimension. |
| 2.27 | **Written reviews** | Optional text reviews with admin moderation queue. Displayed on a vendor profile page and summarized on the test detail price table. |
| 2.28 | **Vendor comparison page** | `/vendors/compare` — side-by-side comparison of ordering services on price range, average rating, number of tests offered, turnaround time, and customer service reputation. |

---

## v3 — Platform, Personalization & Scale

v3 evolves LabTestCompare from a comparison site into a **health testing platform**. The theme is **"your personal lab advisor."**

### Personalization & Accounts

| # | Feature | Description |
|---|---------|-------------|
| 3.1 | **Health profile** | Users optionally set age, sex, health goals (e.g., "managing thyroid," "fitness optimization," "annual checkup"). Used to personalize recommendations and reference ranges. |
| 3.2 | **Personalized test recommendations** | "Based on your profile, you might want to add Vitamin B12 and Ferritin to your next order." Driven by health goals, saved tests, and co-occurrence data. |
| 3.3 | **Testing schedule planner** | "You last saved CBC 4 months ago. Most people retest every 6 months. Reminder set for August." Calendar view of suggested retest intervals per biomarker. |
| 3.4 | **Spending tracker** | "You've saved $247 this year by using LabTestCompare." Track total savings based on affiliate clicks and price-at-cheapest vs. price-at-most-expensive. Gamification angle. |
| 3.5 | **Household accounts** | Manage testing for family members under one account. Each member gets their own saved tests, alerts, and recommendations. Useful for caregivers (Persona: Caregiver Casey). |

### Location Intelligence

| # | Feature | Description |
|---|---------|-------------|
| 3.6 | **ZIP-aware results** | Enter your ZIP code to see which Quest/LabCorp draw sites are nearby. Some ordering services have regional pricing — surface that. |
| 3.7 | **Draw site finder** | Interactive map showing Quest and LabCorp patient service centers near the user. Hours, address, phone, and distance. "3 Quest locations within 10 miles of 33602." |
| 3.8 | **Regional price variations** | Some vendors price differently by region. Flag when a test price varies by location and show the user's local price. |

### Content & Education

| # | Feature | Description |
|---|---------|-------------|
| 3.9 | **Blog / health content hub** | SEO-driven articles: "What Your Lipid Panel Results Mean," "How Often Should You Check Your Testosterone?", "Understanding Thyroid Tests." Drives organic traffic and establishes authority. |
| 3.10 | **Test comparison articles** | "TSH vs. Full Thyroid Panel: Which Should You Order?" — editorial content comparing related tests, when each is appropriate, and cost differences. |
| 3.11 | **Video explainers** | Short (2-3 min) embedded videos explaining common tests, how to prepare, and what results mean. Hosted on YouTube for SEO; embedded on test pages. |
| 3.12 | **Glossary** | Searchable medical terminology glossary. "What does 'fasting' mean?" "What is a 'requisition'?" Links from clinical content to glossary entries. |

### Advanced Comparison & Discovery

| # | Feature | Description |
|---|---------|-------------|
| 3.13 | **Multi-test compare matrix** | Select 2-5 tests and see a side-by-side matrix of prices across all vendors. Highlights the vendor that's cheapest for the entire set. |
| 3.14 | **Price history export** | Download CSV/PDF of price history for any test. Useful for users tracking costs over time or for employer wellness program administrators. |
| 3.15 | **Coupon & promo code tracker** | Some ordering services offer promo codes or seasonal discounts. Scrape and surface these: "Walk-In Lab has 15% off all hormone tests through July 4." |
| 3.16 | **Insurance vs. cash comparison** | "Your insurance copay for CBC is ~$45. Cash price at Life Extension: $15. You'd save $30 paying cash." Requires insurance cost data (user-reported or estimated). |
| 3.17 | **Subset vendor selection** | "I only want to compare Ulta Lab Tests, Life Extension, and Walk-In Lab." User deselects vendors they don't want to consider. Preference saved to profile. |
| 3.18 | **Price prediction** | ML model trained on historical price data: "Vitamin D prices typically drop 10% in January. Consider waiting." Experimental feature with clear disclaimers. |

### Developer & Integration

| # | Feature | Description |
|---|---------|-------------|
| 3.19 | **Public API** | Documented, rate-limited API for third-party integrations. Endpoints for search, pricing, and biomarker data. API key management in user dashboard. |
| 3.20 | **Browser extension** | Chrome/Firefox extension that detects when you're on an ordering service's test page and shows a LabTestCompare popup: "This test is $12 cheaper at Life Extension." |
| 3.21 | **Embeddable price widget** | Health blogs and wellness sites can embed a LabTestCompare price comparison widget for specific tests. Drives affiliate traffic and brand awareness. |
| 3.22 | **Webhook notifications** | Developers and power users can register a webhook URL to receive price change events in real time instead of email. |

### Employer & B2B

| # | Feature | Description |
|---|---------|-------------|
| 3.23 | **Employer wellness portal** | White-label or branded version for companies offering self-pay lab testing as a wellness benefit. Employees see curated test lists and pre-negotiated pricing. |
| 3.24 | **Bulk ordering support** | For wellness companies, clinics, or health coaches ordering tests for multiple patients. Volume discount surfacing from vendors that offer it. |
| 3.25 | **Affiliate dashboard for partners** | Health bloggers, coaches, and wellness influencers get a referral dashboard with custom tracking links and commission reporting. |

### Platform & Scale

| # | Feature | Description |
|---|---------|-------------|
| 3.26 | **Native mobile apps** | iOS and Android apps consuming the REST API. Push notifications for price alerts. Offline access to saved tests and recent searches. |
| 3.27 | **Internationalization** | Support for Canadian lab testing services (LifeLabs, Dynacare). Multi-currency display. Localized content. |
| 3.28 | **A/B testing framework** | Test variations of landing pages, CTAs, pricing table layouts, and email subject lines. Optimize conversion rates to affiliate clicks. |
| 3.29 | **Advanced admin analytics** | Cohort analysis (retention by signup month), funnel visualization (search → detail → click → order), revenue forecasting, vendor negotiation data ("we sent Vendor X 5,000 clicks last month"). |
| 3.30 | **AI-powered test advisor** | Chat interface: "I'm a 45-year-old male, haven't had bloodwork in 2 years, family history of diabetes. What tests should I get?" Returns a recommended panel with pricing. Heavy disclaimers — not medical advice. |

---

## Prioritization Guide

### v2 Quick Wins (high impact, low effort)
- 2.1 Biomarker sale alerts
- 2.13 Search analytics dashboard
- 2.14 Zero-result gap report
- 2.19 Suggest a test
- 2.20 Suggest a vendor
- 2.2 Weekly price digest

### v2 High Impact (worth the investment)
- 2.7 Biomarker encyclopedia
- 2.23 Panel builder
- 2.11 Biomarker-to-test mapping search
- 2.21 Report a price

### v3 Differentiators (competitive moat)
- 3.6 ZIP-aware results
- 3.7 Draw site finder
- 3.15 Coupon & promo tracker
- 3.20 Browser extension
- 3.30 AI-powered test advisor

---

## Revenue Impact Notes

| Feature | Revenue Mechanism |
|---------|-------------------|
| Biomarker sale alerts | Drives repeat affiliate clicks when prices drop |
| Weekly digest | Re-engagement → more affiliate clicks |
| Panel builder | Higher cart value per visit |
| Vendor ratings | Builds trust → higher conversion |
| Suggest a test | Expands catalog → more pages → more SEO traffic |
| Browser extension | Captures users at point of purchase on competitor sites |
| Employer portal | B2B SaaS revenue stream (not affiliate-dependent) |
| Embeddable widget | Viral distribution, new traffic source |
| Public API | Developer ecosystem, potential API monetization |
