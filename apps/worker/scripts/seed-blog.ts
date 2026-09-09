// Seeds the five launch articles. Idempotent: upserts by slug, so re-running updates copy in place
// rather than creating duplicates — safe to run against production after an edit.
//
//   pnpm --filter @labprice/worker exec tsx scripts/seed-blog.ts
//
// Lives in apps/worker/scripts because that is where this repo's one-off scripts run from — it is
// the workspace with tsx and dotenv (apps/web has neither), same as the discover-<vendor>.ts scripts.
//
// Editorial rules these articles follow, and any future one should too:
//  - Every <h2> is a question someone actually types, and the first sentence under it answers that
//    question outright. Context comes after the answer, never before it.
//  - Nothing clinical is asserted that isn't standard, checkable reference material, and nothing
//    tells a reader what their own result means or what to do about it.
//  - Prices are stated with the date they were true and a pointer to the live page, because they are
//    scraped values that move.
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
      'A routine blood draw takes about five minutes and collects one to a few small tubes — usually 10 to 30 mL in total, a fraction of what a blood donation takes. A phlebotomist finds a vein in the crook of your elbow, fills the tubes the requisition calls for, and sends them to the laboratory. The draw is identical no matter which service you ordered the test through.',
    heroUrl: '/blog/how-a-blood-draw-works.jpg',
    heroAlt: 'A phlebotomist in gloves drawing blood from a patient’s arm, with a tourniquet in place and collection tubes on a tray behind.',
    heroCredit: 'Photo: Nguyễn Hiệp / Unsplash',
    relatedTests: ['complete-blood-count-w-differential-platelets', 'comprehensive-metabolic-panel-14', 'lipid-panel'],
    body: `Most of what happens between paying for a blood test and reading the result takes place somewhere you never see. The service you order from doesn't draw your blood — it sells you a **requisition**, which is the laboratory's authorisation to run specific tests on a sample. The draw happens at a Quest Diagnostics or LabCorp patient service center, and the analysis happens in that company's laboratory.

[FIG:draw-steps]

## What actually happens during a blood draw?

You sit down, roll up a sleeve, and a phlebotomist puts an elastic tourniquet around your upper arm to make the veins easier to find. They clean a patch of skin with an alcohol wipe, insert a thin needle into a vein — usually in the crook of the elbow, where the veins sit close to the surface — and attach one or more vacuum tubes that fill on their own. The tourniquet comes off, the needle comes out, and you hold a folded gauze pad over the site while they label the tubes.

The needle is in your arm for well under a minute in most cases. Everything else is setup and paperwork.

## How long does a blood draw take?

Around five minutes from sitting down to standing up, with most of that spent on checking your ID against the requisition and labelling tubes. Appointments run longer than the procedure — plan for the wait, not the draw.

## How much blood is actually taken?

A single tube holds roughly 2 to 6 mL. A typical requisition fills one to four tubes, so most draws collect somewhere between 10 and 30 mL — about two tablespoons at the high end.

For scale, a standard blood donation takes around 470 mL, and an adult's total blood volume is roughly 4.5 to 5.5 litres. A routine diagnostic draw is a very small fraction of that, which is why you can eat, drive and go back to work immediately afterwards.

## Why are there different coloured tube caps?

Each colour is a different additive, and the additive determines what the lab can measure from that tube. It isn't decoration — putting blood in the wrong tube ruins the sample.

| Cap colour | What's inside | Commonly used for |
| --- | --- | --- |
| Lavender | EDTA (stops clotting, preserves cells) | Complete blood count |
| Gold or red | Clot activator, often with separator gel | Chemistry panels, lipids, hormones, vitamin levels |
| Light green | Lithium heparin with separator gel | Many chemistry tests |
| Light blue | Sodium citrate | Clotting studies |
| Grey | Fluoride and oxalate (stops glucose breaking down) | Glucose, lactate |

This is also why one draw can cover several unrelated tests: the phlebotomist simply fills the tubes those tests need, from the same needle stick.

## What happens to your blood after the draw?

The labelled tubes are batched and couriered to a laboratory — usually a regional processing facility rather than the building you visited. Most are spun in a centrifuge to separate serum or plasma from the cells, then loaded onto analysers that run the specific assays your requisition ordered.

Routine results are commonly back within one to three business days. Specialised assays — anything sent to a reference laboratory, or a test that requires a culture or mass spectrometry — take longer.

> The laboratory doesn't know or care what you paid. The same instrument runs the same assay whether the requisition came from a hospital system or a $9 online order.

## Does a blood draw hurt?

Most people describe a brief sharp scratch as the needle goes in, and nothing much after that. Some bruising at the site over the following days is common and harmless.

A small number of people feel light-headed or faint during or shortly after a draw. If that's you, say so before they start — phlebotomists deal with it constantly, and having you lie down instead of sit up is a routine adjustment, not a fuss.

## How to make the draw go smoothly

1. Drink water beforehand unless you've been told to fast from fluids too. Well-hydrated veins are easier to find.
2. Bring photo ID and your requisition — printed or on your phone.
3. Wear a top with sleeves that push up easily above the elbow.
4. Tell the phlebotomist if you've fainted at a draw before, or if one arm is off-limits (for example after lymph node surgery on that side).
5. Keep the gauze pressed on for a few minutes afterwards, and leave the bandage on for an hour or so.

## Do you need a doctor's order for a blood draw?

A laboratory needs an order from a licensed provider before it will run a test, but that order doesn't have to come from *your* doctor. Self-pay ordering services work with a physician network that issues the requisition, which is what you're buying when you order online. A small number of US states restrict direct-access testing — New York is the one most often cited — so availability varies by where you live.

If you already have an order from your own clinician, you can usually take that to a patient service center directly instead.`,
    faq: `Q: How long does a blood draw take?
A: About five minutes from sitting down to standing up. The needle itself is usually in your arm for less than a minute; the rest is identity checks and labelling tubes.

Q: How much blood is taken for a blood test?
A: Typically 10 to 30 mL across one to four tubes — roughly two tablespoons at most. A blood donation takes around 470 mL by comparison.

Q: Can you drive after having blood drawn?
A: Yes, for a routine diagnostic draw. The volume taken is small enough that most people feel nothing. If you tend to feel faint, sit for a few minutes before leaving.

Q: Why did they take several tubes for one test?
A: Different tests need different preservatives, and each tube contains only one. Several tubes from a single needle stick is normal, and does not mean several separate draws.

Q: How long do blood test results take?
A: Routine results are commonly available in one to three business days. Specialised assays sent to a reference laboratory take longer.`,
  },

  {
    slug: 'fasting-before-a-blood-test',
    title: 'Do you need to fast before a blood test?',
    excerpt:
      'Most blood tests do not require fasting. The ones that usually do are glucose and insulin tests, and any panel containing them — such as a comprehensive metabolic panel. When fasting is required it normally means 8 to 12 hours with nothing but plain water. Always follow the instruction printed on your own requisition, because it is specific to the test that was ordered.',
    heroUrl: '/blog/fasting-before-a-blood-test.jpg',
    heroAlt: 'A finished meal on a table — an empty plate with a fork and knife, beside a coffee mug.',
    heroCredit: 'Photo: James Sestric / Unsplash',
    relatedTests: ['comprehensive-metabolic-panel-14', 'insulin-fasting', 'lipid-panel', 'hemoglobin-a1c'],
    body: `"Fasting" for a blood test means no food and no drinks other than plain water for a set period before the draw. It exists for one reason: some of the things a laboratory measures change within minutes of eating, so a result taken after a meal cannot be compared to the reference range, which was built from fasted samples.

[FIG:fasting-clock]

## Which blood tests require fasting?

Glucose and insulin tests require it, and so does any panel that includes them. Most other common tests do not.

| Test | Fasting usually required? |
| --- | --- |
| [Fasting insulin](/test/insulin-fasting) | Yes — 8 hours or more |
| [Comprehensive metabolic panel](/test/comprehensive-metabolic-panel-14) | Yes — it includes glucose |
| [Lipid panel](/test/lipid-panel) | Sometimes — increasingly ordered non-fasting |
| [Iron and TIBC](/test/iron-tibc) | Often, and usually a morning draw |
| [Haemoglobin A1c](/test/hemoglobin-a1c) | No |
| [Complete blood count](/test/complete-blood-count-w-differential-platelets) | No |
| [TSH and thyroid tests](/test/tsh-thyroid-stimulating-hormone) | No |
| [Vitamin D](/test/vitamin-d-25-hydroxy) and [vitamin B12](/test/vitamin-b12) | No |

This table is a general guide, not an instruction. Laboratories and ordering providers differ, and the requisition you were given is the authority.

## How long do you have to fast?

Where fasting is required, 8 to 12 hours is the usual instruction. In practice that means finishing dinner and booking a morning appointment — which is why fasting draws are almost always early slots.

Fasting substantially longer than asked is not better. Very long fasts can shift some results in their own right, and they make the appointment considerably more unpleasant.

## What can you drink while fasting?

Plain water, and keep drinking it — being well hydrated genuinely makes the draw easier, and dehydration can concentrate some analytes.

Black coffee and plain tea are permitted by some laboratories and not by others. Because it varies, and because coffee is one of the few things that could plausibly nudge a metabolic result, the safe answer is to check your requisition and default to water if it doesn't say.

Anything with calories breaks the fast: juice, milk or cream, sweetened drinks, alcohol, sweets, and chewing gum that isn't sugar-free.

## Should you take your medication before a fasting blood test?

Prescription medicines are normally taken as usual, with water — stopping them without being told to is its own risk. Supplements are a different matter: biotin in particular can interfere with some immunoassays, including certain thyroid and hormone tests, and is commonly asked to be stopped for a period beforehand.

If you take supplements, ask when you book rather than deciding on the day.

## What happens if you eat by mistake?

Tell the phlebotomist before the draw. Depending on the test, they will either rebook you or note it so the laboratory can flag the result as non-fasting.

Saying nothing produces the genuinely bad outcome: a technically normal-looking result that quietly isn't comparable to its reference range, and nobody knows.

## Why does eating change a blood test result?

Because some measurements are literally reporting what is circulating at that moment. Glucose rises within minutes of a meal. Triglycerides climb for several hours after eating fat. Those are the results a fast is protecting.

Other measurements don't work that way. Haemoglobin A1c reflects average glucose over roughly the previous three months, so a single meal cannot move it — which is exactly why it needs no fast.

> If you're not sure whether your test needs a fast, book a morning appointment and fast anyway. Fasting for a test that didn't need it costs you a skipped breakfast. Not fasting for one that did costs you the appointment.

## Do you need to fast for a lipid panel?

This one has genuinely changed. A lipid panel was traditionally drawn fasting, and much US guidance has moved towards accepting non-fasting samples for routine cholesterol screening, since the difference for most people is small. Triglycerides are the component most affected by a recent meal.

Some ordering providers still request a fast, some don't. Follow what your requisition says rather than what you remember from last time.`,
    faq: `Q: How long should you fast before a blood test?
A: Usually 8 to 12 hours where fasting is required. Finishing dinner and taking a morning appointment is the practical way to do it.

Q: Can you drink water while fasting for a blood test?
A: Yes. Plain water is allowed and encouraged — being hydrated makes the draw easier and helps avoid concentrated results.

Q: Can you drink coffee before a fasting blood test?
A: It depends on the laboratory. Some allow black coffee, others ask for water only. Check your requisition, and default to water if it doesn't say.

Q: Does a lipid panel need to be fasting?
A: Sometimes. Non-fasting lipid panels are increasingly accepted for routine screening, but some ordering providers still request a fast. Triglycerides are the number most affected by a recent meal.

Q: Does haemoglobin A1c require fasting?
A: No. A1c reflects average blood glucose over about three months, so a recent meal cannot change it.

Q: What if you accidentally ate before a fasting test?
A: Tell the phlebotomist before the draw. They will either rebook you or have the result flagged as non-fasting so it is interpreted correctly.`,
  },

  {
    slug: 'what-a-lipid-panel-measures',
    title: 'What does a lipid panel measure?',
    excerpt:
      'A lipid panel measures four things from a single blood sample: total cholesterol, LDL cholesterol, HDL cholesterol and triglycerides. It is the standard test for assessing cardiovascular risk, and it is one of the cheapest and most widely stocked tests in self-pay lab testing. Interpreting the numbers is a job for a clinician who knows your history.',
    heroUrl: '/blog/what-a-lipid-panel-measures.jpg',
    heroAlt: 'Rows of blood collection tubes with coloured caps arranged in a laboratory rack.',
    heroCredit: 'Photo: Testalize.me / Unsplash',
    relatedTests: ['lipid-panel', 'apolipoprotein-b', 'lipoprotein-a', 'c-reactive-protein-high-sensitivity'],
    body: `A lipid panel — you may see it called a lipid profile or a cholesterol test — is one blood draw that reports several separate measurements of the fats circulating in your blood.

[FIG:lipid-breakdown]

## What are the four numbers on a lipid panel?

**Total cholesterol** is all the cholesterol being carried in your blood. On its own it says relatively little, because it lumps together fractions that behave very differently.

**LDL cholesterol** is the fraction that deposits cholesterol into artery walls, which is the process underlying atherosclerosis. It is the number most treatment decisions are anchored to. On many panels LDL is calculated from the other results rather than measured directly, which is one reason a very high triglyceride result can make the LDL figure unreliable.

**HDL cholesterol** carries cholesterol away from tissues and back to the liver. Higher is generally regarded as more favourable, within limits.

**Triglycerides** are a different kind of blood fat, not a component of cholesterol at all. They respond strongly to recent meals, alcohol and carbohydrate intake.

Many reports also give **non-HDL cholesterol**, which is simply total minus HDL. It requires no extra measurement and is increasingly used because it captures every cholesterol-carrying particle that contributes to risk.

## Do you need to fast for a lipid panel?

Often not any more. Non-fasting lipid panels are increasingly accepted for routine screening, because the difference for most people is modest. Triglycerides are the component most affected by eating, so a fast still matters more when triglycerides specifically are the question.

Practically: follow the instruction on your requisition. If it doesn't say and you want the cleanest comparison to a previous result, match the conditions of that earlier draw. See [fasting before a blood test](/blog/fasting-before-a-blood-test) for what a fast does and doesn't allow.

## How often should cholesterol be checked?

Widely cited US guidance suggests screening roughly every four to six years for healthy adults at low risk, and more frequently for people with existing cardiovascular disease, diabetes, a strong family history, or who are being treated for high cholesterol.

That is a population-level starting point, not a recommendation for you. Testing intervals are one of the things worth asking a clinician about directly.

## What do lipid panel results mean?

They are one input to an overall cardiovascular risk estimate, not a verdict on their own. Risk calculators used in practice combine lipid results with age, sex, blood pressure, smoking status and diabetes — which is why two people with identical cholesterol numbers can receive completely different advice.

> Nothing on this page can tell you whether your own result is a problem. A number outside a reference range is a reason to talk to a clinician, not a diagnosis, and a number inside one is not a guarantee of anything either.

## What about ApoB and Lp(a)?

These are two additional tests that come up constantly alongside a standard lipid panel.

- [Apolipoprotein B](/test/apolipoprotein-b) counts the particles carrying cholesterol rather than measuring the cholesterol inside them. Because each atherogenic particle carries exactly one ApoB, it is a direct particle count — useful when LDL cholesterol and actual particle burden diverge, which happens more often in people with high triglycerides or metabolic syndrome.
- [Lipoprotein(a)](/test/lipoprotein-a) is a largely inherited, genetically determined lipoprotein that a standard panel does not capture. It is generally checked once, since it changes very little over a lifetime.

Neither replaces a lipid panel. Both are ordered as separate tests, and both are available self-pay.

## How much does a lipid panel cost without insurance?

Far less than most people expect, and the spread between services is large. As of September 2026, the self-pay prices we track for a [lipid panel](/test/lipid-panel) ran from **$7.42 to $59.00** across 17 ordering services — the same test, at the same laboratories, at an eight-fold difference in price.

Prices move, so the live figures on the test page are the ones to trust. The point of the comparison is that the cheapest and most expensive listings are not buying you a different test.`,
    faq: `Q: What does a lipid panel test for?
A: Total cholesterol, LDL cholesterol, HDL cholesterol and triglycerides, from a single blood sample. Most reports also derive non-HDL cholesterol from those values.

Q: Is a lipid panel the same as a cholesterol test?
A: Yes. "Lipid panel", "lipid profile" and "cholesterol test" generally refer to the same group of measurements.

Q: Do you need to fast for a lipid panel?
A: Not always. Non-fasting samples are increasingly accepted for routine screening. Triglycerides are the number most affected by a recent meal, so a fast matters more when they are the focus.

Q: What is the difference between LDL and HDL cholesterol?
A: LDL carries cholesterol into artery walls, the process behind atherosclerosis. HDL carries cholesterol back to the liver for disposal.

Q: Are triglycerides part of total cholesterol?
A: No. Triglycerides are a separate type of blood fat that a lipid panel reports alongside cholesterol, not a component of the total cholesterol figure.

Q: How much does a lipid panel cost without insurance?
A: Self-pay prices we tracked in September 2026 ranged from $7.42 to $59.00 across 17 ordering services. Current prices are on the lipid panel comparison page.`,
  },

  {
    slug: 'what-a-metabolic-panel-measures',
    title: 'What is a comprehensive metabolic panel testing for?',
    excerpt:
      'A comprehensive metabolic panel (CMP) measures 14 substances in one blood sample to give a broad picture of kidney function, liver function, blood sugar, protein levels and electrolyte balance. It is one of the most commonly ordered blood tests in routine care, and it usually requires fasting because it includes glucose.',
    heroUrl: '/blog/what-a-metabolic-panel-measures.jpg',
    heroAlt: 'Blood collection tubes with red, purple and green caps standing in a yellow laboratory rack.',
    heroCredit: 'Photo: National Cancer Institute / Unsplash',
    relatedTests: ['comprehensive-metabolic-panel-14', 'complete-blood-count-w-differential-platelets', 'hemoglobin-a1c', 'uric-acid'],
    body: `The comprehensive metabolic panel is a survey, not a targeted test. It measures 14 different things at once, which is why it turns up in almost every routine check-up and pre-operative work-up — it covers a lot of ground for one draw.

[FIG:cmp-groups]

## What does a comprehensive metabolic panel include?

Fourteen measurements, which make more sense grouped by what they describe than listed alphabetically.

| Group | Measurements | What the group describes |
| --- | --- | --- |
| Kidney | BUN, creatinine | How well the kidneys are clearing waste |
| Liver | ALT, AST, ALP, bilirubin | Liver enzymes and processing |
| Electrolytes and fluid | Sodium, potassium, chloride, carbon dioxide, calcium | Fluid balance, nerve and muscle signalling |
| Sugar and protein | Glucose, albumin, total protein | Blood sugar and circulating protein |

Most reports also include **eGFR**, an estimate of kidney filtration rate. It is calculated from your creatinine result rather than measured separately, which is why it doesn't count towards the panel's 14.

## What is the difference between a CMP and a BMP?

The basic metabolic panel (BMP) is the same panel with the liver group and the protein measurements removed — 8 measurements instead of 14. It covers kidney function, electrolytes and glucose.

If a clinician wants liver enzymes, they order the CMP. If they only need kidneys, electrolytes and sugar, the BMP does it. The draw is identical either way.

## What is the difference between a CMP and a CBC?

They measure completely different things and are frequently ordered together.

- A **CMP** measures chemistry — substances dissolved in the liquid part of your blood.
- A [complete blood count](/test/complete-blood-count-w-differential-platelets) counts the cells: red cells, white cells and platelets.

One tells you about organ function and chemical balance; the other tells you about the cells themselves. Neither substitutes for the other, and they even use different collection tubes.

## Do you need to fast for a comprehensive metabolic panel?

Usually yes, because the panel includes glucose, which rises within minutes of eating. The standard instruction is 8 to 12 hours with plain water only.

Some providers will accept a non-fasting CMP when glucose isn't the point of ordering it. As always, the requisition wins — see [do you need to fast before a blood test](/blog/fasting-before-a-blood-test).

## Why is a CMP ordered?

As a broad screen rather than to answer a specific question. Common reasons include a routine physical, monitoring a known kidney or liver condition, checking on medications that can affect liver or kidney function, and pre-operative assessment.

Because it is broad, a CMP quite often returns one value slightly outside its reference range in a person who is entirely well. Reference ranges are built so that a proportion of healthy people fall outside them by definition.

> A single mildly out-of-range value on a 14-measurement panel is common and frequently means nothing on its own. What it means depends on which measurement, how far outside, your history, and whether it is a change from your previous results — which is a conversation with a clinician, not a lookup.

## What does the CMP not tell you?

Quite a lot, and it is worth knowing the gaps:

- It does not measure long-term blood sugar control. That is [haemoglobin A1c](/test/hemoglobin-a1c), which reflects roughly three months rather than this morning.
- It does not include cholesterol. That is a separate [lipid panel](/test/lipid-panel).
- It does not include thyroid function, iron status, vitamin levels or inflammatory markers.
- It does not count blood cells.

A CMP being normal is reassuring about the specific systems it covers, and says nothing about the ones it doesn't.

## How much does a comprehensive metabolic panel cost?

As of September 2026, the self-pay prices we track for a [comprehensive metabolic panel](/test/comprehensive-metabolic-panel-14) ranged from **$4.99 to $59.00** across 18 ordering services. It is among the cheapest panels available precisely because it is so routine — the laboratories run enormous volumes of it.

Live prices are on the test page; the ones quoted here are a snapshot.`,
    faq: `Q: What does a comprehensive metabolic panel test for?
A: Fourteen measurements covering kidney function (BUN, creatinine), liver function (ALT, AST, ALP, bilirubin), electrolytes and fluid balance (sodium, potassium, chloride, carbon dioxide, calcium) and sugar and protein (glucose, albumin, total protein).

Q: What is the difference between a CMP and a BMP?
A: A basic metabolic panel is the same test without the liver enzymes and protein measurements — 8 measurements rather than 14.

Q: What is the difference between a CMP and a CBC?
A: A CMP measures chemistry dissolved in the blood; a complete blood count counts the red cells, white cells and platelets. They are different tests and are often ordered together.

Q: Do you need to fast for a comprehensive metabolic panel?
A: Usually yes, typically 8 to 12 hours with water only, because the panel includes glucose.

Q: Does a CMP check cholesterol?
A: No. Cholesterol is measured by a separate lipid panel.

Q: Is one abnormal value on a CMP a problem?
A: Not necessarily. Reference ranges are set so that some healthy people fall outside them, and a single mildly out-of-range value on a 14-measurement panel is common. Interpretation depends on which value and on your history.`,
  },

  {
    slug: 'lab-tests-without-insurance',
    title: 'How to get blood tests without insurance',
    excerpt:
      'You can order most routine blood tests yourself, without a doctor’s visit and without insurance, through an online ordering service. You pay a fixed published price up front, receive a requisition, and have blood drawn at a Quest Diagnostics or LabCorp patient service center. The sample, the laboratory and the result are the same ones a doctor’s order would produce — only the price and the paperwork differ.',
    heroUrl: '/blog/lab-tests-without-insurance.jpg',
    heroAlt: 'A stethoscope resting on top of a calculator.',
    heroCredit: 'Photo: Marek Studzinski / Unsplash',
    relatedTests: ['lipid-panel', 'comprehensive-metabolic-panel-14', 'vitamin-d-25-hydroxy', 'hemoglobin-a1c'],
    body: `Self-pay lab testing exists because of a structural oddity: for routine blood work, the cash price is often lower than a typical insurance deductible, and unlike the insurance route you know the number before you commit.

[FIG:selfpay-vs-insurance]

## Can you order your own blood tests?

In most of the United States, yes. A laboratory still needs an order from a licensed provider, but it doesn't have to come from a doctor you've seen — online ordering services work with a physician network that issues the requisition as part of your purchase.

A small number of states restrict direct-access testing, with New York the most commonly cited. Availability and the exact rules vary, so it is worth checking what applies where you live before ordering.

## How does self-pay lab testing work?

1. **Order online.** Choose the test and pay the listed price. No appointment with a doctor is involved.
2. **Receive a requisition**, usually by email within minutes.
3. **Visit a patient service center** — a Quest or LabCorp location — with the requisition and photo ID. Some services let you walk in, others want an appointment.
4. **Have blood drawn.** Around five minutes; see [how a blood draw works](/blog/how-a-blood-draw-works).
5. **Get results** directly, commonly within one to three business days for routine tests.

## Is a self-pay blood test the same test?

Yes — this is the part people most often disbelieve. The sample goes to the same Quest or LabCorp laboratory, is run on the same analysers, against the same reference ranges, and produces the same report. Ordering services are not laboratories; they are a purchasing and paperwork layer in front of the two national labs.

That is exactly why price comparison works here. When the underlying product is genuinely identical, the only thing left to compare is what you are charged for arranging it.

## How much do blood tests cost without insurance?

Less than most people assume, with an enormous spread between services for the identical test. These are prices we tracked in September 2026:

| Test | Cheapest | Most expensive | Services compared |
| --- | --- | --- | --- |
| [Comprehensive metabolic panel](/test/comprehensive-metabolic-panel-14) | $4.99 | $59.00 | 18 |
| [Lipid panel](/test/lipid-panel) | $7.42 | $59.00 | 17 |
| [Vitamin D, 25-hydroxy](/test/vitamin-d-25-hydroxy) | $13.63 | $99.00 | 18 |

Scraped prices move, so treat these as a snapshot and check the live figure on each test page. The pattern, though, is stable: the same test routinely differs by five to ten times in price depending purely on where you buy the requisition.

## Why do prices vary so much for the same test?

Nothing about the laboratory work changes. What varies is the margin the ordering service adds, the volume discount it has negotiated with the lab, and whether it is pricing as a loss-leader to sell you something else — a membership, a subscription, a broader panel.

Some services also quote a lower "member" price that requires a monthly fee, which is only cheaper if you test often enough to clear the subscription cost.

> A price comparison is only meaningful if the tests being compared are genuinely identical. We match tests across services by Quest and LabCorp order code rather than by marketing name, because two services can sell quite different tests under very similar names.

## Can you use an HSA or FSA for lab tests?

Diagnostic testing is generally an eligible medical expense for HSA and FSA accounts, and many ordering services accept those cards directly. Eligibility rules vary by plan, so confirm with your administrator rather than assuming — and keep the receipt either way.

## What self-pay testing does not do

Worth being clear about the limits:

- **It doesn't interpret anything for you.** You receive numbers and reference ranges, not advice. An out-of-range result is a reason to see a clinician.
- **Your results don't automatically reach your doctor.** You can share them, but nothing is filed anywhere on your behalf.
- **It doesn't replace clinical assessment.** Deciding which tests are worth running is itself a clinical judgement, and ordering a panel because it was cheap is not the same as needing it.
- **It isn't for urgent problems.** Anything acute belongs with a clinician now, not with a requisition and a three-day turnaround.

## Is self-pay always cheaper than using insurance?

No. If you have already met your deductible for the year, running the test through insurance may cost you nothing at the point of care. Self-pay tends to win when you are early in a deductible year, on a high-deductible plan, uninsured, or simply want a known price rather than a bill that arrives weeks later.

The honest framing is that they are different trade-offs, not that one is universally better.`,
    faq: `Q: Can you order blood tests without a doctor?
A: In most US states, yes. Online ordering services work with a physician network that issues the laboratory requisition as part of your purchase. A small number of states restrict direct-access testing, New York being the most commonly cited.

Q: Are self-pay blood tests the same as tests ordered by a doctor?
A: Yes. The sample goes to the same Quest or LabCorp laboratory, runs on the same analysers against the same reference ranges, and produces the same report.

Q: How much do blood tests cost without insurance?
A: Routine panels are often between $5 and $60 self-pay. In September 2026 a comprehensive metabolic panel ranged from $4.99 to $59.00 and a lipid panel from $7.42 to $59.00 across the services we track.

Q: Why does the same blood test cost different amounts at different services?
A: The laboratory work is identical. What differs is the ordering service's markup, its negotiated volume rate, and whether it is pricing low to sell a membership or a larger panel.

Q: Can you pay for lab tests with an HSA or FSA?
A: Diagnostic testing is generally an eligible expense and many services accept HSA and FSA cards, but eligibility rules vary by plan — confirm with your administrator.

Q: Will my doctor get my self-pay results?
A: Not automatically. Results go to you, and it is up to you to share them.`,
  },
];

async function main() {
  // Backdated a day apart so the index has a sensible order instead of five identical timestamps.
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
      // Keep the original publish date on a re-run — this script is the edit path for these five.
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
