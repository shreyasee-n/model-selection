const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.PORT) || 8080;
const supportedTasks = new Set([
  'Code generation',
  'Summarization',
  'Customer support',
  'Research synthesis',
  'Multimodal analysis',
  'General purpose'
]);
const candidateModels = [
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI',
    family: 'General-purpose',
    contextWindow: '128K',
    contextTokens: 128000,
    latencyMs: 1200,
    costPer1kTokens: 0.15,
    strengths: ['Fast coding help', 'Balanced quality', 'Reasoning'],
    tags: ['cheap', 'balanced', 'code'],
    capabilities: ['Text', 'Vision', 'Tool use'],
    supportsVision: true,
    supportsTools: true,
    style: 'Best default for mixed workloads',
    demoHistory: {
      'Code generation': { percentage: 68, sampleSize: 24 },
      Summarization: { percentage: 25, sampleSize: 16 },
      'Customer support': { percentage: 54, sampleSize: 19 },
      'Research synthesis': null,
      'Multimodal analysis': { percentage: 28, sampleSize: 14 },
      'General purpose': { percentage: 46, sampleSize: 22 }
    }
  },
  {
    id: 'claude-3-5-haiku',
    name: 'Claude 3.5 Haiku',
    provider: 'Anthropic',
    family: 'General-purpose',
    contextWindow: '200K',
    contextTokens: 200000,
    latencyMs: 980,
    costPer1kTokens: 0.18,
    strengths: ['Long context', 'Summarization', 'Writing'],
    tags: ['writing', 'analysis', 'long-context'],
    capabilities: ['Text', 'Vision', 'Tool use'],
    supportsVision: true,
    supportsTools: true,
    style: 'Strong for long-form content and reasoning',
    demoHistory: {
      'Code generation': { percentage: 22, sampleSize: 24 },
      Summarization: { percentage: 58, sampleSize: 16 },
      'Customer support': { percentage: 35, sampleSize: 19 },
      'Research synthesis': { percentage: 57, sampleSize: 21 },
      'Multimodal analysis': null,
      'General purpose': { percentage: 38, sampleSize: 22 }
    }
  },
  {
    id: 'llama-3.1-70b',
    name: 'Llama 3.1 70B',
    provider: 'Meta',
    family: 'Open-weight',
    contextWindow: '128K',
    contextTokens: 128000,
    latencyMs: 1600,
    costPer1kTokens: 0.09,
    strengths: ['Low cost', 'Open deployment', 'Flexible tuning'],
    tags: ['open-source', 'cost-sensitive', 'self-hosted'],
    capabilities: ['Text', 'Tool use'],
    supportsVision: false,
    supportsTools: true,
    style: 'Good fit for cost-sensitive infrastructure',
    demoHistory: {
      'Code generation': null,
      Summarization: { percentage: 12, sampleSize: 16 },
      'Customer support': null,
      'Research synthesis': { percentage: 17, sampleSize: 21 },
      'Multimodal analysis': null,
      'General purpose': null
    }
  },
  {
    id: 'gemini-1.5-flash',
    name: 'Gemini 1.5 Flash',
    provider: 'Google',
    family: 'Fast multimodal',
    contextWindow: '1M',
    contextTokens: 1000000,
    latencyMs: 870,
    costPer1kTokens: 0.12,
    strengths: ['Very low latency', 'Multimodal', 'High throughput'],
    tags: ['speed', 'multimodal', 'latency-sensitive'],
    capabilities: ['Text', 'Vision', 'Tool use'],
    supportsVision: true,
    supportsTools: true,
    style: 'Great for quick turnaround and multimodal tasks',
    demoHistory: {
      'Code generation': { percentage: 10, sampleSize: 24 },
      Summarization: { percentage: 5, sampleSize: 16 },
      'Customer support': { percentage: 11, sampleSize: 19 },
      'Research synthesis': { percentage: 26, sampleSize: 21 },
      'Multimodal analysis': { percentage: 72, sampleSize: 14 },
      'General purpose': { percentage: 16, sampleSize: 22 }
    }
  }
];

