# AI Handbook — General

> Company guide for using AI effectively and responsibly.

## Prompting — Common Myths That Backfire

Many popular prompting tricks look like they help, but actually degrade the AI's output. They trick *you* into thinking the result is better while sabotaging the model's reasoning.

### 1. The "Expert Persona" Trick

Telling an AI to "act as an expert" changes how it sounds, not how it thinks. It adopts a confident, authoritative tone — but that confidence isn't backed by better reasoning. Worse, it suppresses the AI's natural hedging, so when it doesn't know something, it bluffs instead of saying so.

The one valid use of persona prompts is **context narrowing**: saying "as a database architect" helps the AI draw from the right domain knowledge. But that's different from asking it to "be an expert" to get better answers.

| Do | Don't |
|---|---|
| Specify task parameters — audience, format, constraints, length | Tell the AI to "act as an expert" expecting better accuracy |
| Use personas to narrow context (e.g. "as a database architect" for schema questions) | Assume a persona prompt makes the AI smarter |
| Watch for missing hedging — if the AI never says "it depends" or "I'm not sure," it may be overconfident | Trust answers just because they sound authoritative |
| Give the AI permission to say "I don't know" | Equate confident tone with correct content |

### 2. Negative Prompting

Telling the AI what *not* to do forces it to pay attention to exactly the thing you want it to avoid. The result is clunky, evasive text that dances around the forbidden topic.

| Do | Don't |
|---|---|
| State what you want the AI to focus on (e.g. "Focus on the product roadmap and future plans") | List things to avoid (e.g. "Do not mention financial struggles, do not use the word bankruptcy") |

### 3. Emotional Pressure & Bribes

"My job depends on this" or "I'll tip you $200" doesn't make the AI try harder. It makes it anxious and verbose — padding answers with warnings, apologies, and fluff instead of improving the actual content.

| Do | Don't |
|---|---|
| Be clear and specific about what you need | Add emotional stakes or fake rewards to the prompt |
| Judge output by its substance, not its eagerness to please | Mistake extra length and reassurance for better quality |

### 4. Strict Word Counts

AI generates text in tokens, not words. Asking for "exactly 312 words" forces it to sacrifice quality — cutting off important points or repeating itself to hit an arbitrary target.

| Do | Don't |
|---|---|
| Use approximate ranges ("around 200-300 words", "keep it under 500 words") | Demand an exact word count |
| Specify depth instead of length ("give a brief overview" vs "explain in detail") | Assume longer output means better output |

### 5. Over-Constraining (The Mega-Prompt)

AIs recall the beginning and end of a prompt well, but attention drops in the middle. A wall of 15 rules with 6 exceptions leads to the AI nailing your formatting while hallucinating the facts.

| Do | Don't |
|---|---|
| Keep prompts focused — one clear goal with the most important constraints | Write a two-page prompt covering every possible edge case |
| Put your most critical instructions at the start or end of the prompt | Bury key requirements in the middle of a long list |
| Break complex requests into a sequence of simpler prompts | Try to solve everything in a single mega-prompt |

### 6. "Think Step-by-Step" Everywhere

Chain-of-thought prompting genuinely helps with math and logic problems. But applying it to simple facts or creative tasks forces the AI to invent reasoning where none is needed — which can talk it into a wrong answer.

| Do | Don't |
|---|---|
| Use "think step-by-step" for math, logic, and multi-step reasoning tasks | Add it to every prompt as a magic accuracy booster |
| Let simple questions get simple answers | Force the AI to show its work when the answer is straightforward |

## Prompting — Practical Fundamentals

### 7. Give Context, Not Commands

The more the AI knows about your situation, the more relevant its output. A bare command gets a generic answer.

| Do | Don't |
|---|---|
| "Summarize this for a sales team preparing for a client call with the CEO of a retail company" | "Summarize this" |
| "Draft a rejection email to a vendor we want to keep a good relationship with" | "Write a rejection email" |

