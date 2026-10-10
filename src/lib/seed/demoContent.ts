import type { PageStatus, PageType } from "@/types";
import type { PlaceholderColor } from "./placeholderImage";

// A fictional small business, invented for this demo only — "Larkspur
// Coffee Roasters" is not a real company. Every page below is written in
// one consistent brand voice (warm, specific, community-rooted; never
// generic "Lorem ipsum"-style filler) so the demo reads like a believable
// client, not an obviously synthetic test fixture.
export const DEMO_BRAND = {
  businessName: "Larkspur Coffee Roasters",
  brandVoice:
    "Warm, specific, and a little poetic about coffee without being precious about it. " +
    "We talk about the farmers and the roast, not just the product. Short sentences. " +
    "Never corporate, never hypey — think a trusted neighborhood roaster, not a chain.",
};

export interface DemoHeadingBlock {
  type: "heading";
  content: string;
  level: 2 | 3 | 4;
}
export interface DemoParagraphBlock {
  type: "paragraph";
  content: string;
  style?: "blockquote";
}
export interface DemoCtaBlock {
  type: "cta";
  content: string;
  href: string;
}
// `colorKey` picks which generated placeholder image this block uses
// (see placeholderImage.ts) — `altText: null` is how a page deliberately
// ships an image with missing alt text (task item 1's "2 pages with images
// missing alt text"), not an oversight.
export interface DemoImageBlock {
  type: "image";
  altText: string | null;
  colorKey: "roast" | "latte" | "bean" | "awning" | "harvest" | "pourover";
}
export type DemoBlockDefinition =
  DemoHeadingBlock | DemoParagraphBlock | DemoCtaBlock | DemoImageBlock;

// On-brand-ish color pairs, one per `colorKey` used below — a few pages
// deliberately reuse the same key (e.g. "roast" appears on both the home
// page and the sustainability page), matching how a real small business
// reuses its own photography across pages rather than commissioning a new
// shot for every single one. See placeholderImage.ts for how these become
// actual generated PNGs.
//
// One important constraint this reuse runs into: WordPress tracks
// alt-text-review status *per attachment*, not per page-usage (SPEC.md's own
// wordpressAdapter.ts note on `resolveImageAltStatuses`) — two pages sharing
// one colorKey/attachment can't have conflicting alt-text intentions for it.
// "pourover" exists as its own key, not reusing "latte," specifically so the
// one deliberately-missing-alt-text image on demo-pour-over-guide can't
// collide with demo-about's deliberately-reviewed "latte" image.
export const DEMO_IMAGE_COLORS: Record<
  DemoImageBlock["colorKey"],
  { title: string; color: PlaceholderColor; stripeColor: PlaceholderColor }
> = {
  roast: {
    title: "Demo: Roast Bag Hero",
    color: { r: 74, g: 55, b: 40 },
    stripeColor: { r: 201, g: 162, b: 108 },
  },
  latte: {
    title: "Demo: Latte and Team",
    color: { r: 92, g: 64, b: 51 },
    stripeColor: { r: 230, g: 215, b: 189 },
  },
  bean: {
    title: "Demo: Subscription Bags",
    color: { r: 59, g: 42, b: 35 },
    stripeColor: { r: 176, g: 137, b: 104 },
  },
  awning: {
    title: "Demo: Café Awning",
    color: { r: 47, g: 67, b: 62 },
    stripeColor: { r: 222, g: 198, b: 150 },
  },
  harvest: {
    title: "Demo: Coffee Harvest",
    color: { r: 67, g: 82, b: 48 },
    stripeColor: { r: 214, g: 178, b: 94 },
  },
  pourover: {
    title: "Demo: Pour-Over Setup",
    color: { r: 54, g: 46, b: 38 },
    stripeColor: { r: 190, g: 150, b: 112 },
  },
};

export interface DemoFaqDefinition {
  question: string;
  answer: string;
}

