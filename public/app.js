const taskForm = document.getElementById('task-form');
const promptInput = document.getElementById('prompt-input');
const continueButton = document.getElementById('continue-btn');
const phase0Tab = document.getElementById('phase-0-tab');
const phase1Tab = document.getElementById('phase-1-tab');
const phase0View = document.getElementById('phase-0-view');
const phase1View = document.getElementById('phase-1-view');
const recommendationSummary = document.getElementById('recommendation-summary');
const automaticTitle = document.getElementById('automatic-title');
const automaticSummary = document.getElementById('automatic-summary');
const agentPlan = document.getElementById('agent-plan');
const planSteps = document.getElementById('plan-steps');
const phase1AgentPlan = document.getElementById('phase-1-agent-plan');
const phase1PlanSteps = document.getElementById('phase-1-plan-steps');
const modelList = document.getElementById('model-list');
const automaticModelCard = document.getElementById('automatic-model-card');
const overrideOptions = document.getElementById('override-options');
const overrideModelList = document.getElementById('override-model-list');
const changeModelButton = document.getElementById('change-model-btn');
const allModelsButton = document.getElementById('all-models-btn');
const modelTemplate = document.getElementById('model-card-template');
const executionResult = document.getElementById('execution-result');
const resultTitle = document.getElementById('result-title');
const resultContent = document.getElementById('result-content');
const runModelButton = document.getElementById('run-model-btn');
const simulationNotice = document.getElementById('simulation-notice');
const feedbackPanel = document.getElementById('feedback-panel');
const negativeFeedbackForm = document.getElementById('negative-feedback-form');
const feedbackReason = document.getElementById('feedback-reason');
const feedbackStatus = document.getElementById('feedback-status');
const appError = document.getElementById('app-error');

const AUTO_SELECT_CONFIDENCE_THRESHOLD = 0.75;
let allModels = [];
let rankedModels = [];
let events = [];
let phase = 'phase0';
let currentSelectionEventId = null;
const localFeedback = new Map();
let showingAllModels = false;
let overrideOpen = false;
let pendingSelections = { phase0: null, phase1: null };
let executionStarted = false;
let submittedPrompt = '';

function inferTaskCategory(prompt) {
  const text = prompt.toLowerCase();
  if (/\b(image|vision|screenshot|photo|visual|multimodal|scan)\b/.test(text)) return 'Multimodal analysis';
  if (/\b(research|compare|synthesis|analysis|market|paper|study|contract|risks)\b/.test(text)) return 'Research synthesis';
  if (/\b(customer|support|faq|ticket|help desk)\b/.test(text)) return 'Customer support';
  if (/\b(summarize|summary|write|email|blog|article|draft|report|brief)\b/.test(text)) return 'Summarization';
  if (/\b(code|debug|build|fix|refactor|api|test|program)\b/.test(text)) return 'Code generation';
  return 'General purpose';
}

function selectionConfidence(task) {
  return task === 'General purpose' ? 0.48 : 0.82;
}

function isAgenticRequest(prompt) {
  return /\b(then|after that|workflow|multi.step|step.by.step)\b/i.test(prompt) ||
    /\b(analyze|research|review|read|find|identify)\b.*\b(and|then)\b.*\b(summarize|draft|write|send|create|update|deploy)\b/i.test(prompt);
}

function estimateInputTokens(prompt) {
  return Math.max(1, Math.ceil(prompt.length / 4));
}

function hasPreference(prompt, words) {
  return new RegExp(`\\b(${words})\\b`, 'i').test(prompt);
}