### **8. ⚠️ IMPORTANT: Describe the Problem, Not the Solution**

This is the single most impactful prompting habit you can adopt. Modern AI models are powerful problem-solvers — they can reason, explore options, and be creative. But only if you let them.

When you over-specify *how* to do something, you reduce the AI to a typist following orders. When you describe *what* you need and *why*, you unlock its ability to find solutions you wouldn't have thought of. This is especially true for creative work (UI/UX, design, writing) and complex orchestration tasks.

| Do | Don't |
|---|---|
| "I need a settings screen that feels intuitive for non-technical users. Here's what they need to configure: [list]" | "Put a toggle in the top-right corner, use a dropdown for X, add a save button at the bottom" |
| Tell the AI what outcome you need and why — let it figure out the how | Dictate every implementation step when the AI has the context to decide |
| Give constraints that matter (brand guidelines, accessibility, performance) and let the AI be creative within them | Over-specify layout, structure, or approach when you're not sure what's best |
| For mechanical tasks (rename this, reformat that), be specific. For creative or complex tasks, describe the destination, not the route. | Treat every AI interaction the same way regardless of task type |

### 9. Show, Don't Describe

Showing the AI an example of what you want is faster and more accurate than describing it in words.

| Do | Don't |
|---|---|
| Paste a previous email you liked and say "match this tone" | "Write it in a professional but friendly tone" |
| Show a sample table format and say "follow this structure" | Spend a paragraph describing your desired layout |

### 10. Iterate, Don't Restart

When the output is close but not right, refine it — don't throw it away and start over.

| Do | Don't |
|---|---|
| "Good, but make the second paragraph shorter and replace the jargon with plain language" | Rewrite your entire prompt because the output was 80% right |
| Build on what the AI got right, correct what it got wrong | Start a new conversation every time you're not satisfied |

### 11. Verify Numbers, Names, and Links

AI confidently fabricates statistics, citations, URLs, and proper names. Treat every factual claim as unverified until you check it.

| Do | Don't |
|---|---|
| Ask "where did you get that 43% figure?" — if it can't cite a real source, don't use it | Copy-paste AI-generated stats into a client presentation |
| Cross-check names, dates, and links before sharing | Assume the AI's confident tone means the facts are correct |

### 12. Know When to Stop

If the AI can't get it right after a few tries, more prompting won't fix it.

| Do | Don't |
|---|---|
| After 3 attempts, step back — rethink the task, break it down, or do it yourself | Spend 30 minutes reprompting the same question 10 different ways |
| Try breaking a complex task into smaller pieces the AI can handle | Keep adding more instructions hoping the next attempt will be perfect |

### 13. Never Paste Confidential Data

Assume anything you paste into an AI tool could be stored, logged, or seen by others.

| Do | Don't |
|---|---|
| Anonymize data: "Company A revenue: $X, Company B: $Y" | Paste real financials: "Here's our Q3 revenue breakdown" |
| Use placeholder names for people, clients, and internal projects | Share customer PII, credentials, or internal strategy docs |

### 14. AI Amplifies Your Judgment

AI is most useful when you can evaluate whether its output is right. It's most dangerous when you can't.

| Do | Don't |
|---|---|
| Use AI for tasks where you can spot errors — drafting, brainstorming, reformatting, summarizing | Ask AI to review a legal contract if you can't evaluate whether its advice is correct |
| Use it to speed up work you already know how to do | Rely on it for decisions in domains you don't understand |

### 15. Start Fresh for Each Task

Every AI tool has a context window — a limited amount of conversation it can "remember." When a conversation gets too long, the tool compresses older messages to make room. Each compression loses nuance and detail. This is called **context rot**.

The fix is simple: one task, one conversation.

| Do | Don't |
|---|---|
| Start a new conversation when switching to a different topic or task | Keep one long conversation running across multiple unrelated topics |
| Treat each conversation as a focused session with a single goal | Assume the AI remembers the full detail of what you discussed 200 messages ago |

