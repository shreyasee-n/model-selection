# PoC: Assisted Model Selection

## Executive Summary

Customers using X have a wide choice of LLMs, but that choice creates **Model FOMO**: for a given task, they are unsure whether they selected the right model.

The PoC reduces that uncertainty by making model selection more transparent. The user first describes what they want to accomplish. X then presents candidate models that fit the request together with the information relevant to choosing between them: estimated cost and latency, context capacity, capabilities, historical selection among similar workloads, and, for multi-step agentic requests, the proposed plan. The user chooses the model to execute. After the task completes, lightweight feedback captures whether the result worked for them.

The PoC is deliberately designed to work for both conventional generation and agentic workloads. It also instruments the initial choice, post-task feedback, and future model retention, creating the behavioral data needed to determine whether model selection can eventually be automated.

---

## 1. User Experience

The user starts with a blank prompt/task input rather than a model catalog. Once the request is entered, X identifies a set of candidate models that can support the request and presents their relevant tradeoffs.

```text
┌─────────────────────────────────────────────────────────────┐
│ What would you like to do?                                  │
│                                                             │
│ Analyze this 50-page contract and summarize the risks.      │
│                                                             │
│                         [ Continue ]                         │
└─────────────────────────────────────────────────────────────┘

                 Models that fit this request

┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ Model A         │ │ Model B         │ │ Model C         │
│                 │ │                 │ │                 │
│ Context: 128K   │ │ Context: 200K   │ │ Context: 32K    │
│ Cost: ~$0.03    │ │ Cost: ~$0.02    │ │ Cost: ~$0.006   │
│ Latency: ~8 sec │ │ Latency: ~5 sec │ │ Latency: ~2 sec │
│ Selected: 24%   │ │ Selected: 61%   │ │ Selected: 15%   │
│                 │ │                 │ │                 │
│ [Select]        │ │ [Select]        │ │ [Select]        │
└─────────────────┘ └─────────────────┘ └─────────────────┘

                  [See all available models]
```

For a conventional text-generation task, the model cards show the relevant model metadata. For an agentic or multi-step task, they can additionally show the proposed plan or tool sequence without executing multiple candidate agents and causing duplicate side effects.

The user chooses one model and **only that model executes the actual request**.

After execution, the user receives lightweight microfeedback rather than being asked to switch models for the already-completed task:

```text
                 Did this work for you?

                         👍   👎
```

For negative feedback, X can optionally capture a reason such as **poor quality, incorrect, did not complete task, too slow, too expensive**, or **other**.

The user can still change the model **before execution**. Once execution starts, the model is fixed for that task unless the product explicitly supports a safe retry flow; the core PoC does not assume that a completed action can or should be rerun.

---

## 2. Signals Collected

The PoC captures signals that are broadly available across workloads rather than depending on a universal task evaluator.

| Signal | Example |
|---|---|
| Task category | `code_generation` |
| Input/context size | 8.2K tokens |
| Required context | 8K |
| Candidate model | Model B |
| Model context capacity | 128K |
| Estimated cost | $0.006/request |
| Estimated latency | 2.4 sec |
| Initial user choice | Model B |
| Post-task feedback | 👍 |
| Feedback reason | — |
| Future comparable requests | 12 |
| Future model retention | stayed on B for next 12 comparable requests |

Cost can be estimated from token usage and model pricing. Latency can be estimated from historical performance for comparable requests.

Historical selection should be scoped to similar workloads:

> **Selected by 62% of customers for similar requests**

rather than showing a misleading global popularity number.

When insufficient history exists, the UI should say **“Not enough history”** rather than manufacture a statistic.

---

## 3. Design Choices & Tradeoffs

### Present choices after the task is known rather than showing the model catalog immediately

**Choice:** Start with a blank task/prompt input. Once X understands the request, show the models that fit it, with an option to see all available models.

**Why:** Model suitability is contextual. The request determines requirements such as context capacity, tool support, reasoning capability, and likely cost/latency. Showing every available model before the user has entered a task creates unnecessary cognitive load and makes X's model catalog the user's problem.

**Tradeoff:** Advanced users have less immediate visibility into the entire catalog. The **See all available models** path preserves discoverability and control.

---

### Present choices before execution rather than execute every candidate

