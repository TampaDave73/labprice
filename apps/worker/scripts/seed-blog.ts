// Seeds and edits every published article. Idempotent: upserts by slug, so re-running updates copy in
// place rather than creating duplicates. Safe to run against production after an edit.
//
//   pnpm --filter @labprice/worker exec tsx scripts/seed-blog.ts
//
// Lives in apps/worker/scripts because that is where this repo's one-off scripts run from: it is
// the workspace with tsx and dotenv (apps/web has neither), same as the discover-<vendor>.ts scripts.
//
// The first five are the launch articles. The last five began as AI drafts from /admin/questions and
// were rewritten here (2026-09-15) after they shipped with a repeated opening paragraph, raw table
// pipes, heavy em-dash use and a shared template that made them read as generated. Once an article is
// in this file, this file is its source: an edit made only in /admin/blog is overwritten on the next run.
//
// Editorial rules these articles follow, and any future one should too:
//  - Every <h2> is a question someone actually types, and the first sentence under it answers that
//    question outright. Context comes after the answer, never before it.
//  - The page renders the excerpt as the lead paragraph, so the body never opens by restating it.
//  - No em dashes. Use a period, comma, colon or parentheses.
//  - Each article covers its own ground and links to the others instead of re-explaining them. No
//    boilerplate sections ("how do you get this test", "how are results read") repeated across posts.
//  - Nothing clinical is asserted that isn't standard, checkable reference material, and nothing
//    tells a reader what their own result means or what to do about it.
//  - Prices are never written as literals. `[PRICE…:slug]` tokens are resolved at request time from
//    the same offerings the price cards use (see lib/blog.ts), so an article cannot go stale and
//    cannot contradict the table underneath it.
//  - Tables are one row per line with a `| --- |` separator; `*single asterisks*` are not markup.
import 'dotenv/config';
import { prisma } from '@labprice/database';

interface Seed {
  slug: string;
  title: string;
  excerpt: string;
  heroUrl: string;
  heroAlt: string;
  heroCredit: string;
  relatedTests: string[];
  body: string;
  faq: string;
}

