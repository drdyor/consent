/**
 * Starter template library: dental consent templates a fresh clinic can import.
 *
 * Templates are CONTENT, not law. Every import lands as a DRAFT copy owned by
 * the importing clinic. A practitioner must review the wording and an
 * administrator must activate the template before it can be used. Nothing here
 * is presented as legally approved text.
 *
 * Wording rules (house style for client-facing text): plain language, no
 * idioms, sentences under 15 words.
 */

export type StarterTemplateSection = { id: string; title: string; body: string; required: boolean };

export type StarterTemplateLibraryEntry = {
  libraryKey: string;
  name: string;
  procedureKey: string;
  description: string;
  requiresProduct: boolean;
  language: "en";
  sections: StarterTemplateSection[];
};

export const STARTER_REVIEW_NOTICE =
  "Starter draft. A practitioner must review this text. An administrator must activate it before use. It is not legally approved wording.";

const decisionSection: StarterTemplateSection = {
  id: "decision",
  title: "Your decision",
  body: "You choose whether to have this treatment. You can ask questions at any time. You can withdraw this consent before the procedure starts. Withdrawing consent will not affect your other care.",
  required: true,
};

export const starterTemplateLibrary: StarterTemplateLibraryEntry[] = [
  {
    libraryKey: "dental-implant-placement",
    name: "Dental implant placement",
    procedureKey: "implant-placement",
    description: "Consent for placing a dental implant fixture. Product-linked: the implant system, lot, and expiry are recorded on each consent.",
    requiresProduct: true,
    language: "en",
    sections: [
      {
        id: "what-happens",
        title: "What this procedure involves",
        body: "A dental implant is a small screw placed in the jaw bone. It replaces the root of a missing tooth. The area is numbed with local anaesthetic. The gum is opened and the implant is placed in the bone. The gum is closed with stitches. Healing usually takes several months before the final tooth is fitted.",
        required: true,
      },
      {
        id: "risks",
        title: "Main risks",
        body: "Pain, swelling, and bruising are common for a few days. Infection can happen and may need treatment. The implant may fail to join with the bone. A failed implant may need removal. Nerve injury is rare and can cause numbness of the lip, chin, or tongue. Numbness is usually temporary but can be permanent. Implants in the upper jaw can involve the sinus.",
        required: true,
      },
      {
        id: "alternatives",
        title: "Other options",
        body: "You can choose a bridge, a denture, or no replacement. Your practitioner will explain what each option means for you.",
        required: true,
      },
      {
        id: "aftercare",
        title: "After the procedure",
        body: "Keep the area clean as instructed. Do not smoke during healing. Smoking raises the risk of implant failure. Attend your review appointments.",
        required: true,
      },
      {
        id: "source-disclosures",
        title: "Product and area disclosures",
        body: "The implant system used is recorded on this consent. Disclosures from its approved product document are shown with this form. The lot number and expiry date are recorded for traceability.",
        required: true,
      },
      decisionSection,
    ],
  },
  {
    libraryKey: "dental-implant-second-stage",
    name: "Implant second-stage surgery",
    procedureKey: "implant-second-stage",
    description: "Consent for exposing a healed implant and fitting a healing abutment. Product-linked: the component used is recorded on each consent.",
    requiresProduct: true,
    language: "en",
    sections: [
      {
        id: "what-happens",
        title: "What this procedure involves",
        body: "Your implant has been healing under the gum. In this procedure the gum over the implant is opened. A small healing post is attached to the implant. The gum heals around this post over the next weeks. This prepares the implant for the final tooth.",
        required: true,
      },
      {
        id: "risks",
        title: "Main risks",
        body: "Mild pain and swelling are common for a few days. Infection can happen and may need treatment. Rarely, the implant is found not to have healed into the bone. In that case the implant may need removal.",
        required: true,
      },
      {
        id: "source-disclosures",
        title: "Product and area disclosures",
        body: "The component used is recorded on this consent. Disclosures from its approved product document are shown with this form.",
        required: true,
      },
      decisionSection,
    ],
  },
  {
    libraryKey: "dental-perio-srp",
    name: "Periodontal maintenance / scaling and root planing",
    procedureKey: "perio-srp",
    description: "Consent for deep cleaning below the gum line. Procedure-only: no medicinal product or medical device is recorded.",
    requiresProduct: false,
    language: "en",
    sections: [
      {
        id: "what-happens",
        title: "What this procedure involves",
        body: "Gum disease causes deposits and bacteria under the gum line. This treatment cleans the root surfaces below the gum. Local anaesthetic may be used to keep you comfortable. Treatment may be done in one or more visits.",
        required: true,
      },
      {
        id: "risks",
        title: "Main risks",
        body: "Teeth can feel sensitive to cold for some weeks. Gums may shrink slightly as they heal. This can make teeth look longer. Some gum bleeding after treatment is normal. Gum disease can continue if daily cleaning is not maintained.",
        required: true,
      },
      {
        id: "no-product",
        title: "No product or device",
        body: "This is a procedure-only consent. No medicinal product or medical device is recorded for this treatment.",
        required: true,
      },
      decisionSection,
    ],
  },
  {
    libraryKey: "dental-extraction",
    name: "Tooth extraction",
    procedureKey: "tooth-extraction",
    description: "Consent for removing a tooth. Procedure-only: no medicinal product or medical device is recorded.",
    requiresProduct: false,
    language: "en",
    sections: [
      {
        id: "what-happens",
        title: "What this procedure involves",
        body: "The tooth and the area around it are numbed with local anaesthetic. The tooth is then loosened and removed. Sometimes the tooth must be removed in pieces. Sometimes a small cut in the gum is needed. Stitches may be placed.",
        required: true,
      },
      {
        id: "risks",
        title: "Main risks",
        body: "Pain, swelling, and bruising are common for a few days. Bleeding usually stops with pressure. The socket can become painful after a few days. This is called a dry socket and can be treated. Infection can happen and may need treatment. Nearby teeth or fillings can be damaged. Lower teeth close to a nerve carry a small risk of numbness. Numbness of the lip, chin, or tongue is usually temporary. Rarely it is permanent. Upper back teeth can involve the sinus.",
        required: true,
      },
      {
        id: "aftercare",
        title: "After the procedure",
        body: "Bite on the gauze as instructed. Do not rinse for the first day. Do not smoke while the socket heals. Contact the clinic if bleeding or pain gets worse.",
        required: true,
      },
      {
        id: "no-product",
        title: "No product or device",
        body: "This is a procedure-only consent. No medicinal product or medical device is recorded for this treatment.",
        required: true,
      },
      decisionSection,
    ],
  },
  {
    libraryKey: "dental-hygiene-recall",
    name: "Hygiene recall visit",
    procedureKey: "hygiene-recall",
    description: "Consent for a routine hygiene visit with scaling and polishing. Procedure-only: no medicinal product or medical device is recorded.",
    requiresProduct: false,
    language: "en",
    sections: [
      {
        id: "what-happens",
        title: "What this visit involves",
        body: "Your teeth and gums are examined. Deposits above the gum line are removed. Your teeth are polished. You receive advice on daily cleaning.",
        required: true,
      },
      {
        id: "risks",
        title: "Main risks",
        body: "Teeth can feel sensitive for a short time. Gums may bleed a little during cleaning. These effects usually settle within days.",
        required: true,
      },
      {
        id: "no-product",
        title: "No product or device",
        body: "This is a procedure-only consent. No medicinal product or medical device is recorded for this visit.",
        required: true,
      },
      decisionSection,
    ],
  },
];

export function findStarterTemplate(libraryKey: string): StarterTemplateLibraryEntry | undefined {
  return starterTemplateLibrary.find(entry => entry.libraryKey === libraryKey);
}