**Choice:** Show candidate model characteristics and let the user choose one; execute only the selected model.

**Why:** This avoids duplicate inference cost and, more importantly, makes the experience safe for agentic workloads where multiple models might otherwise execute the same external action.

**Tradeoff:** For simple generation tasks, the user does not see the final output from every candidate before choosing. Where execution is safe and inexpensive, the product can support richer side-by-side comparison.

---

### Show measurable attributes rather than a single “best model” score

**Choice:** Show cost, latency, context capacity, capabilities, and historical selection behavior.

**Why:** There is no universally best model. A customer may rationally prefer a cheaper or faster model depending on the workload.

**Tradeoff:** The customer still makes the decision in the PoC. This is intentional: X does not yet have enough evidence to claim it can make that decision better.

---

### Use user choice + post-task feedback as the initial learning signals

**Choice:** Record which model the customer chooses, whether they liked the result, and optionally why they disliked it.

**Why:** X can support arbitrary task types. There is no common objective evaluator for code generation, summarization, extraction, SQL, agents, and future workloads. Choice and lightweight feedback are available across these workloads and add little latency.

**Tradeoff:** These are behavioral/preference signals, not objective quality labels. The system initially learns which models customers choose and whether the completed task was perceived as useful, not which model is universally superior.

Task-specific evaluation can later supplement these signals asynchronously where reliable evaluation exists.

---

### Keep the model fixed after execution and collect microfeedback instead of an in-task switch

**Choice:** Let the user change models before execution; after execution, ask for 👍/👎 feedback rather than presenting **Change model** as the primary feedback mechanism.

**Why:** For a one-shot request—especially an agentic action—switching after completion does not improve the task that already ran. Automatically rerunning the task may also repeat external side effects or incur unnecessary cost.

**Tradeoff:** A thumbs-up/down signal is less informative than a detailed comparison. An optional negative-feedback reason provides additional context without making the default experience heavy.

Future comparable requests provide the stronger behavioral signal:

```text
Model B selected
      ↓
Task completed
      ↓
👍 / 👎
      ↓
Next comparable requests
      ↓
B retained or user chooses another model
```

---

### Avoid expensive evaluation in the synchronous path

A task-specific evaluator may be valuable later, but it should not block the core experience.

For example, evaluating generated code against an existing repository could require environment discovery, dependency setup, compilation, and test execution. Similar problems exist for other specialized workloads.

**Choice:** Keep the synchronous experience lightweight; treat expensive evaluations as optional asynchronous signals.

**Tradeoff:** The initial dataset is less objective, but it is dramatically more generalizable and cheaper to collect.

---

## 4. Technical Architecture

```text
                    User request
                         │
                         ▼
                Candidate model resolver
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
       Model A        Model B        Model C
      metadata/      metadata/      metadata/
        plan           plan           plan
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                   Selection UI
                         │
                    User choice
                         │
                         ▼
                Execute selected model
                         │
                         ▼
                    User result
                         │
                    👍 / 👎 feedback
                         │
                         ▼
                  Event / telemetry
                         │
             Future comparable requests
                         │
                         ▼
               Retention / model choice
```

The key architectural decision is that **candidate inspection and actual execution are separate steps**.

This lets the same product pattern support both:

- ordinary generation, where richer response comparison may be appropriate;
- agentic execution, where only one selected agent should perform the real action.

---

## 5. What the PoC Enables

Every interaction produces a structured event:

```text
action = (task, context, candidate models, cost, latency, user choice, post-task feedback)
```

For subsequent comparable requests, X can observe:

```text
action → feedback → future model retention or choice
```

For example:

| Workload | Model | Initial choice | Positive feedback | Retention |
|---|---|---:|---:|---:|
| Code generation | A | 22% | 76% | 78% |
| Code generation | **B** | **48%** | **91%** | **89%** |
| Code generation | C | 30% | 72% | 61% |

These signals do not prove that B is objectively better. They tell X that, for this workload, customers are more likely to choose B, report a successful outcome, and continue using it.

The immediate PoC therefore solves the customer's uncertainty while simultaneously giving X evidence about whether model preference is predictable for recurring workloads.

That evidence is the foundation for the [Roadmap to intelligent model selection](./roadmap_to_intelligent_model_selection.md).
