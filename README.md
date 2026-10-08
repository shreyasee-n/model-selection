# Assisted Model Selection PoC

This Node.js/Express proof of concept demonstrates assisted model recommendations (Phase 0) and rule-based automatic selection with a pre-execution override (Phase 1). The model catalog, estimates, selection logic, confidence, and execution are simulated. The app does not call external model providers.

## User flow

1. Enter a request and select **Continue**. The app infers a task category from the prompt; the category is not a user-selectable control and is not shown as a detected-task label.
2. Switch between **Phase 0 · Assisted** and **Phase 1 · Automatic**.
3. In Phase 0, review the top three recommendations, model capabilities, estimates, and demo selection history. Select **See all available models** to expand the list and choose a model.
4. In Phase 1, the demo automatically selects a model when its rule-based confidence meets the threshold. **Change model** allows an override before execution. Low-confidence requests fall back to manual selection.
5. Requests that appear multi-step can show a proposed plan. This is a preview only; no tools or external actions run.
6. Run the selected model to see a simulated result. Then provide one 👍 or 👎 rating. Selecting 👎 opens an optional reason form; the first submitted rating locks the feedback controls for that run.

Model metadata and recommendation estimates are illustrative. History is seeded demo data until at least five comparable selections have occurred during the current server process; after that, displayed percentages are calculated from those in-memory selections. Phase 1's scoring and confidence are not produced by a trained router.

## Run locally on Windows

Install Node.js 18 or newer, then open Command Prompt and run:

```cmd
cd /d C:\Users\mampi\model-selection
node --version
npm --version
npm install
npm start
```

Keep the Command Prompt open while the app is running, then open <http://localhost:8080/> in a browser. Press **Ctrl+C** in Command Prompt to stop the server. `npm install` installs the app's declared dependencies from `package.json`; it does not install Playwright or Puppeteer.

## Feedback and telemetry

The app makes same-origin API requests to load models, retrieve recent selection events, and record model selections. Microfeedback is local to the browser page: it does not call a feedback endpoint, is not added to server events, and is not persisted. A selection event is logged as JSON to standard output and retained in server memory. On DigitalOcean, standard output is available in runtime logs; in-memory events are temporary and can be lost on restart or instance replacement. This is demo telemetry, not durable storage.

## DigitalOcean App Platform

The included [`app.yaml`](./app.yaml) configures a Node.js web service using the `shreyasee-n/model-selection` GitHub repository's `main` branch. App Platform installs dependencies with `npm ci`, starts the service with `npm start`, and routes HTTP traffic to port `8080`. The server listens on the `PORT` environment variable, falling back to `8080` for local use.

To deploy, make sure the repository is accessible to your DigitalOcean account, then create an App Platform app from that repository or use the spec with `doctl apps create --spec app.yaml`

## API

- `GET /api/health` reports service health.
- `GET /api/models` returns the dummy candidate-model catalog.
- `GET /api/events` returns up to 25 recent selection events held in memory.
- `POST /api/selection` validates and records a model selection. Its request body includes `task`, `context`, `candidateModelIds`, `selectedModelId`, `phase`, `recommendedModelId`, `wasOverridden`, and `selectionConfidence`.

Microfeedback has no server API route.