const POSTS: Seed[] = [
  {
    slug: 'how-a-blood-draw-works',
    title: 'How a blood draw actually works, start to finish',
    excerpt:
      'A routine blood draw takes about five minutes and collects one to a few small tubes, usually 10 to 30 mL in total, a fraction of what a blood donation takes. A phlebotomist finds a vein in the crook of your elbow, fills the tubes the requisition calls for, and sends them to the laboratory. The draw is identical no matter which service you ordered the test through.',
    heroUrl: '/blog/how-a-blood-draw-works-1600.webp',
    heroAlt: 'A phlebotomist in gloves drawing blood from a patient’s arm, with a tourniquet in place.',
    heroCredit: 'Photo: Nguyễn Hiệp / Unsplash',
    relatedTests: ['complete-blood-count-w-differential-platelets', 'comprehensive-metabolic-panel-14', 'lipid-panel'],
    body: `[FIG:draw-steps]

## What actually happens during a blood draw?

You sit down, roll up a sleeve, and a phlebotomist puts an elastic tourniquet around your upper arm to make the veins easier to find. They clean a patch of skin with an alcohol wipe, insert a thin needle into a vein (usually in the crook of the elbow, where the veins sit close to the surface) and attach one or more vacuum tubes that fill on their own. The tourniquet comes off, the needle comes out, and you hold a folded gauze pad over the site while they label the tubes.

The needle is in your arm for well under a minute in most cases. Everything else is setup and paperwork.

## How long does a blood draw take?

Around five minutes from sitting down to standing up, with most of that spent checking your ID against the requisition and labeling tubes. Appointments run longer than the procedure, so plan for the wait, not the draw.

## How much blood is actually taken?

A single tube holds roughly 2 to 6 mL. A typical requisition fills one to four tubes, so most draws collect somewhere between 10 and 30 mL, about two tablespoons at the high end.

For scale, a standard blood donation takes around 470 mL, and an adult's total blood volume is roughly 4.5 to 5.5 liters. A routine diagnostic draw is a very small fraction of that, which is why you can eat, drive and go back to work immediately afterward.

## Why are there different colored tube caps?

Each color is a different additive, and the additive determines what the lab can measure from that tube. It isn't decoration: putting blood in the wrong tube ruins the sample.

| Cap color | What's inside | Commonly used for |
| --- | --- | --- |
| Lavender | EDTA (stops clotting, preserves cells) | Complete blood count |
| Gold or red | Clot activator, often with separator gel | Chemistry panels, lipids, hormones, vitamin levels |
| Light green | Lithium heparin with separator gel | Many chemistry tests |
| Light blue | Sodium citrate | Clotting studies |
| Gray | Fluoride and oxalate (stops glucose breaking down) | Glucose, lactate |

This is also why one draw can cover several unrelated tests: the phlebotomist simply fills the tubes those tests need, from the same needle stick.

## What happens to your blood after the draw?

The labeled tubes are batched and couriered to a laboratory, usually a regional processing facility rather than the building you visited. Most are spun in a centrifuge to separate serum or plasma from the cells, then loaded onto analyzers that run the specific assays your requisition ordered.

Routine results are commonly back within one to three business days. Specialized assays take longer, including anything sent to a reference laboratory and tests that require a culture or mass spectrometry.

> The laboratory doesn't know or care what you paid. The same instrument runs the same assay whether the requisition came from a hospital system or a cheap online order.

## Does a blood draw hurt?

Most people describe a brief sharp scratch as the needle goes in, and nothing much after that. Some bruising at the site over the following days is common and harmless.

A small number of people feel light-headed or faint during or shortly after a draw. If that's you, say so before they start. Phlebotomists deal with it constantly, and having you lie down instead of sit up is a routine adjustment, not a fuss.

## How can you make a blood draw go smoothly?

1. Drink water beforehand unless you've been told to fast from fluids too. Well-hydrated veins are easier to find.
2. Bring photo ID and your requisition, printed or on your phone.
3. Wear a top with sleeves that push up easily above the elbow.
4. Tell the phlebotomist if you've fainted at a draw before, or if one arm is off-limits (for example after lymph node surgery on that side).
5. Keep the gauze pressed on for a few minutes afterward, and leave the bandage on for an hour or so.

## Do you need a doctor's order for a blood draw?

A laboratory needs an order from a licensed provider before it will run a test, but that order doesn't have to come from your own doctor. Self-pay ordering services have a physician sign the requisition as part of the purchase, and a few states restrict this. [Ordering your own blood work without a doctor](/blog/order-blood-work-without-a-doctor) covers how that works and where it isn't available.

If you already have an order from your own clinician, you can usually take that to a patient service center directly instead.

## Sources

- [Blood Tests (National Heart, Lung, and Blood Institute, NIH)](https://www.nhlbi.nih.gov/health/blood-tests)
- [Laboratory Tests (MedlinePlus, National Library of Medicine)](https://medlineplus.gov/laboratorytests.html)
- [How to Understand Your Lab Results (MedlinePlus)](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/)`,
    faq: `Q: How long does a blood draw take?
A: About five minutes from sitting down to standing up. The needle itself is usually in your arm for less than a minute; the rest is identity checks and labeling tubes.

Q: How much blood is taken for a blood test?
A: Typically 10 to 30 mL across one to four tubes, roughly two tablespoons at most. A blood donation takes around 470 mL by comparison.

Q: Can you drive after having blood drawn?
A: Yes, for a routine diagnostic draw. The volume taken is small enough that most people feel nothing. If you tend to feel faint, sit for a few minutes before leaving.

Q: Why did they take several tubes for one test?
A: Different tests need different preservatives, and each tube contains only one. Several tubes from a single needle stick is normal, and does not mean several separate draws.

Q: How long do blood test results take?
A: Routine results are commonly available in one to three business days. Specialized assays sent to a reference laboratory take longer.`,
  },

  {
    slug: 'fasting-before-a-blood-test',
    title: 'Do you need to fast before a blood test?',
    excerpt:
      'Most blood tests do not require fasting. The ones that usually do are glucose and insulin tests, and any panel containing them, such as a comprehensive metabolic panel. When fasting is required it normally means 8 to 12 hours with nothing but plain water. Always follow the instruction printed on your own requisition, because it is specific to the test that was ordered.',
    heroUrl: '/blog/fasting-before-a-blood-test-1600.webp',
    heroAlt: 'A finished meal on a table: an empty plate with a fork and knife, beside a coffee mug.',
    heroCredit: 'Photo: James Sestric / Unsplash',
    relatedTests: ['comprehensive-metabolic-panel-14', 'insulin-fasting', 'lipid-panel', 'hemoglobin-a1c'],
    body: `[FIG:fasting-clock]

## Which blood tests require fasting?

Glucose and insulin tests require it, and so does any panel that includes them. Most other common tests do not.

| Test | Fasting usually required? |
| --- | --- |
| [Fasting insulin](/test/insulin-fasting) | Yes, 8 hours or more |
| [Comprehensive metabolic panel](/test/comprehensive-metabolic-panel-14) | Yes, because it includes glucose |
| [Lipid panel](/test/lipid-panel) | Sometimes; increasingly ordered non-fasting |
| [Iron and TIBC](/test/iron-tibc) | Often, and usually a morning draw |
| [Hemoglobin A1c](/test/hemoglobin-a1c) | No |
| [Complete blood count](/test/complete-blood-count-w-differential-platelets) | No |
| [TSH and thyroid tests](/test/tsh-thyroid-stimulating-hormone) | No |
| [Vitamin D](/test/vitamin-d-25-hydroxy) and [vitamin B12](/test/vitamin-b12) | No |

This table is a general guide, not an instruction. Laboratories and ordering providers differ, and the requisition you were given is the authority.

## How long do you have to fast?

Where fasting is required, 8 to 12 hours is the usual instruction. In practice that means finishing dinner and booking a morning appointment, which is why fasting draws are almost always early slots.

Fasting substantially longer than asked is not better. Very long fasts can shift some results in their own right, and they make the appointment considerably more unpleasant.

## What can you drink while fasting?

Plain water, and keep drinking it. Being well hydrated genuinely makes the draw easier, and dehydration can concentrate some analytes.

Black coffee and plain tea are permitted by some laboratories and not by others. Because it varies, and because coffee is one of the few things that could plausibly nudge a metabolic result, check your requisition and default to water if it doesn't say.

Anything with calories breaks the fast: juice, milk or cream, sweetened drinks, alcohol, sweets, and chewing gum that isn't sugar-free.

## Should you take your medication before a fasting blood test?

Prescription medicines are normally taken as usual, with water. Stopping them without being told to is its own risk. Supplements are a different matter: biotin in particular can interfere with some immunoassays, including certain thyroid and hormone tests, and people are commonly asked to stop it for a period beforehand.

If you take supplements, ask when you book rather than deciding on the day.

## What happens if you eat by mistake?

Tell the phlebotomist before the draw. Depending on the test, they will either rebook you or note it so the laboratory can flag the result as non-fasting.

Saying nothing produces the genuinely bad outcome: a normal-looking result that quietly isn't comparable to its reference range, and nobody knows.

## Why does eating change a blood test result?

Because some measurements report what is circulating at that moment. Glucose rises within minutes of a meal. Triglycerides climb for several hours after eating fat. Those are the results a fast is protecting, and the reference ranges for them were built from fasted samples.

Other measurements don't work that way. Hemoglobin A1c reflects average glucose over roughly the previous three months, so a single meal cannot move it, which is exactly why it needs no fast.

> If you're not sure whether your test needs a fast, book a morning appointment and fast anyway. Fasting for a test that didn't need it costs you a skipped breakfast. Not fasting for one that did costs you the appointment.

## Do you need to fast for a lipid panel?

This one has genuinely changed. A lipid panel was traditionally drawn fasting, and much US guidance has moved toward accepting non-fasting samples for routine cholesterol screening, since the difference for most people is small. Triglycerides are the component most affected by a recent meal.

Some ordering providers still request a fast, some don't. Follow what your requisition says rather than what you remember from last time.

## Sources

- [Fasting for a Blood Test (MedlinePlus, National Library of Medicine)](https://medlineplus.gov/lab-tests/fasting-for-a-blood-test/)
- [Cholesterol Levels (MedlinePlus)](https://medlineplus.gov/lab-tests/cholesterol-levels/)
- [Blood Tests (National Heart, Lung, and Blood Institute, NIH)](https://www.nhlbi.nih.gov/health/blood-tests)`,
    faq: `Q: How long should you fast before a blood test?
A: Usually 8 to 12 hours where fasting is required. Finishing dinner and taking a morning appointment is the practical way to do it.

Q: Can you drink water while fasting for a blood test?
A: Yes. Plain water is allowed and encouraged. Being hydrated makes the draw easier and helps avoid concentrated results.

Q: Can you drink coffee before a fasting blood test?
A: It depends on the laboratory. Some allow black coffee, others ask for water only. Check your requisition, and default to water if it doesn't say.

Q: Does hemoglobin A1c require fasting?
A: No. A1c reflects average blood glucose over about three months, so a recent meal cannot change it.

Q: Does chewing gum break a fast before a blood test?
A: Gum that contains sugar does, because anything with calories breaks the fast. Sugar-free gum is generally treated differently, but water only is the safest choice if your requisition doesn't say.`,
  },

  {
    slug: 'what-a-lipid-panel-measures',
    title: 'What does a lipid panel measure?',
    excerpt:
      'A lipid panel measures four things from a single blood sample: total cholesterol, LDL cholesterol, HDL cholesterol and triglycerides. It is the standard test for assessing cardiovascular risk, and it is one of the cheapest and most widely stocked tests in self-pay lab testing. Interpreting the numbers is a job for a clinician who knows your history.',
    heroUrl: '/blog/what-a-lipid-panel-measures-1600.webp',
    heroAlt: 'Rows of blood collection tubes with colored caps arranged in a laboratory rack.',
    heroCredit: 'Photo: Testalize.me / Unsplash',
    relatedTests: ['lipid-panel', 'apolipoprotein-b', 'lipoprotein-a', 'c-reactive-protein-high-sensitivity'],
    body: `[FIG:lipid-breakdown]

## What are the four numbers on a lipid panel?

**Total cholesterol** is all the cholesterol being carried in your blood. On its own it says relatively little, because it lumps together fractions that behave very differently.

**LDL cholesterol** is the fraction that deposits cholesterol into artery walls, which is the process underlying atherosclerosis. It is the number most treatment decisions are anchored to. On many panels LDL is calculated from the other results rather than measured directly, which is one reason a very high triglyceride result can make the LDL figure unreliable.

**HDL cholesterol** carries cholesterol away from tissues and back to the liver. Higher is generally regarded as more favorable, within limits.

**Triglycerides** are a different kind of blood fat, not a component of cholesterol at all. They respond strongly to recent meals, alcohol and carbohydrate intake.

Many reports also give **non-HDL cholesterol**, which is simply total minus HDL. It requires no extra measurement and is increasingly used because it captures every cholesterol-carrying particle that contributes to risk.

## Do you need to fast for a lipid panel?

Often not any more. Non-fasting lipid panels are increasingly accepted for routine screening, because the difference for most people is modest. Triglycerides are the component most affected by eating, so a fast still matters more when triglycerides specifically are the question.

Practically: follow the instruction on your requisition. If it doesn't say and you want the cleanest comparison to a previous result, match the conditions of that earlier draw. See [fasting before a blood test](/blog/fasting-before-a-blood-test) for what a fast does and doesn't allow.

## How often should cholesterol be checked?

Widely cited US guidance suggests screening roughly every four to six years for healthy adults at low risk, and more frequently for people with existing cardiovascular disease, diabetes, a strong family history, or who are being treated for high cholesterol.

That is a population-level starting point, not a recommendation for you. Testing intervals are one of the things worth asking a clinician about directly.

## What do lipid panel results mean?

They are one input to an overall cardiovascular risk estimate, not a verdict on their own. Risk calculators used in practice combine lipid results with age, sex, blood pressure, smoking status and diabetes, which is why two people with identical cholesterol numbers can receive completely different advice.

> Nothing on this page can tell you whether your own result is a problem. A number outside a reference range is a reason to talk to a clinician, not a diagnosis, and a number inside one is not a guarantee of anything either.

## What about ApoB and Lp(a)?

These are two additional tests that come up constantly alongside a standard lipid panel.

- [Apolipoprotein B](/test/apolipoprotein-b) counts the particles carrying cholesterol rather than measuring the cholesterol inside them. Because each atherogenic particle carries exactly one ApoB, it is a direct particle count. That matters when LDL cholesterol and actual particle burden diverge, which happens more often in people with high triglycerides or metabolic syndrome.
- [Lipoprotein(a)](/test/lipoprotein-a) is a largely inherited lipoprotein that a standard panel does not capture. It is generally checked once, since it changes very little over a lifetime.

Neither replaces a lipid panel. Both are ordered as separate tests, and both are available self-pay.

## How much does a lipid panel cost without insurance?

Far less than most people expect, and the spread between services is large. The self-pay prices we track for a [lipid panel](/test/lipid-panel) currently run from **[PRICE-RANGE:lipid-panel]** across [PRICE-COUNT:lipid-panel] ordering services. That is the same test, at the same laboratories, at several times the price.

Those figures are read live from our own price checks each time this page loads, most recently on [PRICE-DATE:lipid-panel]. The cheapest and most expensive listings are not buying you a different test.

## Sources

- [Cholesterol Levels (MedlinePlus, National Library of Medicine)](https://medlineplus.gov/lab-tests/cholesterol-levels/)
- [Triglycerides Test (MedlinePlus)](https://medlineplus.gov/lab-tests/triglycerides-test/)
- [About Cholesterol (Centers for Disease Control and Prevention)](https://www.cdc.gov/cholesterol/about/index.html)`,
    faq: `Q: What does a lipid panel test for?
A: Total cholesterol, LDL cholesterol, HDL cholesterol and triglycerides, from a single blood sample. Most reports also derive non-HDL cholesterol from those values.

Q: Is a lipid panel the same as a cholesterol test?
A: Yes. "Lipid panel", "lipid profile" and "cholesterol test" generally refer to the same group of measurements.

Q: What is the difference between LDL and HDL cholesterol?
A: LDL carries cholesterol into artery walls, the process behind atherosclerosis. HDL carries cholesterol back to the liver for disposal.

Q: Are triglycerides part of total cholesterol?
A: No. Triglycerides are a separate type of blood fat that a lipid panel reports alongside cholesterol, not a component of the total cholesterol figure.

Q: Why is LDL sometimes missing or flagged on a lipid panel report?
A: On many panels LDL is calculated from the other three numbers rather than measured. When triglycerides are very high that calculation becomes unreliable, so the lab may not report it or may note that it is estimated.`,
  },

  {
    slug: 'what-a-metabolic-panel-measures',
    title: 'What is a comprehensive metabolic panel testing for?',
    excerpt:
      'A comprehensive metabolic panel (CMP) measures 14 substances in one blood sample to give a broad picture of kidney function, liver function, blood sugar, protein levels and electrolyte balance. It is one of the most commonly ordered blood tests in routine care, and it usually requires fasting because it includes glucose.',
    heroUrl: '/blog/what-a-metabolic-panel-measures-1600.webp',
    heroAlt: 'Blood collection tubes with red, purple and green caps standing in a yellow laboratory rack.',
    heroCredit: 'Photo: National Cancer Institute / Unsplash',
    relatedTests: ['comprehensive-metabolic-panel-14', 'complete-blood-count-w-differential-platelets', 'hemoglobin-a1c', 'uric-acid'],
    body: `## What does a comprehensive metabolic panel include?

Fourteen measurements, which make more sense grouped by what they describe than listed alphabetically.

[FIG:cmp-groups]

| Group | Measurements | What the group describes |
| --- | --- | --- |
| Kidney | BUN, creatinine | How well the kidneys are clearing waste |
| Liver | ALT, AST, ALP, bilirubin | Liver enzymes and processing |
| Electrolytes and fluid | Sodium, potassium, chloride, carbon dioxide, calcium | Fluid balance, nerve and muscle signaling |
| Sugar and protein | Glucose, albumin, total protein | Blood sugar and circulating protein |

Most reports also include **eGFR**, an estimate of kidney filtration rate. It is calculated from your creatinine result rather than measured separately, which is why it doesn't count toward the panel's 14.

## What is the difference between a CMP and a BMP?

The basic metabolic panel (BMP) is the same panel with the liver group and the protein measurements removed: 8 measurements instead of 14. It covers kidney function, electrolytes and glucose.

If a clinician wants liver enzymes, they order the CMP. If they only need kidneys, electrolytes and sugar, the BMP does it. The draw is identical either way.

## What is the difference between a CMP and a CBC?

They measure completely different things and are frequently ordered together.

- A **CMP** measures chemistry: substances dissolved in the liquid part of your blood.
- A [complete blood count](/test/complete-blood-count-w-differential-platelets) counts the cells: red cells, white cells and platelets.

One tells you about organ function and chemical balance; the other tells you about the cells themselves. Neither substitutes for the other, and they even use different collection tubes.

## Do you need to fast for a comprehensive metabolic panel?

Usually yes, because the panel includes glucose, which rises within minutes of eating. The standard instruction is 8 to 12 hours with plain water only.

Some providers will accept a non-fasting CMP when glucose isn't the point of ordering it. As always, the requisition wins. See [do you need to fast before a blood test](/blog/fasting-before-a-blood-test).

## Why is a CMP ordered?

As a broad screen rather than to answer a specific question. Common reasons include a routine physical, monitoring a known kidney or liver condition, checking on medications that can affect liver or kidney function, and pre-operative assessment.

Because it is broad, a CMP quite often returns one value slightly outside its reference range in a person who is entirely well. Reference ranges are built so that a proportion of healthy people fall outside them by definition.

> A single mildly out-of-range value on a 14-measurement panel is common and frequently means nothing on its own. What it means depends on which measurement, how far outside, your history, and whether it is a change from your previous results. That is a conversation with a clinician, not a lookup.

## What does the CMP not tell you?

Quite a lot, and it is worth knowing the gaps:

- It does not measure long-term blood sugar control. That is [hemoglobin A1c](/test/hemoglobin-a1c), which reflects roughly three months rather than this morning.
- It does not include cholesterol. That is a separate [lipid panel](/test/lipid-panel).
- It does not include thyroid function, iron status, vitamin levels or inflammatory markers.
- It does not count blood cells.

A normal CMP is reassuring about the specific systems it covers, and says nothing about the ones it doesn't.

## How much does a comprehensive metabolic panel cost?

The self-pay prices we track for a [comprehensive metabolic panel](/test/comprehensive-metabolic-panel-14) currently run from **[PRICE-RANGE:comprehensive-metabolic-panel-14]** across [PRICE-COUNT:comprehensive-metabolic-panel-14] ordering services. It is among the cheapest panels available precisely because it is so routine: the laboratories run enormous volumes of it.

Those figures come from our own price checks, most recently on [PRICE-DATE:comprehensive-metabolic-panel-14].

## Sources

- [Comprehensive Metabolic Panel (CMP) (MedlinePlus, National Library of Medicine)](https://medlineplus.gov/lab-tests/comprehensive-metabolic-panel-cmp/)
- [Basic Metabolic Panel (BMP) (MedlinePlus)](https://medlineplus.gov/lab-tests/basic-metabolic-panel-bmp/)
- [How to Understand Your Lab Results (MedlinePlus)](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/)`,
    faq: `Q: What does a comprehensive metabolic panel test for?
A: Fourteen measurements covering kidney function (BUN, creatinine), liver function (ALT, AST, ALP, bilirubin), electrolytes and fluid balance (sodium, potassium, chloride, carbon dioxide, calcium) and sugar and protein (glucose, albumin, total protein).

Q: Does a CMP check cholesterol?
A: No. Cholesterol is measured by a separate lipid panel.

Q: What is eGFR on a CMP report?
A: eGFR is an estimate of how quickly the kidneys filter blood. It is calculated from the creatinine result on the panel rather than measured separately, so it is not counted among the 14 measurements.

Q: Is one abnormal value on a CMP a problem?
A: Not necessarily. Reference ranges are set so that some healthy people fall outside them, and a single mildly out-of-range value on a 14-measurement panel is common. Interpretation depends on which value and on your history.`,
  },

  {
    slug: 'lab-tests-without-insurance',
    title: 'How to get blood tests without insurance',
    excerpt:
      'You can order most routine blood tests yourself, without a doctor’s visit and without insurance, through an online ordering service. You pay a fixed published price up front, receive a requisition, and have blood drawn at a Quest Diagnostics or LabCorp patient service center. The sample, the laboratory and the result are the same ones a doctor’s order would produce. Only the price and the paperwork differ.',
    heroUrl: '/blog/lab-tests-without-insurance-1600.webp',
    heroAlt: 'A stethoscope resting on top of a calculator.',
    heroCredit: 'Photo: Marek Studzinski / Unsplash',
    relatedTests: ['lipid-panel', 'comprehensive-metabolic-panel-14', 'vitamin-d-25-hydroxy', 'hemoglobin-a1c'],
    body: `[FIG:selfpay-vs-insurance]

## How does self-pay lab testing work?

1. **Order online.** Choose the test and pay the listed price. No appointment with a doctor is involved; [a physician working with the service signs the order](/blog/order-blood-work-without-a-doctor).
2. **Receive a requisition**, usually by email within minutes.
3. **Visit a patient service center** (a Quest or LabCorp location) with the requisition and photo ID. Some services let you walk in, others want an appointment.
4. **Have blood drawn.** Around five minutes; see [how a blood draw works](/blog/how-a-blood-draw-works).
5. **Get results** directly, commonly within one to three business days for routine tests.

## Is a self-pay blood test the same test?

Yes, and this is the part people most often disbelieve. The sample goes to the same Quest or LabCorp laboratory, is run on the same analyzers, against the same reference ranges, and produces the same report. Ordering services are not laboratories; they are a purchasing and paperwork layer in front of the two national labs.

That is exactly why price comparison works here. When the underlying product is genuinely identical, the only thing left to compare is what you are charged for arranging it.

## How much do blood tests cost without insurance?

Less than most people assume, with an enormous spread between services for the identical test. These are live prices from the services we track:

| Test | Cheapest | Full range | Services compared |
| --- | --- | --- | --- |
| [Comprehensive metabolic panel](/test/comprehensive-metabolic-panel-14) | [PRICE:comprehensive-metabolic-panel-14] | [PRICE-RANGE:comprehensive-metabolic-panel-14] | [PRICE-COUNT:comprehensive-metabolic-panel-14] |
| [Lipid panel](/test/lipid-panel) | [PRICE:lipid-panel] | [PRICE-RANGE:lipid-panel] | [PRICE-COUNT:lipid-panel] |
| [Vitamin D, 25-hydroxy](/test/vitamin-d-25-hydroxy) | [PRICE:vitamin-d-25-hydroxy] | [PRICE-RANGE:vitamin-d-25-hydroxy] | [PRICE-COUNT:vitamin-d-25-hydroxy] |

Every figure in that table is read from our own price checks when the page loads, so it is current rather than a snapshot, most recently checked on [PRICE-DATE:lipid-panel]. The pattern is the stable part: the same test routinely differs by several times in price depending purely on where you buy the requisition.

## Why do prices vary so much for the same test?

Nothing about the laboratory work changes. What varies is the margin the ordering service adds, the volume discount it has negotiated with the lab, and whether it is pricing as a loss-leader to sell you something else: a membership, a subscription, a broader panel.

Some services also quote a lower "member" price that requires a monthly fee, which is only cheaper if you test often enough to clear the subscription cost.

> A price comparison is only meaningful if the tests being compared are genuinely identical. We match tests across services by Quest and LabCorp order code rather than by marketing name, because two services can sell quite different tests under very similar names.

## Can you use an HSA or FSA for lab tests?

Diagnostic testing is generally an eligible medical expense for HSA and FSA accounts, and many ordering services accept those cards directly. Eligibility rules vary by plan, so confirm with your administrator rather than assuming. Keep the receipt either way.

## Is self-pay always cheaper than using insurance?

No. If you have already met your deductible for the year, running the test through insurance may cost you nothing at the point of care, and many plans cover certain preventive screenings at no cost when a doctor orders them. Self-pay tends to win when you are early in a deductible year, on a high-deductible plan, uninsured, or simply want a known price rather than a bill that arrives weeks later.

A self-pay purchase also doesn't count toward your deductible, because the ordering service never bills your insurer. They are different trade-offs, and neither is universally better.

## What doesn't self-pay testing cover?

- **Interpretation.** You receive numbers and reference ranges, not advice. An out-of-range result is a reason to see a clinician.
- **Choosing the tests.** Deciding which tests are worth running is itself a clinical judgment, and ordering a panel because it was cheap is not the same as needing it.
- **Anything urgent.** An acute problem belongs with a clinician now, not with a requisition and a three-day turnaround.

## Sources

- [How to Understand Your Lab Results (MedlinePlus, National Library of Medicine)](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/)
- [Preventive Care Benefits for Adults (HealthCare.gov)](https://www.healthcare.gov/coverage/preventive-care-benefits/)
- [Blood Tests (National Heart, Lung, and Blood Institute, NIH)](https://www.nhlbi.nih.gov/health/blood-tests)`,
    faq: `Q: Are self-pay blood tests the same as tests ordered by a doctor?
A: Yes. The sample goes to the same Quest or LabCorp laboratory, runs on the same analyzers against the same reference ranges, and produces the same report.

Q: Why does the same blood test cost different amounts at different services?
A: The laboratory work is identical. What differs is the ordering service's markup, its negotiated volume rate, and whether it is pricing low to sell a membership or a larger panel.

Q: Can you pay for lab tests with an HSA or FSA?
A: Diagnostic testing is generally an eligible expense and many services accept HSA and FSA cards, but eligibility rules vary by plan, so confirm with your administrator.

Q: Does a self-pay lab test count toward my insurance deductible?
A: Generally no. The ordering service does not bill your insurance, so the purchase is not recorded against your deductible.

Q: Is a membership price cheaper than a one-off self-pay price?
A: Only if you test often enough. A member price usually requires a monthly fee, so it saves money when the discount across your tests is larger than the fees you pay in between.`,
  },

  {
    slug: 'order-blood-work-without-a-doctor',
    title: 'How to Order Your Own Blood Work Without a Doctor',
    excerpt:
      'You can order most routine blood tests online without seeing a doctor first. The ordering service has a physician sign the lab order for you, you have blood drawn at a Quest or LabCorp location, and the results come straight to you. New York, New Jersey and Rhode Island are the states these services most often exclude.',
    heroUrl: '/blog/generic-test-tube-1600.webp',
    heroAlt: 'A gloved hand holding a laboratory test tube.',
    heroCredit: 'Photo: Unsplash',
    relatedTests: [
      'complete-blood-count-w-differential-platelets',
      'comprehensive-metabolic-panel-14',
      'lipid-panel',
      'hemoglobin-a1c',
      'tsh-thyroid-stimulating-hormone',
      'vitamin-d-25-hydroxy',
    ],
    body: `## Who signs the lab order if you don't have a doctor?

A physician who works with the ordering service. US laboratories only run tests on an order from someone licensed to request them, so direct-access services contract with doctors who review incoming orders and sign the requisitions. You never meet that doctor, and for a routine order their part ends once the requisition is issued.

That signature is the only piece of a doctor visit the service replaces. The other two pieces, deciding which tests make sense and explaining the numbers afterward, become yours, or stay with a clinician you choose to bring in.

## What changes when you order a test yourself?

| | Ordered by your doctor | Ordered yourself online |
| --- | --- | --- |
| Who picks the tests | Your doctor, from your history | You |
| Who signs the requisition | Your doctor | A physician working with the service |
| Where blood is drawn | Quest, LabCorp, or a hospital or clinic lab | The lab company named on your requisition |
| Who receives the results | Your doctor, and usually you through a portal | You |
| Who explains them | Your doctor | Nobody, unless you take them to a clinician |

The laboratory work is identical either way. The money side, including when insurance beats a cash price, is covered in [how to get blood tests without insurance](/blog/lab-tests-without-insurance).

## Which states don't allow you to order your own lab tests?

New York, New Jersey and Rhode Island are the states that direct-access services most commonly exclude, because of state rules on who may order laboratory testing. Some services add restrictions on particular tests elsewhere. Every service checks your state at checkout, and that check is the answer to rely on, since both state rules and service policies change.

In an excluded state, the usual route is an order from a clinician, which can include a telehealth appointment.

## What should you check before you order?

1. **That it's the exact test.** Two services can sell different tests under similar names. The Quest or LabCorp order code settles it, and the price comparison on each test page here is matched by code.
2. **Which lab company the service uses.** A requisition is issued for one company, so make sure it has a patient service center you can get to.
3. **Preparation.** Some tests need a fast or a morning draw; see [fasting before a blood test](/blog/fasting-before-a-blood-test).
4. **Fees on top of the test price.** Some services add a physician or processing fee at checkout.
5. **Whether the price needs a membership.** A member price is only a saving if you test often enough to cover the monthly fee.

## Which tests can you order this way?

Most routine blood tests, and nearly every service carries the basics: a [complete blood count](/test/complete-blood-count-w-differential-platelets), a [comprehensive metabolic panel](/test/comprehensive-metabolic-panel-14), a [lipid panel](/test/lipid-panel), [hemoglobin A1c](/test/hemoglobin-a1c), [TSH](/test/tsh-thyroid-stimulating-hormone) and [vitamin D](/test/vitamin-d-25-hydroxy). The chart shows what each costs across the services we track, read live when this page loads.

[PRICE-CHART:hemoglobin-a1c,complete-blood-count-w-differential-platelets,comprehensive-metabolic-panel-14,lipid-panel,tsh-thyroid-stimulating-hormone,vitamin-d-25-hydroxy]

## How do you get self-ordered results to your own doctor?

You send them yourself. A self-ordered result isn't filed with your doctor's office or added to your medical record on its own. Services let you download the report, and your doctor's office can add that file to your chart.

Send the full report rather than a screenshot of one number. The report shows the laboratory's own reference ranges, which vary by laboratory, sex and age, and your doctor needs them to read the result.

## When is it better to go through a doctor?

When insurance would pay for the test, or when you need someone to work out what to test for. Many health plans cover certain preventive screenings, such as some cholesterol and diabetes screening, at no cost to you when your doctor orders them.

Symptoms are the other case. Ordering a marker you already track is what self-ordering does well; figuring out what is wrong is not. Anything urgent belongs with a clinician straight away.

## Sources

- [Preventive Care Benefits for Adults (HealthCare.gov)](https://www.healthcare.gov/coverage/preventive-care-benefits/)
- [How to Understand Your Lab Results (MedlinePlus)](https://medlineplus.gov/lab-tests/how-to-understand-your-lab-results/)
- [Direct-to-Consumer Tests (U.S. Food and Drug Administration)](https://www.fda.gov/medical-devices/in-vitro-diagnostics/direct-consumer-tests)`,
    faq: `Q: Is it legal to order your own blood tests without a doctor?
A: In most US states, yes. Direct-access services have a licensed physician sign the lab order, which is what the laboratory requires. New York, New Jersey and Rhode Island are the states these services most often exclude.

Q: Will the physician who signs a self-pay order explain the results?
A: Generally not. That physician's role is to authorize the order, so questions about what a result means are for your own clinician.

Q: Can you use a self-pay requisition at any lab?
A: No. The requisition is issued for one laboratory company, usually Quest or LabCorp, so the draw has to happen at a patient service center run by that company.

Q: Do you pay separately for the physician who signs the order?
A: It depends on the service. Some include the physician's authorization in the test price, and some add it as a separate fee at checkout, so compare the total rather than the listed test price.`,
  },

  {
    slug: 'infertility-on-trt-what-to-monitor',
    title: 'Infertility on TRT: What to Monitor',
    excerpt:
      'Testosterone replacement therapy (TRT) often lowers sperm production, because testosterone from outside the body tells the pituitary gland to cut back on LH and FSH, the two signals the testicles need to make sperm. The measurements used to follow this are a semen analysis, which is the direct measure, plus blood levels of LH, FSH, testosterone, estradiol and prolactin.',
    heroUrl: '/blog/generic-lab-supplies-1600.webp',
    heroAlt: 'Laboratory sample collection supplies on a white surface.',
    heroCredit: 'Photo: Unsplash',
    relatedTests: [
      'luteinizing-hormone',
      'follicle-stimulating-hormone',
      'testosterone-total',
      'testosterone-free-calculation',
      'estradiol-ultrasensitive-lc-ms-ms',
      'prolactin',
      'sex-hormone-binding-globulin',
    ],
    body: `## Why does TRT lower sperm production?

Because sperm production runs on signals from the brain, and TRT turns those signals down. The pituitary gland releases luteinizing hormone (LH) and follicle-stimulating hormone (FSH). LH tells the testicles to make testosterone. FSH, together with that testosterone, drives sperm production.

When testosterone arrives from outside the body, the pituitary reads the higher blood level as a sign that no more is needed and reduces both signals. With less LH and FSH, sperm output often falls, in some people to zero.

## Why doesn't a normal testosterone level mean normal sperm production?

A blood test measures testosterone in the bloodstream, but sperm production depends on the much higher concentration inside the testicles. On TRT, blood testosterone can sit in range, or above it, while the testicles' own output has dropped. That is why blood testosterone says little about fertility on TRT, and why LH, FSH and a semen analysis get the attention.

## What does each measurement show?

| Measurement | What it reflects | Commonly seen on TRT |
| --- | --- | --- |
| Semen analysis | Sperm count, movement and shape, the direct measure of fertility | Lower count, sometimes none |
| [FSH](/test/follicle-stimulating-hormone) | The pituitary signal that drives sperm production | Suppressed |
| [LH](/test/luteinizing-hormone) | The pituitary signal for the testicles' own testosterone | Suppressed |
| [Total](/test/testosterone-total) and [free testosterone](/test/testosterone-free-calculation) | Testosterone in the blood, from every source | Reflects treatment, not testicular output |
| [SHBG](/test/sex-hormone-binding-globulin) | The protein that binds testosterone, used to calculate the free fraction | Used to interpret the testosterone numbers |
| [Estradiol, ultrasensitive](/test/estradiol-ultrasensitive-lc-ms-ms) | Estrogen, part of which is made from testosterone | Can rise along with testosterone |
| [Prolactin](/test/prolactin) | A pituitary hormone that suppresses LH and FSH when high | Checked to rule out a separate cause |

Reference ranges for every one of these vary by laboratory, sex and age. Hormones also move through the day, which is why testosterone is usually drawn in the morning, between about 7 and 10 a.m.

All of the blood tests above can be ordered self-pay. A semen analysis can't: it goes through a fertility clinic, urology practice or andrology lab, and [what a semen analysis involves](/blog/what-is-a-semen-analysis) covers collection.

[PRICE-CHART:luteinizing-hormone,follicle-stimulating-hormone,testosterone-total,sex-hormone-binding-globulin,prolactin,estradiol-ultrasensitive-lc-ms-ms]

## Why do semen results lag behind hormone changes?

Sperm take roughly two to three months to develop. A semen sample therefore reflects conditions during that earlier stretch, not the week it was collected, while a blood hormone level describes the day of the draw. Fertility on TRT is followed with repeated tests over months for that reason; one result, taken alone, can mislead in either direction.

> Whether and how to change treatment to protect fertility is a decision for a urologist or reproductive endocrinologist who knows the whole history. No lab value answers that question by itself.

## Sources

- [Testosterone Levels Test (MedlinePlus)](https://medlineplus.gov/lab-tests/testosterone-levels-test/)
- [Follicle-Stimulating Hormone (FSH) Levels Test (MedlinePlus)](https://medlineplus.gov/lab-tests/follicle-stimulating-hormone-fsh-levels-test/)
- [Luteinizing Hormone (LH) Levels Test (MedlinePlus)](https://medlineplus.gov/lab-tests/luteinizing-hormone-lh-levels-test/)
- [Semen Analysis (MedlinePlus)](https://medlineplus.gov/lab-tests/semen-analysis/)`,
    faq: `Q: Does TRT always cause infertility?
A: No, but it commonly lowers sperm production, because testosterone from outside the body suppresses the LH and FSH signals the testicles rely on. How much varies from person to person, which is why it is followed with testing.

Q: Can a blood test show whether someone on TRT is fertile?
A: No. Blood tests describe the hormones around sperm production. The direct measure is a semen analysis, which counts sperm and assesses their movement and shape.

Q: Why are LH and FSH low on TRT?
A: The pituitary gland reduces LH and FSH when it detects enough testosterone in the blood. On TRT that testosterone comes from treatment, so both signals are commonly suppressed.

Q: Where do you get a semen analysis?
A: Through a fertility clinic, a urology practice or an andrology lab rather than a standard blood-draw center. The lab gives its own collection instructions, including how many days to abstain beforehand.`,
  },

  {
    slug: 'what-blood-tests-do-bodybuilders-track',
    title: 'What blood tests do bodybuilders track?',
    excerpt:
      'The blood tests most often discussed in bodybuilding and strength communities fall into four groups: hormones (total and free testosterone, estradiol, SHBG, LH and FSH), general health panels (CBC and CMP), heart and metabolic markers (lipid panel, ApoB, A1c, fasting insulin), and thyroid, iron and vitamin markers. Hard training changes some of these numbers by itself, which matters when comparing results over time.',
    heroUrl: '/blog/generic-test-tube-1600.webp',
    heroAlt: 'A gloved hand holding a laboratory test tube.',
    heroCredit: 'Photo: Unsplash',
    relatedTests: [
      'testosterone-total',
      'testosterone-free-calculation',
      'estradiol-ultrasensitive-lc-ms-ms',
      'sex-hormone-binding-globulin',
      'luteinizing-hormone',
      'follicle-stimulating-hormone',
      'complete-blood-count-w-differential-platelets',
      'comprehensive-metabolic-panel-14',
      'lipid-panel',
      'apolipoprotein-b',
      'hemoglobin-a1c',
      'insulin-fasting',
      'igf-1-lc-ms',
      'tsh-thyroid-stimulating-hormone',
      'ferritin',
      'vitamin-d-25-hydroxy',
    ],
    body: `## Which tests come up most, and what do they measure?

| Group | Tests | What they measure |
| --- | --- | --- |
| Hormones | [Total testosterone](/test/testosterone-total), [free testosterone](/test/testosterone-free-calculation), [estradiol](/test/estradiol-ultrasensitive-lc-ms-ms), [SHBG](/test/sex-hormone-binding-globulin), [LH](/test/luteinizing-hormone), [FSH](/test/follicle-stimulating-hormone), [IGF-1](/test/igf-1-lc-ms) | Sex hormones, the protein that decides how much testosterone is free, the pituitary signals behind them, and a marker of growth hormone activity |
| General health | [CBC](/test/complete-blood-count-w-differential-platelets), [CMP](/test/comprehensive-metabolic-panel-14) | Red cells, white cells, platelets and hematocrit; kidney and liver markers, electrolytes and glucose |
| Heart and metabolic | [Lipid panel](/test/lipid-panel), [ApoB](/test/apolipoprotein-b), [hemoglobin A1c](/test/hemoglobin-a1c), [fasting insulin](/test/insulin-fasting) | Cholesterol and the particles that carry it, three-month average blood sugar, and insulin |
| Thyroid, iron and vitamins | [TSH](/test/tsh-thyroid-stimulating-hormone), [ferritin](/test/ferritin), [vitamin D](/test/vitamin-d-25-hydroxy) | Thyroid signaling, iron stores and vitamin D status |

There is no standard "bodybuilding panel". A bundle sold under that name is some selection of the tests above, and bundles overlap: a CMP already includes glucose, and a CBC already includes hematocrit, so check what a panel contains before adding single tests to it.

[PRICE-CHART:testosterone-total,estradiol-ultrasensitive-lc-ms-ms,sex-hormone-binding-globulin,complete-blood-count-w-differential-platelets,comprehensive-metabolic-panel-14,lipid-panel,apolipoprotein-b,hemoglobin-a1c]

## Why can hard training change a blood test result?

Because some routine markers come from muscle, and others shift with hydration.

- **Creatinine**, reported on a [CMP](/test/comprehensive-metabolic-panel-14), is made as muscle tissue breaks down. People with more muscle make more of it, and intense exercise and dehydration can raise it further. The kidney filtration estimate (eGFR) on the same report is calculated from creatinine, so it moves with it.
- **Hematocrit**, reported on a [CBC](/test/complete-blood-count-w-differential-platelets), is the share of blood made up of red cells. Dehydration can push it up.
- **Creatine kinase (CK)** leaks from damaged muscle and rises after intense exercise. It isn't part of a CMP or CBC and is ordered on its own.

None of this turns a result into a diagnosis in either direction. Reference ranges vary by laboratory, sex and age, and a clinician reads a number against the person it came from.

## How do people keep results comparable from one draw to the next?

By holding the conditions steady each time:

1. **The same lab company.** Quest and LabCorp can use different methods and reference ranges for the same test, so switching between them adds noise to a trend.
2. **The same time of day.** Testosterone is usually drawn in the morning, between about 7 and 10 a.m., because levels change over the day.
3. **The same fasting state.** Glucose, insulin and triglycerides respond to a recent meal; [fasting before a blood test](/blog/fasting-before-a-blood-test) covers what a fast allows.
4. **Distance from the hardest sessions.** Before a CK test, providers may ask patients to avoid intense exercise for a few days, and many lifters book routine draws away from heavy training days for the same reason.

## Sources

- [Creatinine Test (MedlinePlus)](https://medlineplus.gov/lab-tests/creatinine-test/)
- [Hematocrit Test (MedlinePlus)](https://medlineplus.gov/lab-tests/hematocrit-test/)
- [Creatine Kinase (MedlinePlus)](https://medlineplus.gov/lab-tests/creatine-kinase/)
- [Testosterone Levels Test (MedlinePlus)](https://medlineplus.gov/lab-tests/testosterone-levels-test/)`,
    faq: `Q: Is there a standard bodybuilding blood panel?
A: No. There is no official panel. Bundles sold under that name combine hormone, general health, heart and metabolic tests chosen by the seller, and they often overlap with each other.

Q: What is the difference between total and free testosterone?
A: Total testosterone measures all testosterone in the blood. Free testosterone is the fraction not bound to proteins such as SHBG, usually calculated from total testosterone, SHBG and albumin.

Q: Why are testosterone tests drawn in the morning?
A: Testosterone levels change over the course of the day, so labs usually draw it between about 7 and 10 a.m. A consistent time makes one result comparable with the next.

Q: Why does the same hormone test cost so much more at some services?
A: Ordering services set their own prices for the same laboratory test, so the markup differs even when the lab and the assay are identical. Each test page here shows the live range.`,
  },

  {
    slug: 'what-blood-tests-relate-to-autoimmune-conditions',
    title: 'What Blood Tests Relate to Autoimmune Conditions?',
    excerpt:
      'No single blood test diagnoses an autoimmune condition. Testing usually combines broad markers, such as an ANA test, CRP or ESR and a complete blood count, with antibody tests aimed at one organ, like thyroid peroxidase antibodies for the thyroid. Which tests make sense depends on symptoms, so the choice sits with a clinician.',
    heroUrl: '/blog/generic-lab-supplies-1600.webp',
    heroAlt: 'Laboratory sample collection supplies on a white surface.',
    heroCredit: 'Photo: Unsplash',
    relatedTests: [
      'thyroid-peroxidase-antibodies',
      'tsh-thyroid-stimulating-hormone',
      't4-free',
      't3-free',
      'c-reactive-protein-high-sensitivity',
      'complete-blood-count-w-differential-platelets',
    ],
    body: `## Why is there no single blood test for autoimmune disease?

Because there are more than 80 autoimmune diseases, and they attack different tissues. In each one the immune system makes antibodies against the body's own cells, but which antibodies, and against what, depends on the condition. Testing therefore pairs broad markers that point to immune activity or inflammation with antibody tests aimed at a specific organ.

## Which broad markers are used?

| Test | What it detects | Its main limit |
| --- | --- | --- |
| ANA (antinuclear antibody) | Antibodies against the nucleus of the body's own cells | Some healthy people test positive, and levels tend to rise with age |
| CRP | A protein the liver releases during inflammation | Rises with inflammation from any cause, including infection |
| ESR (sed rate) | How quickly red cells settle in a tube, which speeds up with inflammation | Not specific to any condition |
| [Complete blood count](/test/complete-blood-count-w-differential-platelets) | Red cells, white cells and platelets | Shows effects on the blood, not their cause |

ANA and ESR aren't in our price comparison. For CRP we carry the [high-sensitivity version](/test/c-reactive-protein-high-sensitivity), which measures the same protein down to lower levels and is mostly ordered to assess heart risk.

## Which antibody tests look at a single organ?

- **Thyroid:** [thyroid peroxidase (TPO) antibodies](/test/thyroid-peroxidase-antibodies). High levels are a sign of Hashimoto's disease, the most common cause of an underactive thyroid, and these antibodies can also be a sign of Graves' disease, the most common cause of an overactive one.
- **Joints:** rheumatoid factor (RF), used in evaluating rheumatoid arthritis.
- **Small intestine:** celiac disease screening, which looks for antibodies the body makes in reaction to gluten.

> A positive antibody result is not a diagnosis. It is read against that laboratory's reference range, which varies by laboratory, sex and age, and alongside symptoms and other results.

## How do thyroid function tests fit with TPO antibodies?

They answer a different question. [TSH](/test/tsh-thyroid-stimulating-hormone), [free T4](/test/t4-free) and [free T3](/test/t3-free) show how well the thyroid is working; TPO antibodies show immune activity directed at it. The two don't have to agree, since antibodies can be present while thyroid hormone levels are still within range. That is why the antibody test and the function tests are so often ordered together.

[PRICE-CHART:thyroid-peroxidase-antibodies,tsh-thyroid-stimulating-hormone,t4-free,t3-free,c-reactive-protein-high-sensitivity,complete-blood-count-w-differential-platelets]

## Sources

- [Autoimmune Diseases (MedlinePlus)](https://medlineplus.gov/autoimmunediseases.html)
- [ANA (Antinuclear Antibody) Test (MedlinePlus)](https://medlineplus.gov/lab-tests/ana-antinuclear-antibody-test/)
- [Thyroid Antibodies (MedlinePlus)](https://medlineplus.gov/lab-tests/thyroid-antibodies/)
- [Celiac Disease Screening (MedlinePlus)](https://medlineplus.gov/lab-tests/celiac-disease-screening/)`,
    faq: `Q: Can a healthy person have a positive ANA test?
A: Yes. Some healthy people have antinuclear antibodies, levels tend to increase with age, and positive results are especially common in women over 65. A positive ANA is read alongside symptoms and other results.

Q: What is the difference between CRP and hs-CRP?
A: Both measure C-reactive protein. The high-sensitivity test detects lower levels and is mostly used to assess cardiovascular risk, while a standard CRP test is used to look for inflammation.

Q: What are thyroid peroxidase antibodies?
A: Antibodies directed at thyroid peroxidase, an enzyme the thyroid uses to make its hormones. High levels are a sign of Hashimoto's disease, and they can also be found in Graves' disease.

Q: Does a high CRP mean an autoimmune condition?
A: No. CRP rises with inflammation from any cause, including infections and injuries, so it cannot identify an autoimmune condition by itself.`,
  },

  {
    slug: 'what-is-a-semen-analysis',
    title: 'What is a semen analysis?',
    excerpt:
      'A semen analysis measures the volume of a semen sample and the number, movement and shape of the sperm in it. It is the main lab test for male fertility, and it is not a blood test: the sample is collected at a clinic or lab, or at home and delivered within 30 to 60 minutes. Blood-test ordering services don’t sell it, but they do sell the hormone tests often ordered alongside it.',
    heroUrl: '/blog/generic-laboratory-1600.webp',
    heroAlt: 'A microscope on a laboratory bench.',
    heroCredit: 'Photo: Unsplash',
    relatedTests: [
      'follicle-stimulating-hormone',
      'luteinizing-hormone',
      'testosterone-total',
      'testosterone-free-calculation',
      'prolactin',
      'estradiol-ultrasensitive-lc-ms-ms',
      'sex-hormone-binding-globulin',
    ],
    body: `## What does a semen analysis report?

| Measurement | What it describes |
| --- | --- |
| Volume | How much fluid is in the sample |
| Sperm concentration | Number of sperm per milliliter |
| Total sperm count | Sperm in the whole sample |
| Motility | Share of sperm that are moving |
| Morphology | Share of sperm with a typical shape |
| pH | How acidic or alkaline the fluid is |

Each laboratory compares these against its own reference values, which differ between labs.

## How is a semen sample collected?

1. **Abstain beforehand.** MedlinePlus describes avoiding ejaculation for 2 to 7 days before collection. The lab doing the test sets its own window, and its instructions come first.
2. **Collect into the container provided.** Usually at the clinic or lab. Some labs allow collection at home, with a kit or a special condom supplied for the purpose.
3. **Keep a home sample warm and move quickly.** It has to stay at body temperature and reach the lab within 30 to 60 minutes.
4. **Expect that one sample may not be the last.** Sperm counts vary from one sample to the next, so a single result is often confirmed with another.

## Why can't you order a semen analysis like a blood test?

Because the whole test depends on a fresh sample reaching a lab set up to examine it within the hour. Patient service centers draw blood into tubes that can travel to a regional laboratory over a day; a semen sample can't wait that long. So a semen analysis is ordered through a fertility clinic, urology practice or andrology lab, and it doesn't appear on self-pay blood-test menus.

## Which blood tests are often ordered with it?

[FSH](/test/follicle-stimulating-hormone), [LH](/test/luteinizing-hormone) and [total testosterone](/test/testosterone-total), and sometimes [prolactin](/test/prolactin) and [estradiol](/test/estradiol-ultrasensitive-lc-ms-ms). They describe the hormones that drive sperm production, which helps explain a semen result but can't stand in for one. How these markers behave on testosterone therapy is covered in [infertility on TRT](/blog/infertility-on-trt-what-to-monitor).

[PRICE-CHART:follicle-stimulating-hormone,luteinizing-hormone,testosterone-total,prolactin,estradiol-ultrasensitive-lc-ms-ms]

## Sources

- [Semen Analysis (MedlinePlus)](https://medlineplus.gov/lab-tests/semen-analysis/)
- [Male Infertility (MedlinePlus)](https://medlineplus.gov/maleinfertility.html)
- [Follicle-Stimulating Hormone (FSH) Levels Test (MedlinePlus)](https://medlineplus.gov/lab-tests/follicle-stimulating-hormone-fsh-levels-test/)`,
    faq: `Q: Can you buy a semen analysis from a blood-test ordering service?
A: Usually not. A semen analysis needs a fresh sample examined quickly, so it is ordered through a fertility clinic, urology practice or andrology lab rather than drawn at a patient service center.

Q: Is a semen analysis the same as a testosterone test?
A: No. A semen analysis examines the sperm and fluid in a semen sample, while a testosterone test measures a hormone in the blood. They answer different questions and are collected in completely different ways.

Q: Does a normal hormone panel make a semen analysis unnecessary?
A: No. Blood hormone tests describe the signals behind sperm production, not the sperm themselves, so one cannot substitute for the other.

Q: Why might a semen analysis be repeated?
A: Sperm counts vary from one sample to the next, so a single result is often confirmed with a second sample.`,
  },
];