function rankModels(models, prompt) {
  const task = inferTaskCategory(prompt);
  const taskPreferences = {
    'Code generation': { 'gpt-4o-mini': 4, 'llama-3.1-70b': 2, 'claude-3-5-haiku': 1 },
    Summarization: { 'claude-3-5-haiku': 4, 'gemini-1.5-flash': 2, 'gpt-4o-mini': 1 },
    'Customer support': { 'gpt-4o-mini': 3, 'claude-3-5-haiku': 2, 'gemini-1.5-flash': 1 },
    'Research synthesis': { 'claude-3-5-haiku': 3, 'gemini-1.5-flash': 2, 'gpt-4o-mini': 1 },
    'Multimodal analysis': { 'gemini-1.5-flash': 4, 'gpt-4o-mini': 2, 'claude-3-5-haiku': 1 },
    'General purpose': { 'gpt-4o-mini': 2, 'claude-3-5-haiku': 1 }
  };
  const wantsSpeed = hasPreference(prompt, 'fast|quickly|speed|responsive|low latency');
  const wantsLowCost = hasPreference(prompt, 'cheap|affordable|budget|low cost|cost efficient|costs low|costs down');
  const wantsLongContext = hasPreference(prompt, 'long|large|huge|lengthy|extensive|50.page|page');
  const wantsVision = hasPreference(prompt, 'image|vision|screenshot|photo|visual|multimodal');
  const inputTokens = estimateInputTokens(prompt);

  return models.map((model) => {
    let score = taskPreferences[task][model.id] || 0;
    const reasons = [];
    const taskFit = {
      'Code generation': [model.tags.includes('code'), 'code-focused capabilities'],
      Summarization: [model.tags.includes('writing'), 'writing and summarization strengths'],
      'Customer support': [model.tags.includes('balanced') || model.tags.includes('writing'), 'balanced conversational performance'],
      'Research synthesis': [model.tags.includes('analysis') || model.tags.includes('long-context'), 'analysis and long-context capabilities'],
      'Multimodal analysis': [model.supportsVision, 'vision support'],
      'General purpose': [true, model.style]
    }[task];
    const estimatedInputCost = (inputTokens / 1000) * model.costPer1kTokens;

    if (taskFit[0]) reasons.push(taskFit[1]);
    if (wantsSpeed) {
      const fastestLatency = Math.min(...models.map((candidate) => candidate.latencyMs));
      score += Math.max(0, 3 - Math.round((model.latencyMs - fastestLatency) / 300));
      reasons.push(`${model.latencyMs} ms estimated latency`);
    }
    if (wantsLowCost) {
      const lowestCost = Math.min(...models.map((candidate) => candidate.costPer1kTokens));
      score += Math.max(0, 3 - Math.round((model.costPer1kTokens - lowestCost) / 0.03));
      reasons.push(`$${estimatedInputCost.toFixed(4)} estimated input cost`);
    }
    if (wantsLongContext) {
      score += Math.min(3, Math.floor(model.contextTokens / 128000));
      reasons.push(`${model.contextWindow} context capacity`);
    }
    if (wantsVision && model.supportsVision) {
      score += 3;
      if (!taskFit[0]) reasons.push('vision support');
    }

    return {
      ...model,
      estimatedInputTokens: inputTokens,
      estimatedInputCost,
      recommendationReason: reasons.length ? `Fit: ${reasons.join(' · ')}.` : model.style,
      recommendationScore: score
    };
  }).sort((a, b) => b.recommendationScore - a.recommendationScore || a.latencyMs - b.latencyMs);
}

function displayHistory(model, task) {
  const comparableSelections = events.filter((event) => event.task === task && event.user_choice);
  if (comparableSelections.length >= 5) {
    const modelSelections = comparableSelections.filter((event) => event.user_choice === model.id).length;
    return `${Math.round((modelSelections / comparableSelections.length) * 100)}% selected in recent similar requests (${comparableSelections.length} choices)`;
  }

  const history = model.demoHistory[task];
  return history
    ? `${history.percentage}% selected in demo history (${history.sampleSize} similar requests)`
    : 'Not enough data';
}

function fillPlan(list) {
  list.replaceChildren();
  [
    'Review the request and identify the required outcome.',
    'Prepare a proposed sequence of steps and any needed tools.',
    'Present the result for your review.'
  ].forEach((step) => {
    const item = document.createElement('li');
    item.textContent = step;
    list.appendChild(item);
  });
}

function renderAgentPlans(prompt) {
  const showPlan = isAgenticRequest(prompt);
  agentPlan.hidden = !showPlan;
  phase1AgentPlan.hidden = !showPlan;
  if (showPlan) {
    fillPlan(planSteps);
    fillPlan(phase1PlanSteps);
  }
}

