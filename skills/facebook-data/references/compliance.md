# Compliance Reference

Not legal advice. These are the constraints that actually determine whether a Facebook data project is defensible, and they are the ones marketers most often discover too late.

Two separate regimes apply, and satisfying one does not satisfy the other:

1. **Meta's Terms of Service** — a contract question between the user and Meta.
2. **Data protection law** (GDPR, POPIA, CCPA and equivalents) — a statutory question about the people whose data was collected.

Route A (Graph API on your own properties) clears both cleanly. Route C (third-party scraping) clears neither automatically.

## Meta's Terms

Meta's Terms prohibit automated collection without prior written permission. This applies to publicly visible content — visibility is not consent, and logged-out accessibility is not a licence.

Meta enforces. It has pursued scraping operations through litigation and account action, and the pattern of enforcement favours scale: a researcher pulling a few hundred public posts is in different territory from an operation harvesting millions, even though both breach the same clause.

Realistic consequences, roughly in order of likelihood:

- IP or account blocking (routine, often immediate)
- App and Business Manager access revoked — **this is the one that hurts**, because it can take the user's ad account and Page management with it
- Cease and desist
- Litigation (rare, reserved for commercial-scale operations)

**The asymmetry worth naming for the user:** if they run ads or manage Pages through the same Business Manager, scraping risks the account that runs their actual marketing. The scraped data is rarely worth that exposure. This alone often redirects people to Route A or B once they hear it.

## Personal Data

A Facebook post carries a name, a profile link and often a photo. That is personal data under GDPR, POPIA and most equivalents, **regardless of whether it was public**. Public availability is not a lawful basis for processing.

If the user is in or targeting the EU/UK (GDPR) or South Africa (POPIA), they need:

- **A lawful basis.** Legitimate interest is the usual candidate for market research; it requires a documented balancing test weighing the business need against the individual's reasonable expectations. Someone posting in a hobby Group does not expect to land in a commercial database.
- **Transparency.** Articles 13–14 GDPR require notifying people their data is processed, including when collected indirectly. There is a disproportionate-effort exemption for research, but it must be assessed, not assumed.
- **Data subject rights.** Access, rectification, erasure. If the user cannot locate and delete one person's records on request, the pipeline is not compliant.
- **Purpose limitation.** Data collected for sentiment analysis cannot later be repurposed for ad targeting without revisiting the basis.
- **Retention limits.** "Indefinitely, in a warehouse" is not a retention policy.

POPIA adds an Information Officer registration requirement for South African responsible parties, and its special-personal-information rules are stricter than GDPR's in places.

## Special Categories — Never Collect

Never collect, infer, derive or store:

- Health conditions, including inferred from Group membership
- Financial hardship or distress
- Political opinions or affiliation
- Religious or philosophical belief
- Sexual orientation or gender identity
- Race or ethnic origin
- Trade union membership
- Criminal history
- Biometric data, including face data from profile photos

**Group membership is the live trap.** Scraping a Group whose subject is a health condition, a faith, a political cause or a recovery community means every member record is special-category data by inference, whatever fields you actually stored. The Group topic alone can make an otherwise routine pull unlawful.

If the research question genuinely requires one of these categories, that is an explicit-consent-or-stop situation, not a minimization problem.

## Minimization in Practice

The cheapest compliance measure is collecting less and keeping it briefly.

| Instead of | Do this |
|---|---|
| Storing every field the endpoint returns | Select only fields the analysis consumes |
| Keeping commenter names for a theme count | Aggregate to counts, drop identities |
| Retaining raw scrapes indefinitely | Delete raw rows once aggregated; keep the aggregate |
| Quoting individuals by name in a deck | Paraphrase, or anonymize to "a user in [Group type]" |
| Building a per-person posting history | Don't — see below |

**Aggregate early, delete raw.** The raw scrape is the liability; the derived themes and counts are the asset. Most projects need the raw data for hours, not months.

**Name businesses, anonymize people.** A company's official Page speaking publicly can be quoted and attributed. A private individual in a Group should be paraphrased. This single rule resolves most deliverable-level risk.

## Hard Lines

Never, regardless of the business case:

- **Private, closed or secret Groups.** Membership is an access control. Content behind it is not public, whatever the join policy — and joining under false pretences to collect data compounds the problem.
- **Fake, burner or purchased accounts** to gain access or extend reach.
- **Credential sharing**, or using someone's session to read what requires their login.
- **Detection evasion** — proxy rotation, CAPTCHA solving, fingerprint spoofing or rate-limit circumvention. Framing it as "reliability engineering" doesn't change what it is.
- **Individual dossiers** — compiling a person's posting history, affiliations or network into a profile.
- **Reselling or redistributing** scraped personal data.
- **Targeting a competitor's customers individually** from scraped engagement.

When a request needs one of these, say so plainly, once, and offer the nearest legitimate alternative: Route A on the user's own properties, Page Public Content Access for the specific Pages they care about, or a smaller honest sample that answers the same question.

## Decision Checklist

Before any Route C pull:

- [ ] Is this available free via Graph API on a property the user owns?
- [ ] Would Page Public Content Access cover it on an acceptable timeline?
- [ ] Is every target Group or Page genuinely public?
- [ ] Does the Group topic imply special-category data?
- [ ] Which specific fields does the analysis need — and can the rest be dropped at ingestion?
- [ ] What is the deletion date, and what enforces it?
- [ ] Does the user run ads or manage Pages through a Business Manager that account action would disrupt?
- [ ] Has the user been told, once and clearly, that this is outside Meta's Terms?

If the last box isn't ticked, tick it before running anything. Then respect the answer — an informed user choosing to proceed on a public-data pull has made a legitimate business decision, and relitigating it every turn helps nobody.

## When to Escalate to Counsel

Recommend actual legal review when:

- The pull is ongoing and large-scale rather than a one-off sample
- Data feeds a product or is redistributed to customers
- EU/UK data subjects are involved at meaningful volume
- Any special category is plausibly implicated
- The user is regulated (health, finance, children's services)
- The output drives automated decisions about individuals

For a one-off sample of a few hundred public business-Page posts, aggregated and deleted, proportionate care is enough. Scale, persistence, redistribution and sensitivity are what move a project from routine into territory where a lawyer should look.
