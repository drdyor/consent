# Aegis AI governance method

**Purpose.** This document records the Aegis controls available in the current build and the conditions for any later AI integration. It is an operational governance method, not legal advice, an AI Act classification, a clinical-safety assessment, or a statement of compliance.

## Current implementation status

| Capability | Current state | Boundary |
|---|---|---|
| Model or agent invocation | **Not implemented** | No screen, router, provider adapter, or background process invokes an AI model. |
| Personal preference | **Implemented, default off** | Each user may opt in only after acknowledging the human-approval and non-clinical boundary; opt-out blocks later assistance-record operations for that user. |
| Provider configuration record | **Implemented, no connection** | Clinic administrators may record a disabled, approved, or draft configuration as **local OpenAI-compatible**, **clinic-managed endpoint**, or **approved cloud**. The record contains only documentation/data-region metadata and a server-side secret *reference label*, never a credential. |
| Assistance evidence | **Implemented, metadata-only contract** | The ledger accepts only hashes of inputs/outputs, an approved provider reference, model identifier, and a narrowly enumerated non-clinical purpose. It does not accept raw prompts, outputs, patient facts, images, guideline text, medication lists, or credentials. |
| Human decision | **Implemented as append-only event** | A named user may append one approval or rejection with a reason to an assistance event. The original entry is not updated. |
| Hash chain | **Implemented** | Each AI decision event records the preceding entry hash and a SHA-256 entry hash over a canonical event payload. The dedicated chain follows the same tamper-evident design principle as the internally reviewed DMCA audit-chain pattern; that internal pattern is not a legal authority. |

## Permitted and prohibited purposes

The only assistance purposes represented by the current metadata contract are administrative drafting, source-governance drafting, procurement suggestion, and other explicitly defined **non-clinical** work. Recording metadata is not approval to use an AI system for any particular task.

> **Aegis must not use AI to diagnose, infer health status, interpret images or clinical guidance, provide patient-specific advice, recommend treatment or referral, generate clinical consent wording, sign a consent, select/substitute a product, submit a supplier order, approve a payment, or act autonomously.**

Clinic remains responsible for clinical relevance, patient-state handling, guideline interpretation, clinical decisions, referrals, and any legal/regulatory assessment. Aegis remains responsible only for governed consent/evidence/operational records within its documented boundary.

## Operating method for a future adapter

Before a future adapter can be activated, an authorised clinic operator must document the intended purpose, model/provider, data-region and processing terms, approved server-side secret configuration, allowed data fields, source/rights position, security assessment, role responsibilities, human-decision step, retention/deletion plan, and rollback/incident process. A separate technical change must implement the adapter; changing a provider record to “approved” **does not connect or authorize an AI model**.

All future requests must honour the invoking user’s current opt-in state at the point of action, use data minimisation, prohibit clinical data unless a separately assessed scope permits it, and create a hash-only assistance event followed by a named human decision. An integration must fail closed when the preference is off, the provider is unapproved, the purpose is outside the contract, or logging cannot be completed.

## Transparency and regulatory review context

The European Commission describes the AI Act as a risk-based framework and lists logging, documentation, deployer information, human oversight, robustness, cybersecurity and accuracy among high-risk obligations.[1] The AI Act Service Desk’s non-binding Article 14 summary explains that human oversight for high-risk systems should allow monitoring, interpretation and override in proportion to the risk, autonomy and use context.[2]

Accordingly, Aegis intentionally uses personal default-off controls, purpose limitation, provider records, tamper-evident evidence, and a separate human decision. These controls **support review**. They do not decide whether a particular future feature is an AI system, high-risk, regulated software, clinically safe, or compliant. Qualified legal, privacy, clinical, security, and product-regulatory review remains necessary for each intended use.

An AWS post located during design review is retained as a vendor reference only. It similarly says customers must assess their own AI activities and implement controls; it does not certify Aegis or replace official guidance.[3]

## References

[1] [European Commission, *Regulatory framework for AI*](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)

[2] [AI Act Service Desk, *Article 14: Human oversight*](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14)

[3] [AWS Machine Learning Blog, *Building trust in AI: The AWS approach to the EU AI Act*](https://aws.amazon.com/blogs/machine-learning/building-trust-in-ai-the-aws-approach-to-the-eu-ai-act/)