function createModelCard(model, task, actionLabel, action) {
  const fragment = modelTemplate.content.cloneNode(true);
  const card = fragment.querySelector('.model-card');
  const selectButton = fragment.querySelector('.select-model-btn');

  fragment.querySelector('.model-label').textContent = model.family;
  fragment.querySelector('h3').textContent = model.name;
  fragment.querySelector('.provider').textContent = model.provider;
  fragment.querySelector('.context').textContent = model.contextWindow;
  fragment.querySelector('.latency').textContent = `~${(model.latencyMs / 1000).toFixed(1)} sec`;
  fragment.querySelector('.cost').textContent = `~$${model.estimatedInputCost.toFixed(4)} / request`;
  fragment.querySelector('.model-style').textContent = model.recommendationReason;
  fragment.querySelector('.history').textContent = displayHistory(model, task);
  selectButton.textContent = actionLabel;

  const chipRow = fragment.querySelector('.chip-row');
  [...model.capabilities, ...model.tags].forEach((tag) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = tag;
    chipRow.appendChild(chip);
  });

  const strengths = fragment.querySelector('.strengths');
  model.strengths.forEach((strength) => {
    const item = document.createElement('li');
    item.textContent = strength;
    strengths.appendChild(item);
  });

  selectButton.addEventListener('click', () => action(model, card));
  return { fragment, card };
}

function renderPhase0() {
  const task = inferTaskCategory(submittedPrompt);
  const shownModels = showingAllModels ? rankedModels : rankedModels.slice(0, 3);
  modelList.replaceChildren();

  recommendationSummary.textContent =
    `About ${estimateInputTokens(submittedPrompt).toLocaleString()} input tokens · Estimates and history are demo data.`;
  shownModels.forEach((model) => {
    const { fragment, card } = createModelCard(model, task, 'Choose model', (chosen, selectedCard) => {
      pendingSelections.phase0 = {
        model: chosen,
        task,
        phase: 'phase0',
        recommendedModelId: rankedModels[0].id,
        wasOverridden: chosen.id !== rankedModels[0].id,
        confidence: null,
        candidateModelIds: shownModels.map((candidate) => candidate.id)
      };
      selectModel('phase0', selectedCard);
    });

    if (pendingSelections.phase0?.model.id === model.id) {
      card.classList.add('selected-model');
      card.querySelector('.select-model-btn').textContent = 'Chosen';
    }
    modelList.appendChild(fragment);
  });
  allModelsButton.hidden = showingAllModels || rankedModels.length <= 3;
}

function renderAutomaticCard(model, task) {
  const selection = pendingSelections.phase1;
  const actionLabel = selection?.confidence < AUTO_SELECT_CONFIDENCE_THRESHOLD
    ? 'Manual selection'
    : selection?.wasOverridden
      ? 'Manual override selected'
      : 'Automatically selected';
  const { fragment, card } = createModelCard(model, task, actionLabel, () => {});
  card.classList.add('selected-model');
  const selectButton = card.querySelector('.select-model-btn');
  selectButton.disabled = true;
  automaticModelCard.replaceChildren(fragment);
  automaticModelCard.dataset.modelId = model.id;
}

function renderOverrideOptions() {
  const task = inferTaskCategory(submittedPrompt);
  overrideModelList.replaceChildren();
  rankedModels.forEach((model) => {
    const isSelected = pendingSelections.phase1?.model.id === model.id;
    const { fragment, card } = createModelCard(
      model,
      task,
      isSelected ? 'Chosen' : (pendingSelections.phase1 ? 'Select instead' : 'Choose model'),
      (chosen) => {
        const hadAutomaticSelection = Boolean(pendingSelections.phase1);
        pendingSelections.phase1 = {
          ...pendingSelections.phase1,
          model: chosen,
          task,
          phase: 'phase1',
          recommendedModelId: rankedModels[0].id,
          confidence: selectionConfidence(task),
          wasOverridden: hadAutomaticSelection && chosen.id !== rankedModels[0].id,
          candidateModelIds: rankedModels.map((candidate) => candidate.id)
        };
        renderAutomaticCard(chosen, task);
        automaticModelCard.hidden = false;
        automaticTitle.textContent = pendingSelections.phase1.wasOverridden
          ? 'You changed the automatic selection'
          : 'Model selected';
        automaticSummary.textContent = phase1Summary(task, pendingSelections.phase1.confidence, chosen, pendingSelections.phase1.wasOverridden);
        overrideOpen = false;
        overrideOptions.hidden = true;
        changeModelButton.textContent = 'Change model';
        renderOverrideOptions();
        pendingSelection = pendingSelections.phase1;
        prepareRunUI(pendingSelection);
      }
    );
    if (isSelected) card.classList.add('selected-model');
    overrideModelList.appendChild(fragment);
  });
}

