# Evidence topics

> Read by the skills when they brief `evidence-scout` agents. Each topic has a question it must
> answer, where to look, and an optional third-party skill that can give the work structure.
> Third-party skills are accelerators, never requirements: if the named skill is not available
> in the session, follow the built-in method below. Never stop because a skill is missing.

Every brief names the decision question and the intake ids, so the worker can fill `bears_on`.

## prior-art (mandatory, always first)

**Question:** Does something already do this, or did something try and fail? Who would the user
pick instead of us today?

**Where to look, in this order:**
1. App stores: the iTunes Search API (name the country), the Google Play search page.
2. GitHub and package registries: search the core noun phrases; read the README of anything with
   recent commits. A dataset's or protocol's own maintainers often ship the obvious app.
3. The obvious incumbents' own tools: the platform the idea sits on (its docs, settings, help
   center) often already has the feature, or explains why it does not.
4. Launch and community sites: Product Hunt, Hacker News, Reddit and niche forums, for launches,
   shutdowns ("we are shutting down"), and "I wish there was an app that ..." posts.

**Record:** each close substitute (what it does, price, last update, store rating count if
shown), each dead attempt (when, stated reason), and the closest working analogue in another
domain if nothing direct exists. Mark `bears_on` with the options a substitute makes pointless.

**Optional skill:** `competitor-analysis` (pm-skills). Use it to structure the comparison; still
write records with quotes and URLs.

## demand

**Question:** Do the people in the intake have this problem often and badly enough to change
what they do? What do they use now, and what does that cost them?

**Where to look:** reviews of the substitutes found in prior-art (1-3 star reviews name the gap),
Reddit and niche forums (search the problem, not the product), support forums of the incumbents,
public search-interest tools when reachable.

**Record:** observations with counts and their denominator ("9 of the 40 most recent 1-star
reviews of X mention blurry uploads"), workarounds people describe, and any public evidence of
paying for a workaround. A single viral post is `low` confidence.

**Optional skill:** `customer-research` (marketingskills).

## mechanism

**Question:** Does the one mechanism the product rests on actually work? (Examples: a technical
effect, a behaviour change, a data source being complete enough, a platform allowing the
integration.)

**Where to look:** primary technical sources: the platform's own documentation and engineering
blog, standards, the dataset's documentation, published measurements. Forums are leads only.

**Record:** what is documented, what is only folklore, and what nobody has measured. A missing
measurement is a `gap`, and it usually becomes the cheapest experiment in the memo.

## market-and-channels

**Question:** How many of the target users exist, and where can this founder reach the first
hundred of them?

**Where to look:** government and industry statistics, the communities named in demand (with
their member counts as shown on the page), newsletters and creators the users follow, the
founder's own channels from intake.

**Record:** sizes as `estimate` with `derived_from`, channel sizes as `observation` with the
date shown. Report-mill market sizes are `low` confidence; say so rather than dropping them.

**Optional skill:** `market-sizing` or `beachhead-segment` (pm-skills).

## pricing (when the decision involves money)

**Question:** What do the substitutes charge, and is there public evidence people pay for this
kind of product?

**Where to look:** substitute pricing pages and store in-app purchase lists, revenue estimates
the vendors publish themselves, public statements in founder interviews.

## A topic the user asks for

When the user names a topic ("look into the licensing", "what does the regulator say"), write a
one-line question for it in the same shape as above, pick the two most primary places to look,
and brief one scout on it. Name the file after the topic in kebab-case.