const recentEvents = [];

function publicModel(model) {
  const { id, name, provider, family, contextWindow, contextTokens, latencyMs,
    costPer1kTokens, strengths, tags, capabilities, supportsVision, supportsTools, style,
    demoHistory } = model;
  return { id, name, provider, family, contextWindow, contextTokens, latencyMs,
    costPer1kTokens, strengths, tags, capabilities, supportsVision, supportsTools, style,
    demoHistory };
}

function writeEventLog(event) {
  console.log(JSON.stringify(event));
}

function findEvent(eventId) {
  return recentEvents.find((event) => event.id === eventId);
}

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'assisted-model-selection-poc',
    deployedOn: 'digitalocean-app-platform',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/models', (req, res) => {
  res.json({ models: candidateModels.map(publicModel) });
});

app.get('/api/events', (req, res) => {
  res.json({ events: recentEvents.slice(0, 25) });
});

app.post('/api/selection', (req, res) => {
  const {
    task,
    context,
    candidateModelIds,
    selectedModelId,
    phase = 'phase0',
    recommendedModelId = null,
    wasOverridden = false,
    selectionConfidence = null
  } = req.body || {};
  if (typeof task !== 'string' || !supportedTasks.has(task) ||
      typeof context !== 'string' || !context.trim() || context.length > 10000 ||
      !Array.isArray(candidateModelIds) || candidateModelIds.length === 0 ||
      candidateModelIds.some((id) => typeof id !== 'string') ||
      !['phase0', 'phase1'].includes(phase) ||
      typeof wasOverridden !== 'boolean' ||
      (selectionConfidence !== null &&
        (typeof selectionConfidence !== 'number' || selectionConfidence < 0 || selectionConfidence > 1))) {
    return res.status(400).json({ error: 'A supported task, prompt, candidates, and valid selection mode are required.' });
  }

  const candidates = candidateModelIds
    .map((id) => candidateModels.find((model) => model.id === id))
    .filter(Boolean);
  const selectedModel = candidateModels.find((model) => model.id === selectedModelId);
  const recommendedModel = recommendedModelId === null
    ? null
    : candidateModels.find((model) => model.id === recommendedModelId);
  if (candidates.length !== candidateModelIds.length || !selectedModel ||
      !candidateModelIds.includes(selectedModel.id) ||
      (recommendedModelId !== null && !recommendedModel) ||
      (phase === 'phase1' && !recommendedModel)) {
    return res.status(400).json({ error: 'The selected model must be one of the available candidates.' });
  }

  const inputTokens = Math.max(1, Math.ceil(context.trim().length / 4));
  const event = {
    id: `evt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    task,
    context: context.trim(),
    input_tokens: inputTokens,
    required_context: inputTokens,
    candidate_models: candidates.map(({ id, name, provider }) => ({ id, name, provider })),
    cost: Number(((inputTokens / 1000) * selectedModel.costPer1kTokens).toFixed(6)),
    latency: selectedModel.latencyMs,
    initial_user_choice: phase === 'phase1' ? recommendedModel.id : selectedModel.id,
    initial_recommended_model: recommendedModel ? recommendedModel.id : null,
    pre_execution_override: wasOverridden,
    selection_confidence: selectionConfidence,
    selection_phase: phase,
    user_choice: selectedModel.id,
    selected_model: selectedModel.id,
    post_task_feedback: null,
    feedback_reason: null,
    source: phase === 'phase1' ? 'phase-1-automatic-selection' : 'phase-0-assisted-selection'
  };

  recentEvents.unshift(event);
  if (recentEvents.length > 25) recentEvents.length = 25;
  writeEventLog(event);

  return res.status(201).json({
    message: 'Selection recorded; execution is simulated in this proof of concept.',
    selectedModel: publicModel(selectedModel),
    event
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Assisted model selection POC listening on port ${port}`);
});