function phase1Summary(task, confidence, model, wasOverridden) {
  if (confidence < AUTO_SELECT_CONFIDENCE_THRESHOLD) {
    return `Low confidence for this request type. Fell back to assisted selection. Rule-based demo only; not a trained router.`;
  }
  const action = wasOverridden ? 'You changed the recommendation' : 'Selected automatically';
  return `${action} based on ${model.recommendationReason.replace(/^Fit: |\.$/g, '')}. ` +
    `Illustrative rule-based confidence: ${Math.round(confidence * 100)}%. Not a trained router.`;
}

function renderPhase1() {
  const task = inferTaskCategory(submittedPrompt);
  const confidence = selectionConfidence(task);
  const recommendedModel = rankedModels[0];
  const automatic = confidence >= AUTO_SELECT_CONFIDENCE_THRESHOLD;

  automaticModelCard.hidden = !automatic;
  if (!pendingSelections.phase1 && automatic) {
    pendingSelections.phase1 = {
      model: recommendedModel,
      task,
      phase: 'phase1',
      recommendedModelId: recommendedModel.id,
      wasOverridden: false,
      confidence,
      candidateModelIds: [recommendedModel.id]
    };
  }
  const currentModel = pendingSelections.phase1?.model || recommendedModel;
  if (automatic) renderAutomaticCard(currentModel, task);
  automaticTitle.textContent = !automatic
    ? pendingSelections.phase1 ? 'Model selected' : 'We need your help choosing'
    : pendingSelections.phase1.wasOverridden
      ? 'You changed the automatic selection'
      : 'We selected a model for you';
  automaticSummary.textContent = phase1Summary(
    task,
    confidence,
    currentModel,
    Boolean(pendingSelections.phase1?.wasOverridden)
  );
  overrideOpen = !automatic || overrideOpen;
  overrideOptions.hidden = !overrideOpen;
  changeModelButton.hidden = !automatic;
  if (automatic) changeModelButton.textContent = overrideOpen ? 'Hide model choices' : 'Change model';
  renderOverrideOptions();
}

function renderPhase() {
  const phase0Active = phase === 'phase0';
  phase0Tab.classList.toggle('active', phase0Active);
  phase1Tab.classList.toggle('active', !phase0Active);
  phase0Tab.setAttribute('aria-selected', String(phase0Active));
  phase1Tab.setAttribute('aria-selected', String(!phase0Active));
  phase0View.hidden = !phase0Active;
  phase1View.hidden = phase0Active;

  if (!submittedPrompt) {
    executionResult.hidden = true;
    return;
  }

  if (phase0Active) {
    renderPhase0();
    pendingSelection = pendingSelections.phase0;
  } else {
    renderPhase1();
    pendingSelection = pendingSelections.phase1;
  }

  executionResult.hidden = !pendingSelection && !executionStarted;
  if (pendingSelection && !executionStarted) prepareRunUI(pendingSelection);
  if (executionStarted) {
    resultTitle.textContent = `Ran ${pendingSelections[phase]?.model.name || 'selected model'}`;
    runModelButton.hidden = true;
    feedbackPanel.hidden = false;
  }
}

