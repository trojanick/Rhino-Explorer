# Rhino Explorer — White Rhino Exhibit Assistant (Live Web Search)

A kiosk-style Node.js web app for a general white rhinoceros exhibit. Visitors can ask broad questions about white rhino biology, history, native habitat, diet, behavior, reproduction, conservation, and general animal care.

## What changed in this version

- **Live web search is enabled in GPT mode.** Every question that passes the server-side white-rhino topic filter is sent to the OpenAI Responses API with its built-in `web_search` tool. Live external web access is explicitly enabled and search is required for each in-scope request.
- **Clickable sources appear under answers.** The server extracts source URLs returned by the Responses API and the browser renders them as safe external links.
- **White-rhino-only boundary remains active.** Unrelated subjects, other animal species, and other rhino species are blocked on the server before reaching the model.
- **More complete topic coverage.** The assistant is instructed to answer questions about white-rhino biology, evolution, origins, historic/current range, habitat, diet, anatomy, horns, senses, behavior, reproduction, ecology, conservation, scientific research, and general managed care.
- **It no longer treats the local FAQ as the complete knowledge base.** The research notes are background context; GPT mode searches for the specific topic each time.
- **Demo Mode still works offline** with preset responses. For unknown questions in Demo Mode, it explains that live web research requires an API key instead of pretending to have searched.
- **No facility-specific claims are invented.** It cannot inspect the animal or know its identity, medical information, current behavior, keeper schedule, or exact care routine.

## Requirements

- Node.js 20 or newer
- npm (included with Node.js)
- For live web-search answers: an OpenAI API key, an API account with access to the selected model, and API billing/credits. Model tokens and web-search tool use may incur separate API charges. Check current pricing before enabling it.

## Run on macOS

1. Download and unzip this project.
2. Open the `Rhino-Explorer-Web-Enabled-White-Rhino` folder in VS Code.
3. In VS Code, choose **Terminal → New Terminal**.
4. Run:

   ```bash
   cp .env.example .env
   npm start
   ```

5. Open **http://localhost:3000** in your browser.

Without an API key, the app starts in **DEMO MODE · OFFLINE** and uses preset replies.

## Enable live internet research

1. Open the `.env` file in the project folder.
2. Add your OpenAI API key after `OPENAI_API_KEY=`. Do not add the key to any file in `public/`, upload it to GitHub, or share it in chat.
3. The default model is `gpt-6-luna`, which supports the Responses API web-search tool. You can change `OPENAI_MODEL` to another supported model if your API account has access to it.
4. Save `.env`.
5. Stop the server with `Ctrl+C`, then restart it using `npm start`.
6. The top status should say **GPT + WEB SEARCH**.
7. Ask a white-rhino question. The app will search online and show clickable sources below the answer.

For a live deployment, add `OPENAI_API_KEY` as a secret environment variable in your hosting provider's service settings. Never put it in browser code or in a public repository. Ask a parent/guardian or instructor to help with account setup and any paid services.

## How the web-search behavior works

- The server first checks whether the message is about white rhinos. Out-of-scope requests are rejected before they are sent to OpenAI.
- For an in-scope question, the server calls `POST /v1/responses` with `tools: [{ type: "web_search", external_web_access: true }]` and `tool_choice: "required"`.
- The model is instructed to search for every in-scope question, prioritize reliable scientific and conservation sources, check dates for changing information, state uncertainty, and include sources.
- The app displays the answer plus up to eight unique clickable source links returned by the web-search tool.
- Search does not grant access to private exhibit records, live cameras, animal medical records, or staff schedules. Those questions are referred to exhibit staff.

## Main files

- `server.js` — Node server, strict topic filter, Responses API web-search configuration, source extraction, and API request limits.
- `knowledge.js` — background facts, reference sources, topic filter, and Demo Mode responses.
- `public/index.html` — kiosk interface.
- `public/styles.css` — interface styling and source-link styling.
- `public/app.js` — chat behavior, source display, voice input, and read-aloud controls.
- `.env.example` — safe environment-variable template.

## Testing

Run:

```bash
npm test
```

The automated tests verify topic boundaries, historical habitat answers in Demo Mode, visitor safety responses, and the offline-mode fallback. A live API test requires a real API key and billable API access.

Try these prompts in GPT + WEB SEARCH mode:

- Tell me about the original habitat of the white rhino.
- What is the difference between the historical range of northern and southern white rhinos?
- How do white rhinos digest grass?
- How do white rhinos communicate?
- What are the latest conservation challenges facing white rhinos?
- What scientific research has been published about white rhinos recently?

Try an unrelated question such as “What is the capital of France?” The server should return the white-rhino-only boundary response without sending that request to OpenAI.

## Research references for the background notes

1. International Rhino Foundation — White Rhino: https://rhinos.org/about-rhinos/rhino-species/white-rhino/
2. International Rhino Foundation — State of the Rhino: https://rhinos.org/about-rhinos/state-of-the-rhino/
3. World Wildlife Fund — White Rhino: https://www.worldwildlife.org/species/rhino/white-rhino/
4. European Association of Zoos and Aquaria — White Rhinoceros Best Practice Guidelines (2018): https://eazawebsite-prod.s3.nl-ams.scw.cloud/uploads/2018_EAZA_Best_Practice_Guidelines_White_rhinoceros_NV_feefd99e0e.pdf
5. Peer-reviewed evolutionary history study: https://pmc.ncbi.nlm.nih.gov/articles/PMC6235034/

## Important limits

- This is an educational student prototype, not an officially approved public exhibit system.
- Web search improves coverage but does not guarantee that every answer will be correct or that every source is authoritative. Review important answers before public use.
- This app is not a live animal-monitoring or veterinary system.
- Speech recognition depends on browser support and microphone permission.
- Before public deployment, have the hosting organization review accuracy, accessibility, privacy, security, and animal-welfare practices.

## Deploy with Render

This is a Node.js **Web Service**, not a Static Site.

1. Upload the project contents to a private GitHub repository. Do not upload `.env` or an API key; `.gitignore` excludes `.env`.
2. In Render, choose **New → Web Service** and connect the repository.
3. Use:
   - Runtime: Node
   - Build command: `npm install`
   - Start command: `npm start`
   - Node version: 20 or newer
4. In Render environment variables, set `OPENAI_API_KEY` as a secret. Optionally set `OPENAI_MODEL` to a model your API account can use. Render supplies `PORT` automatically.
5. Deploy. Render will provide a public website address.

Hosting charges and OpenAI API charges are separate. Free hosting tiers may sleep when inactive; a paid always-on service may be needed for a more consistently available visitor kiosk. Check the provider's current pricing and limits before deployment.

Official references:
- OpenAI web search guide: https://developers.openai.com/api/docs/guides/tools-web-search
- GPT-6 Luna model information: https://developers.openai.com/api/docs/models/gpt-6-luna
- Render Node deployment guide: https://render.com/docs/deploy-node-express-app