export interface DemoPageDefinition {
  // Always prefixed `demo-` — the one thing that both makes these safe to
  // find/re-converge on idempotently (look up by slug) and keeps them
  // trivially distinguishable from any other content already on the target
  // WordPress site (SPEC.md §36 — this staging site already has a couple of
  // unrelated pages from earlier development testing that must never be
  // touched by this script).
  slug: string;
  title: string;
  metaDescription: string;
  targetKeyword?: string;
  pageType: PageType;
  status: PageStatus;
  blocks: DemoBlockDefinition[];
  faqs?: DemoFaqDefinition[];
}

// Ten pages, deliberately varied (task item 1):
//   - 3 score well: demo-home, demo-about, demo-coffee-subscription
//   - 4 with obvious SEO problems, each a different problem:
//       demo-wholesale (no meta description, no target keyword)
//       demo-single-origin-beans (weak/generic title, thin content, no FAQs)
//       demo-sourcing-story (skipped heading level, H2 -> H4)
//       demo-pour-over-guide (no target keyword)
//   - 2 with an image missing alt text: demo-wholesale, demo-pour-over-guide
//   - 2 with no FAQs: demo-single-origin-beans, demo-holiday-gift-sets
//   - all 4 statuses represented: demo-single-origin-beans (draft),
//     demo-wholesale (in-review), demo-coffee-subscription (approved),
//     everything else published
export const DEMO_PAGES: DemoPageDefinition[] = [
  {
    slug: "demo-home",
    title: "Larkspur Coffee Roasters | Small-Batch Coffee, Roasted Weekly",
    metaDescription:
      "Larkspur Coffee Roasters roasts small batches of specialty coffee every week and ships it " +
      "within days of roasting. Explore our single-origin beans and subscriptions.",
    targetKeyword: "small-batch coffee roaster",
    pageType: "landing",
    status: "published",
    blocks: [
      {
        type: "heading",
        level: 2,
        content: "Coffee roasted in small batches, shipped within days",
      },
      {
        type: "paragraph",
        content:
          "Larkspur Coffee Roasters started in a converted garage with one drum roaster and a " +
          "conviction that coffee tastes better the less time it spends sitting around. Every bag we " +
          "roast goes out within a week — most within three days.",
      },
      {
        type: "image",
        altText:
          "A bag of Larkspur Coffee Roasters beans next to a steaming cup of coffee",
        colorKey: "roast",
      },
      {
        type: "heading",
        level: 3,
        content: "What makes small-batch roasting different",
      },
      {
        type: "paragraph",
        content:
          "We roast 20 pounds at a time, not 2,000. That means we can taste-test every batch, adjust " +
          "the profile on the fly, and never let a bag sit in a warehouse losing flavor before it " +
          "reaches you.",
      },
      { type: "heading", level: 3, content: "Sourced directly, paid fairly" },
      {
        type: "paragraph",
        content:
          "We buy directly from the farms we roast, not through a commodity exchange. That means " +
          "better prices for the people growing the coffee, and a lot more for us to tell you about " +
          "where your cup came from.",
      },
      {
        type: "cta",
        content: "Shop our coffee",
        href: "/demo-coffee-subscription",
      },
    ],
    faqs: [
      {
        question: "How fresh is the coffee when it ships?",
        answer:
          "Every bag ships within three days of roasting, and we print the roast date right on the label.",
      },
      {
        question: "Do you roast decaf?",
        answer:
          "Yes — our Swiss Water Process decaf is roasted every other week in the same small batches as everything else.",
      },
      {
        question: "Where do you ship?",
        answer:
          "Currently the continental US. We're working on expanding — join our newsletter for updates.",
      },
    ],
  },
  {
    slug: "demo-about",
    title: "Our Story | Larkspur Coffee Roasters",
    metaDescription:
      "How a converted garage and one drum roaster became Larkspur Coffee Roasters — our story, " +
      "our roasting philosophy, and the team behind every bag.",
    targetKeyword: "specialty coffee roaster story",
    pageType: "other",
    status: "published",
    blocks: [
      {
        type: "heading",
        level: 2,
        content: "From one drum roaster to a neighborhood fixture",
      },
      {
        type: "paragraph",
        content:
          "Larkspur Coffee Roasters opened in 2018, named for the street our first roastery sat on. " +
          "We started with a single 5-kilo drum roaster and a folding table for a tasting bar. Six " +
          "years later, the roaster's bigger, but the table's still there.",
      },
      {
        type: "image",
        altText:
          "The Larkspur team cupping and tasting a fresh batch of coffee",
        colorKey: "latte",
      },
      { type: "heading", level: 3, content: "Our roasting philosophy" },
      {
        type: "paragraph",
        content:
          "We roast to bring out what's already in the bean, not to cover it up. That means lighter " +
          "roasts than a lot of shops are used to, and a cupping session before every batch ships to " +
          "make sure it tastes like what we intended.",
      },
      {
        type: "paragraph",
        style: "blockquote",
        content:
          "“We're not trying to make every coffee taste the same. We're trying to make each one taste like itself.” — Priya, head roaster",
      },
      { type: "heading", level: 3, content: "Still a small team" },
      {
        type: "paragraph",
        content:
          "Five of us roast, pack, and ship every order by hand. If you call the shop, one of us " +
          "picks up — there's no call center, because there's no need for one yet.",
      },
    ],
    faqs: [
      {
        question: "Do you have a physical café?",
        answer:
          "Yes, our original roastery on Larkspur Street has a small tasting bar open Thursday through Sunday.",
      },
      {
        question: "Can I tour the roastery?",
        answer:
          "We run a free roastery tour on the first Saturday of every month — sign up on our contact page.",
      },
    ],
  },
  {
    slug: "demo-coffee-subscription",
    title: "Monthly Coffee Subscription | Larkspur Coffee Roasters",
    metaDescription:
      "A new single-origin coffee delivered monthly, roasted within three days of shipping. Pause, " +
      "swap, or cancel anytime — no contracts.",
    targetKeyword: "coffee subscription",
    pageType: "service",
    status: "approved",
    blocks: [
      {
        type: "heading",
        level: 2,
        content: "A new coffee, every month, roasted to order",
      },
      {
        type: "paragraph",
        content:
          "Our subscription isn't the same bag on repeat. Every month we pick one single-origin lot " +
          "we're excited about, roast it fresh, and ship it a few days before it arrives — timed so " +
          "it lands right as your last bag runs low.",
      },
      {
        type: "image",
        altText:
          "Three bags of Larkspur Coffee Roasters subscription coffee lined up on a shelf",
        colorKey: "bean",
      },
      { type: "heading", level: 3, content: "How it works" },
      {
        type: "paragraph",
        content:
          "Pick whole bean or ground, pick your grind size if it's ground, and pick how often you want " +
          "a bag — every two, three, or four weeks. Change any of it, pause a month, or cancel, right " +
          "from your account. No phone call required.",
      },
      {
        type: "heading",
        level: 3,
        content: "What you get with every shipment",
      },
      {
        type: "paragraph",
        content:
          "Every bag comes with a card describing that month's farm, altitude, and processing method, " +
          "plus brewing notes tuned to that specific coffee — not generic advice that applies to " +
          "everything.",
      },
      {
        type: "cta",
        content: "Start your subscription",
        href: "/demo-coffee-subscription",
      },
    ],
    faqs: [
      {
        question: "Can I skip a month?",
        answer: "Yes, anytime, from your account page — no need to contact us.",
      },
      {
        question: "What if I don't like a particular coffee?",
        answer:
          "Let us know within two weeks of delivery and we'll credit that bag toward your next shipment.",
      },
      {
        question: "Is there a minimum commitment?",
        answer:
          "No contracts — cancel anytime, effective on your next scheduled shipment.",
      },
    ],
  },
  {
    // SEO problem: no meta description, no target keyword. Also carries the
    // first of the task's two "image missing alt text" pages.
    slug: "demo-wholesale",
    title: "Wholesale Coffee for Cafés & Offices",
    metaDescription: "",
    pageType: "service",
    status: "in-review",
    blocks: [
      {
        type: "heading",
        level: 2,
        content: "Wholesale coffee for your café, office, or shop",
      },
      {
        type: "paragraph",
        content:
          "We work with about a dozen local cafés and a handful of offices who want the same " +
          "small-batch coffee we sell direct, in larger quantities and on a schedule that works for a " +
          "business, not just a household.",
      },
      { type: "image", altText: null, colorKey: "awning" },
      { type: "heading", level: 3, content: "What wholesale accounts get" },
      {
        type: "paragraph",
        content:
          "Volume pricing, a dedicated contact instead of a general support line, and roast dates " +
          "scheduled around your delivery day so coffee never sits in your stockroom longer than it " +
          "has to.",
      },
      {
        type: "cta",
        content: "Ask about wholesale pricing",
        href: "/demo-contact",
      },
    ],
    faqs: [
      {
        question: "What's the minimum order for a wholesale account?",
        answer:
          "20 pounds per order — we can usually accommodate smaller test orders for a new account's first month.",
      },
    ],
  },
  {
    // SEO problem: weak/generic title, thin content, no FAQs. Also the
    // draft-status example.
    slug: "demo-single-origin-beans",
    title: "Beans",
    metaDescription: "Information about our beans.",
    pageType: "service",
    status: "draft",
    blocks: [
      { type: "heading", level: 2, content: "Beans" },
      {
        type: "paragraph",
        content: "We sell single-origin beans. They come from different farms.",
      },
    ],
  },
  {
    // SEO problem: a heading jumps from H2 straight to H4, skipping H3.
    slug: "demo-sourcing-story",
    title: "How We Source Our Beans Directly From Farmers",
    metaDescription:
      "A look at how Larkspur Coffee Roasters buys directly from farms in Colombia and Ethiopia, " +
      "and why that matters for both the coffee and the people growing it.",
    targetKeyword: "direct trade coffee sourcing",
    pageType: "blog",
    status: "published",
    blocks: [
      {
        type: "heading",
        level: 2,
        content: "Why we skip the commodity market entirely",
      },
      {
        type: "paragraph",
        content:
          "Most coffee changes hands two or three times between the farm and the roaster, with the " +
          "price set by a commodity exchange that has nothing to do with the quality of any specific " +
          "lot. We buy direct instead, which means we negotiate price with the farm, every season.",
      },
      // Deliberate heading-level skip (H2 -> H4, no H3) — a real, flagged
      // SEO problem (src/lib/seo's headingHierarchy check), not a typo.
      {
        type: "heading",
        level: 4,
        content: "What this means for the farms we work with",
      },
      {
        type: "paragraph",
        content:
          "Two of the farms we've bought from since 2019 have used the price stability to replant " +
          "aging trees with higher-yield varietals — a bet they told us they couldn't have made " +
          "selling through a broker at commodity price.",
      },
      {
        type: "image",
        altText: "A coffee farmer sorting freshly picked cherries by hand",
        colorKey: "harvest",
      },
    ],
    faqs: [
      {
        question: "Which farms do you buy from?",
        answer:
          "Currently two farms in Huila, Colombia and one cooperative in Yirgacheffe, Ethiopia — we publish the current list on each coffee's product page.",
      },
    ],
  },
  {
    // SEO problem: no target keyword set. Also the second "image missing
    // alt text" page.
    slug: "demo-pour-over-guide",
    title: "A Pour-Over Brewing Guide for Beginners",
    metaDescription:
      "A simple, no-equipment-snobbery guide to brewing a great cup of pour-over coffee at home, " +
      "from a roaster who brews this way every single morning.",
    pageType: "blog",
    status: "published",
    blocks: [
      {
        type: "heading",
        level: 2,
        content: "You don't need fancy equipment to brew a great cup",
      },
      {
        type: "paragraph",
        content:
          "A $15 dripper, a kettle, and a scale will get you 90% of the way to a great cup of pour-over. " +
          "Everything past that is personal preference, not a requirement.",
      },
      { type: "image", altText: null, colorKey: "pourover" },
      { type: "heading", level: 3, content: "The basic ratio" },
      {
        type: "paragraph",
        content:
          "Start at 1 gram of coffee to 16 grams of water, medium-fine grind, water just off the boil. " +
          "Adjust from there — more coffee if it tastes thin, a coarser grind if it tastes bitter.",
      },
      { type: "heading", level: 3, content: "Bloom first, always" },
      {
        type: "paragraph",
        content:
          "Pour just enough water to wet the grounds, wait 30 seconds, then pour the rest in slow, " +
          "steady circles. That first 30-second bloom releases trapped CO2 that otherwise makes the " +
          "coffee taste flat.",
      },
    ],
    faqs: [
      {
        question: "What grind size should I use?",
        answer:
          "Medium-fine — similar to table salt. Most grocery store pre-ground coffee is too coarse for pour-over.",
      },
      {
        question: "Does water temperature actually matter?",
        answer:
          "Yes — boiling water can scorch the grounds. Let it sit off the boil for 30 seconds before pouring.",
      },
    ],
  },
  {
    // SEO problem: thin content, no FAQs.
    slug: "demo-holiday-gift-sets",
    title: "Give the Gift of Great Coffee This Holiday Season",
    metaDescription:
      "Larkspur Coffee Roasters holiday gift sets — three single-origin coffees, a tasting card, " +
      "and a reusable canvas bag, ready to ship.",
    targetKeyword: "coffee gift set",
    pageType: "landing",
    status: "published",
    blocks: [
      { type: "heading", level: 2, content: "Our holiday gift set is back" },
      {
        type: "paragraph",
        content:
          "Three single-origin coffees, a tasting card, and a canvas tote, all for $42. Ships in a box " +
          "that doesn't need to be wrapped.",
      },
      { type: "cta", content: "Order a gift set", href: "/demo-contact" },
    ],
  },
  {
    slug: "demo-sustainability",
    title: "Our Commitment to Sustainable Sourcing | Larkspur Coffee Roasters",
    metaDescription:
      "How Larkspur Coffee Roasters approaches sustainability — direct trade pricing, compostable " +
      "packaging, and a local composting program for spent grounds.",
    targetKeyword: "sustainable coffee roaster",
    pageType: "other",
    status: "published",
    blocks: [
      {
        type: "heading",
        level: 2,
        content: "Sustainability, beyond the marketing word",
      },
      {
        type: "paragraph",
        content:
          "We think “sustainable” gets used as a sticker more often than it gets used as a " +
          "practice. Here's specifically what we do, and what we're still working on.",
      },
      {
        type: "image",
        altText:
          "Compostable Larkspur Coffee Roasters packaging next to a pile of spent coffee grounds",
        colorKey: "roast",
      },
      { type: "heading", level: 3, content: "Packaging" },
      {
        type: "paragraph",
        content:
          "Every bag is compostable, not just recyclable — we switched in 2022 after too many " +
          "customers told us they couldn't tell the difference from a recycling symbol alone.",
      },
      { type: "heading", level: 3, content: "Spent grounds" },
      {
        type: "paragraph",
        content:
          "Our café collects spent grounds for a local composting program instead of sending them to " +
          "landfill — about 400 pounds a month, picked up weekly.",
      },
    ],
    faqs: [
      {
        question: "Is the packaging actually compostable, or just recyclable?",
        answer:
          "Fully home-compostable, including the zipper — certified, not just “made from recycled materials.”",
      },
    ],
  },
  {
    slug: "demo-contact",
    title: "Contact Larkspur Coffee Roasters",
    metaDescription:
      "Get in touch with Larkspur Coffee Roasters — wholesale inquiries, roastery tours, or just to say hi.",
    targetKeyword: "contact Larkspur Coffee Roasters",
    pageType: "other",
    status: "published",
    blocks: [
      { type: "heading", level: 2, content: "Say hello" },
      {
        type: "paragraph",
        content:
          "For wholesale inquiries, roastery tours, or anything else, email hello@larkspur.example or " +
          "stop by the roastery Thursday through Sunday, 8am to 3pm.",
      },
      {
        type: "cta",
        content: "Ask about wholesale pricing",
        href: "/demo-wholesale",
      },
    ],
  },
];