function selectModel(selectionPhase, card) {
  if (executionStarted || runModelButton.disabled) return;
  pendingSelection = pendingSelections[selectionPhase];
  if (selectionPhase === 'phase0') {
    modelList.querySelectorAll('.model-card').forEach((modelCard) => {
      modelCard.classList.toggle('selected-model', modelCard === card);
      modelCard.querySelector('.select-model-btn').textContent =
        modelCard === card ? 'Chosen' : 'Choose model';
    });
  } else {
    automaticTitle.textContent = pendingSelection.wasOverridden
      ? 'You changed the automatic selection'
      : 'Model selected';
    automaticSummary.textContent = phase1Summary(
      pendingSelection.task,
      pendingSelection.confidence,
      pendingSelection.model,
      pendingSelection.wasOverridden
    );
  }
  prepareRunUI(pendingSelection);
}

function prepareRunUI(selection) {
  resultTitle.textContent = `${phase === 'phase1' && !selection.wasOverridden ? 'Automatically selected' : 'Ready to run with'} ${selection.model.name}`;
  simulationNotice.textContent = 'You can change the model before execution. Only the chosen model will run.';
  resultContent.textContent = 'This request has not run yet. The model and result are simulated for this proof of concept.';
  runModelButton.textContent = `Run with ${selection.model.name}`;
  runModelButton.hidden = false;
  feedbackPanel.hidden = true;
  executionResult.hidden = false;
}

function makeDemoResult(model, task) {
  const prompt = promptInput.value.trim();
  const taskOutput = {
    'Code generation': `I would inspect the relevant code, identify the cause, and propose a focused fix for: “${prompt}”`,
    Summarization: `I would extract the main points and produce a concise summary tailored to: “${prompt}”`,
    'Customer support': `I would prepare a clear, helpful response addressing: “${prompt}”`,
    'Research synthesis': `I would compare the available evidence and summarize the key findings for: “${prompt}”`,
    'Multimodal analysis': `I would inspect the supplied visual content and describe relevant findings for: “${prompt}”`,
    'General purpose': `I would help with the request: “${prompt}”`
  };
  return `${taskOutput[task]}\n\nThis is a simulated preview from ${model.name}; connect a model provider to generate a real response.`;
}

function setSelectedStyles(selection) {
  if (!selection) return;
  const list = selection.phase === 'phase0' ? modelList : overrideModelList;
  list.querySelectorAll('.model-card').forEach((card) => {
    const isSelected = card.querySelector('h3').textContent === selection.model.name;
    card.classList.toggle('selected-model', isSelected);
    card.querySelector('.select-model-btn').textContent = isSelected ? 'Chosen' : 'Choose model';
  });
}

async function runSelectedModel() {
  if (!pendingSelection || executionStarted) return;

  appError.hidden = true;
  runModelButton.disabled = true;
  allModelsButton.disabled = true;
  changeModelButton.disabled = true;
  document.querySelectorAll('.select-model-btn').forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch('/api/selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: pendingSelection.task,
        context: promptInput.value.trim(),
        candidateModelIds: pendingSelection.candidateModelIds,
        selectedModelId: pendingSelection.model.id,
        phase: pendingSelection.phase,
        recommendedModelId: pendingSelection.recommendedModelId,
        wasOverridden: pendingSelection.wasOverridden,
        selectionConfidence: pendingSelection.confidence
      })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to record model selection.');

    currentSelectionEventId = result.event.id;
    executionStarted = true;
    phase0Tab.disabled = true;
    phase1Tab.disabled = true;
    changeModelButton.disabled = true;
    allModelsButton.disabled = true;
    resultTitle.textContent = `Ran ${pendingSelection.model.name}`;
    simulationNotice.textContent = 'Simulated result — no external model was called.';
    resultContent.textContent = makeDemoResult(pendingSelection.model, pendingSelection.task);
    feedbackPanel.hidden = false;
    runModelButton.hidden = true;
    document.querySelectorAll('.select-model-btn').forEach((button) => { button.disabled = true; });
    negativeFeedbackForm.hidden = true;
    feedbackStatus.textContent = '';
    delete feedbackStatus.dataset.state;
    feedbackReason.value = '';
    feedbackPanel.querySelectorAll('[data-feedback]').forEach((button) => {
      button.disabled = false;
    });
    negativeFeedbackForm.querySelector('button[type="submit"]').disabled = false;
    executionResult.scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    document.querySelectorAll('.select-model-btn').forEach((button) => { button.disabled = false; });
    allModelsButton.disabled = false;
    changeModelButton.disabled = false;
    appError.textContent = error.message;
    appError.hidden = false;
  } finally {
    runModelButton.disabled = false;
  }
}