async function main() {
  // Backdated a day apart so the index has a sensible order instead of identical timestamps. Only used
  // when a post is created; an existing post keeps its real publish date.
  const base = Date.UTC(2026, 8, 9, 12, 0, 0);

  for (const [i, p] of POSTS.entries()) {
    const publishedAt = new Date(base - (POSTS.length - 1 - i) * 86_400_000);
    const data = {
      title: p.title,
      excerpt: p.excerpt,
      body: p.body,
      author: 'Dave S.',
      heroUrl: p.heroUrl,
      heroAlt: p.heroAlt,
      heroCredit: p.heroCredit,
      faq: p.faq,
      relatedTests: p.relatedTests,
      isPublished: true,
    };

    const existing = await prisma.post.findUnique({ where: { slug: p.slug }, select: { id: true, publishedAt: true } });
    if (existing) {
      // Keep the original publish date on a re-run: this script is the edit path for these posts.
      await prisma.post.update({ where: { slug: p.slug }, data: { ...data, deletedAt: null } });
      console.log(`updated  /blog/${p.slug}`);
    } else {
      await prisma.post.create({ data: { ...data, slug: p.slug, publishedAt } });
      console.log(`created  /blog/${p.slug}`);
    }
  }

  const total = await prisma.post.count({ where: { isPublished: true, deletedAt: null } });
  console.log(`\n${total} published post(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
