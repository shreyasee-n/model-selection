# Roadmap: Reducing Model FOMO Over Time

## Executive Summary

The PoC helps customers make a better model choice. If it gains traction, the next question is whether X can **reduce the amount of effort customers spend making that choice**.

I would evolve the product progressively rather than assume that automation is the answer from day one:

**Assisted selection → Automatic selection → Continuous learning → Broader workload optimization**

The critical transition is driven by evidence. X first learns from the model customers choose, whether the completed task was useful, and which model they continue to use for subsequent comparable requests. If that behavior is predictive for a workload, X can begin selecting models automatically for high-confidence requests while preserving a pre-execution override. As the system matures, the same feedback loop can adapt to new models and eventually optimize model usage across an entire application.

---

## Phase 1 — Automatic Selection with Pre-execution Override

### Hypothesis

For recurring workloads, customer behavior will be predictable enough that X can choose the model without requiring a manual decision every time.

### Product

Instead of asking the user to select a model every time:

> **Model B selected automatically**  
> Best fit based on similar requests and your workload constraints.  
> **[Change model]**

The override happens **before execution**. Once the user confirms the task, the selected model runs. After completion, the user can provide lightweight 👍/👎 feedback.

The system should fall back to the Phase 0 selection experience for novel or low-confidence workloads.

### Initial learning target

Start with a lightweight ranking/classification model:

```text
(task, constraints, model features) → P(model retained or positive outcome)
```

The model learns from observed outcomes:

```text
model choice → post-task feedback → future retention or model choice
```

I would not start with an LLM router. The initial problem is structured prediction; a smaller model is cheaper, faster, and easier to evaluate.

### Success criteria

- ≥85% of automatic selections are retained or not overridden on comparable future requests
- <15% pre-execution override rate
- ≥95% of selections satisfy hard capability constraints
- ≥70% positive post-task feedback on automatically selected requests
- No measurable degradation in customer retention relative to manual selection
- Measurable cost/latency improvement relative to the customer's previous default

### Exit condition

Move more traffic into automatic selection only when it consistently performs at least as well as manual model choice for well-understood workload segments.

---

# Phase 2 — Contextual Bandit / Continuous Learning

### Hypothesis

The best model for a workload can change as customers, workloads, and X's model portfolio change.

At this point, the selection problem naturally becomes a **contextual bandit**:

- **Context:** task characteristics and customer constraints
- **Action:** choose a model
- **Reward:** post-task feedback plus subsequent model retention/override
- **Exploration:** periodically try alternatives

For example:

```text
90% → current best-known model
10% → alternative candidate
```

The exploration budget can vary by workload risk and expected benefit.

### Why contextual bandit?

A static classifier assumes that the historical "winner" remains the winner. A bandit explicitly handles the fact that X needs to learn continuously while making decisions.

### Success criteria

- Routing performance improves against the previous policy
- Exploration discovers meaningful improvements in a measurable fraction of explored workloads
- Positive feedback and retention do not materially decrease as new models are introduced
- Override rate does not materially increase as new models are introduced
- Exploration remains within predefined traffic and cost budgets

### Exit condition

X can adapt routing to changes in models and workloads without requiring customers to manually rediscover the best model.

---

# Phase 3 — Broader Workload Intelligence

### Hypothesis

Once X understands customer workloads well enough to make per-request choices, the same information can solve Model FOMO in broader ways.

### Potential products

**Workload insights**

> **Model B is your most-used model for code generation, but Model C is 40% cheaper for your classification workload.**

**Model migration recommendations**

> **Model D is showing better positive-feedback and retention rates on 72% of requests similar to yours.**

**Application-level optimization**

Rather than selecting one model for an entire application:

```text
Simple requests        → Model C
Complex reasoning      → Model B
Long-context tasks     → Model D
Agent planning         → Model A
```

X can help customers understand where different models fit within their workload.

### Success criteria

- Customers act on a measurable percentage of workload recommendations
- Recommended migrations improve customer-defined objectives such as cost or latency
- New models reach relevant workload segments without requiring customers to discover them manually
- Customers report reduced effort in evaluating model changes

### Exit condition

Customers increasingly rely on X not just to access models, but to understand how the model portfolio should be used within their applications.

---

# Phase 4 — Continuous Model Portfolio Optimization

### Hypothesis

At sufficient scale, X can continuously optimize the model portfolio for each workload rather than treating model selection as a one-time decision.

The loop becomes:

```text
Production workload
        ↓
Identify candidate models
        ↓
Targeted exploration
        ↓
Observe feedback / retention / overrides
        ↓
Update routing policy
        ↓
Route future traffic
        ↺
```

Where reliable task-specific evaluation exists, asynchronous evaluation can augment the behavioral signals. For example, code workloads may provide test-pass rates and structured extraction may provide field-level accuracy.

These evaluations are complementary rather than prerequisites for the core routing system.

### Success criteria

- New models are evaluated against relevant workload segments
- Regressions in routing quality are detected automatically
- Routing performance improves against the previous policy
- Customer-defined cost, latency, and capability constraints remain satisfied
- Model portfolio changes require progressively less manual customer discovery

---

# Why this roadmap

The roadmap deliberately increases automation only as the evidence improves.

| Stage | Customer experience | What X has learned |
|---|---|---|
| **Phase 0** | “Show me my choices.” | Initial preferences + post-task feedback |
| **Phase 1** | “Choose for me.” | Predictable workload preferences |
| **Phase 2** | “Keep choosing well.” | Online feedback and adaptation |
| **Phase 3** | “Optimize how I use models.” | Workload-level intelligence |
| **Phase 4** | “Keep optimizing as things change.” | Continuous portfolio learning |

The important product principle is:

> **Do not automate a decision before X has enough evidence to make it better than the customer.**

Automatic model selection is therefore not an assumption of the original PoC. It is a product direction that becomes justified if the Phase 0 data demonstrates that model preference and satisfaction are sufficiently predictable.

---

# Long-Term Vision

Model FOMO starts as a simple question:

> **“Did I choose the right model?”**

The opportunity is to progressively remove the burden behind that question.

**Today:** help the customer make the choice.

**Next:** make a selection based on what X has learned, while allowing a pre-execution override.

**Eventually:** make the choice automatically where confidence is high, while retaining lightweight post-task feedback and a safe way to override future choices.

**At scale:** help customers optimize how their entire application uses X's model portfolio.

The underlying flywheel is:

**More usage → more workload data → better selection → better customer outcomes → more usage.**