function submitFeedback(value, reason = '') {
  if (!currentSelectionEventId) {
    throw new Error('This run has no active selection event. Run the model again before submitting feedback.');
  }
  if (localFeedback.has(currentSelectionEventId)) return;

  localFeedback.set(currentSelectionEventId, { value, reason });
  feedbackPanel.querySelectorAll('[data-feedback]').forEach((button) => {
    button.disabled = true;
  });
  negativeFeedbackForm.querySelector('button[type="submit"]').disabled = true;
  negativeFeedbackForm.hidden = true;
  feedbackStatus.textContent = 'Thanks for your feedback.';
  feedbackStatus.dataset.state = 'success';
}

async function fetchHistory() {
  const response = await fetch('/api/events');
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Unable to load model history.');
  events = data.events;
}

taskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt) {
    promptInput.focus();
    return;
  }
  appError.hidden = true;
  continueButton.disabled = true;
  continueButton.textContent = 'Finding models…';
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load model options.');
    await fetchHistory();

    submittedPrompt = prompt;
    rankedModels = rankModels(data.models, prompt);
    showingAllModels = false;
    pendingSelections = { phase0: null, phase1: null };
    currentSelectionEventId = null;
    executionStarted = false;
    phase0Tab.disabled = false;
    phase1Tab.disabled = false;
    changeModelButton.disabled = false;
    allModelsButton.disabled = false;
    renderAgentPlans(prompt);
    renderPhase();
  } catch (error) {
    appError.textContent = error.message;
    appError.hidden = false;
  } finally {
    continueButton.disabled = false;
    continueButton.textContent = 'Continue';
  }
});

promptInput.addEventListener('input', () => {
  if (promptInput.value.trim() === submittedPrompt) return;
  submittedPrompt = '';
  rankedModels = [];
  pendingSelections = { phase0: null, phase1: null };
  executionStarted = false;
  phase0View.hidden = true;
  phase1View.hidden = true;
  executionResult.hidden = true;
});

phase0Tab.addEventListener('click', () => {
  if (executionStarted) return;
  phase = 'phase0';
  renderPhase();
});

phase1Tab.addEventListener('click', () => {
  if (executionStarted) return;
  phase = 'phase1';
  renderPhase();
});

changeModelButton.addEventListener('click', () => {
  overrideOpen = !overrideOpen;
  overrideOptions.hidden = !overrideOpen;
  changeModelButton.textContent = overrideOpen ? 'Keep automatic selection' : 'Change model';
  pendingSelections.phase1.candidateModelIds = overrideOpen
    ? rankedModels.map((model) => model.id)
    : [rankedModels[0].id];
});

runModelButton.addEventListener('click', runSelectedModel);

allModelsButton.addEventListener('click', () => {
  showingAllModels = true;
  renderPhase0();
});

feedbackPanel.querySelectorAll('[data-feedback]').forEach((button) => {
  button.addEventListener('click', async () => {
    appError.hidden = true;
    if (button.dataset.feedback === 'negative') {
      negativeFeedbackForm.hidden = false;
      feedbackStatus.textContent = 'Choose an optional reason, then submit your feedback.';
      feedbackStatus.dataset.state = 'pending';
      feedbackReason.focus();
      return;
    }
    try {
      await submitFeedback('positive');
    } catch (error) {
      feedbackStatus.textContent = error.message;
      feedbackStatus.dataset.state = 'error';
    }
  });
});

negativeFeedbackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  appError.hidden = true;
  try {
    await submitFeedback('negative', feedbackReason.value);
  } catch (error) {
    feedbackStatus.textContent = error.message;
    feedbackStatus.dataset.state = 'error';
  }
});

(async function init() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to load model options.');
    allModels = data.models;
  } catch (error) {
    appError.textContent = error.message;
    appError.hidden = false;
    continueButton.disabled = true;
  }
})();
