// The FAQ shown on a test page, and the single source for its `FAQPage` JSON-LD.
//
// Two rules govern everything in this file.
//
// 1. **Never split the schema from the visible content.** `Post.faq` already works this way for
//    articles, for the same reason: emitting FAQ structured data for questions a visitor cannot see
//    is what gets rich results revoked. One array feeds both the rendered section and the JSON-LD.
//
// 2. **Nothing here is generated, and nothing here is medical.** Every answer is assembled from data
//    we already curate — prices, order codes, the confidence flag — or it
//    states how self-pay lab ordering works, which is a commercial fact about the product rather
//    than advice about anyone's health. There is deliberately no "should I take this test", no
//    result interpretation and no reference-range guidance: those are the YMYL questions, they need
//    a clinician, and the site's answer to them is the disclaimer.
//
// A question with no data behind it is omitted rather than hedged. Six on a fully-populated test,
// fewer on a sparse one.
import { indefiniteArticle } from './grammar';

export interface FaqItem {
  question: string;
  answer: string;
}

export interface TestFaqInput {
  name: string;
  /** The name with a trailing noun, e.g. "Ferritin test" — same phrase the H2s use. */
  phrase: string;
  questCode: string | null;
  labcorpCode: string | null;
  /** Only HIGH-confidence codes are claimed as "the same test your doctor would order". */
  confidence: string;
  /** True when no Quest/LabCorp order code exists at all — the draw isn't at their centers. */
  thirdPartyOnly: boolean;
  offerings: { vendorName: string; price: number }[];
  /** ISO timestamp of the freshest price verification, or null. */
  lastChecked: string | null;
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

function longDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function testFaq(t: TestFaqInput): FaqItem[] {
  const a = indefiniteArticle(t.phrase);
  const items: FaqItem[] = [];

  // Price. First because it is the question the page exists to answer, and the most quotable thing
  // on it — every figure derived from the same offerings the table renders, so the two can't differ.
  if (t.offerings.length > 0) {
    const cheapest = t.offerings.reduce((x, y) => (x.price <= y.price ? x : y));
    const priciest = t.offerings.reduce((x, y) => (x.price >= y.price ? x : y));
    items.push({
      question: `How much does ${a} ${t.phrase} cost without insurance?`,
      answer:
        `The lowest self-pay price we track for ${t.name} is ${usd(cheapest.price)} at ${cheapest.vendorName}, ` +
        `across ${t.offerings.length} ordering service${t.offerings.length === 1 ? '' : 's'}; the highest is ${usd(priciest.price)}. ` +
        `You pay the ordering service directly, and no insurance is involved` +
        (t.lastChecked ? `. Prices were last verified on ${longDate(t.lastChecked)}.` : '.'),
    });
  }

  // How the model works. Universally true of every service listed here, and the single most common
  // thing people don't know about self-pay testing.
  items.push({
    question: `Do you need a doctor's order for ${a} ${t.phrase}?`,
    answer:
      `No. Every ordering service listed on this page includes the physician order with the purchase, so you can ` +
      `buy ${t.name} yourself and take the requisition to the lab. Your results come back to you — what they mean ` +
      `is a conversation for you and a clinician.`,
  });

  if (!t.thirdPartyOnly) {
    // Name only the labs that actually carry an order code for this test. Saying "Quest or LabCorp"
    // on a test only LabCorp lists would send someone to the wrong patient service center.
    const labs =
      t.questCode && t.labcorpCode
        ? 'a Quest Diagnostics or LabCorp patient service center, depending on which laboratory the ordering service you pick uses'
        : t.questCode
          ? 'a Quest Diagnostics patient service center — Quest is the laboratory that carries this test'
          : t.labcorpCode
            ? 'a LabCorp patient service center — LabCorp is the laboratory that carries this test'
            : 'a Quest Diagnostics or LabCorp patient service center';
    items.push({
      question: `Where is the blood drawn for ${a} ${t.phrase}?`,
      answer:
        `At ${labs}. You choose the location and time after you order. LabTestCompare does not draw blood, run ` +
        `tests, or issue results — we only compare what each service charges.`,
    });
  }

  // NOTE: there is deliberately no "how do you prepare" entry, even though it is the most-asked
  // question about any lab test. The page already answers it in a question-shaped <h2> from the same
  // `preparation` field, and repeating that copy verbatim a few hundred pixels lower would be the
  // worst kind of duplication — identical text, twice, on the page's own subject.

  items.push({
    question: `Can you use health insurance for ${a} ${t.phrase}?`,
    answer:
      `No. Every price on this page is a self-pay price paid directly to the ordering service, and none of these ` +
      `services bill insurance. If you want ${t.name} billed through your plan instead, that goes through your own ` +
      `provider — which is a separate route with its own cost, and worth comparing against the prices here.`,
  });

  // Only claimed where the codes have actually been verified against the labs' own directories.
  // A LOW/MEDIUM-confidence code is exactly the case where "yes, it's identical" would be a guess.
  if (t.confidence === 'HIGH' && (t.questCode || t.labcorpCode)) {
    const codes = [
      t.questCode ? `Quest #${t.questCode}` : null,
      t.labcorpCode ? `LabCorp #${t.labcorpCode}` : null,
    ]
      .filter(Boolean)
      .join(' and ');
    items.push({
      question: `Is this the same ${t.name} test a doctor would order?`,
      answer:
        `Yes — it is the same assay, identified by the same laboratory order code${codes.includes(' and ') ? 's' : ''}: ${codes}. ` +
        `Every price on this page is matched to that code, which is how we can say the services are being compared on ` +
        `an identical test rather than on similarly named products.`,
    });
  }

  items.push({
    question: `How long do ${t.name} results take?`,
    answer:
      `That is set by the laboratory rather than by us. Routine blood tests are commonly back within a few business ` +
      `days and specialized assays take longer; the ordering service states the expected turnaround for ${t.name} ` +
      `before you buy, and delivers the result to you directly.`,
  });

  return items;
}
