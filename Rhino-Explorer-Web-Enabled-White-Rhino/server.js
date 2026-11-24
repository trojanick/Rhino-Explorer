import { createServer } from "node:http";
import { existsSync, readFileSync, promises as fs } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { knowledgeBase, sourceLinks, getDemoAnswer, isWhiteRhinoQuestion, outOfScopeAnswer } from "./knowledge.js";
import { buildWebSearchRequest, parseWebSearchResponse } from "./openai-search.js";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PUBLIC_DIR = resolve(ROOT, "public");

function loadLocalEnv() {
  const envPath = resolve(ROOT, ".env");
  if (!existsSync(envPath)) return;
  const rows = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#")) continue;
    const splitAt = line.indexOf("=");
    if (splitAt < 1) continue;
    const key = line.slice(0, splitAt).trim();
    let value = line.slice(splitAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}
loadLocalEnv();

const port = Number(process.env.PORT || 3000);
const model = process.env.OPENAI_MODEL || "gpt-6-luna";
const apiKey = process.env.OPENAI_API_KEY?.trim() || "";
const hasApiKey = apiKey.length > 0;
const rateBuckets = new Map();
console.log(`Rhino Explorer starting. OpenAI API key configured: ${hasApiKey ? "yes" : "no"}. Model: ${hasApiKey ? model : "demo mode"}.`);

const systemInstructions = `You are Rhino Explorer, a friendly educational assistant whose only subject is the white rhinoceros (Ceratotherium simum).

AUDIENCE AND STYLE
- Speak clearly and warmly to children, families, students, and adults.
- Usually answer in 3–6 short sentences. Use plain language and explain scientific terms.
- Answer the exact question directly. Add a helpful fact when it makes the answer clearer.
- Give enough detail to answer the question; do not force every answer into the same short template.

STRICT TOPIC BOUNDARY — MOST IMPORTANT
- You may answer questions ONLY when they are about white rhinoceroses (white rhinos), including their biology, evolution, origins, historic and current range, native habitat, diet, digestion, anatomy, horns, senses, behavior, communication, social structure, reproduction, life cycle, ecology, predators, conservation, threats, scientific research, and general managed-care and enrichment principles.
- Do not answer questions about black rhinos, other rhino species, other animals, or unrelated subjects.
- If a question is outside the white-rhino topic, respond with this exact sentence and nothing else: "I'm only able to answer questions about white rhinoceroses (white rhinos). Please ask me something about white rhino habitat, diet, behavior, biology, horns, enrichment, animal care, or conservation."
- Do not answer an unrelated question even if it appears in the same conversation as an earlier white-rhino question.
- A short follow-up such as "What do they eat?" is allowed only when the recent conversation clearly establishes that "they" means white rhinos.
- If a visitor asks about a different rhino species, use the same out-of-scope response.

LIVE INTERNET RESEARCH — REQUIRED FOR EVERY IN-SCOPE QUESTION
- You have access to the live web_search tool. You MUST use web search for every in-scope white-rhino question before answering. Do not rely only on the notes or your built-in knowledge.
- Search for the exact topic in the visitor's question. Use more than one search when needed for historical, scientific, or conservation questions.
- Prefer reliable sources: International Rhino Foundation, IUCN, peer-reviewed research, national wildlife agencies, established conservation organizations, and recognized zoo or zoological associations.
- Check publication dates and distinguish current information from historical information. For changing population estimates or conservation statuses, include the date and source context.
- Base the answer on the sources found. Do not invent facts, statistics, quotes, dates, or sources. If reliable sources disagree, explain the difference briefly.
- Include concise source citations in the answer. The application will also show clickable source links beneath your response.
- If search finds no reliable answer, say that you could not verify the detail and offer a closely related fact that is supported by sources. Never use the old generic offline-FAQ fallback when live web search has returned useful information.

ACCURACY AND EXHIBIT LIMITS
- The notes below are background context, not a complete or exclusive knowledge base. Live research can add relevant, well-sourced details.
- Clearly distinguish general species facts and managed-care best practices from facts confirmed by staff at this particular exhibit.
- You cannot observe the animal or access its private records. For current behavior, health, identity, age, exact diet, feeding schedule, keeper routine, or facility-specific care, explain that you cannot verify those details and suggest asking an exhibit staff member.
- Do not give veterinary diagnoses or treatments.
- Do not claim that a general care practice is definitely used at this exhibit.

SAFETY AND PRIVACY
- Never encourage visitors to touch, feed, approach, startle, or cross barriers to reach the animal.
- Remind visitors to follow posted exhibit rules and staff instructions.
- Do not ask for or encourage sharing personal information.

BACKGROUND KNOWLEDGE NOTES
${knowledgeBase}

REFERENCE SOURCES TO HELP GUIDE RESEARCH
${sourceLinks.map((source) => `${source.label}: ${source.url}`).join("\n")}

Remember: search the live web for every white-rhino question, answer only about white rhinos, cite reliable sources, and be honest about uncertainty.`;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function allowApiRequest(req) {
  const ip = req.socket.remoteAddress || "local";
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { start: now, count: 0 };
  if (now - bucket.start > 60_000) {
    bucket.start = now;
    bucket.count = 0;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  return bucket.count <= 30;
}

async function readJsonBody(req, maxBytes = 24 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new Error("Your message is too long. Please shorten it and try again.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new Error("The message could not be read. Please try again.");
  }
}

async function handleChat(req, res) {
  if (!allowApiRequest(req)) {
    return sendJson(res, 429, { error: "Please take a short pause before asking another question." });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return sendJson(res, 400, { error: error.message });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: "Please send a question." });
  }

  const safeMessages = messages.slice(-10).map((message) => {
    if (!message || !["user", "assistant"].includes(message.role) || typeof message.content !== "string") return null;
    return { role: message.role, content: message.content.trim().slice(0, 900) };
  }).filter(Boolean);

  if (safeMessages.length === 0 || safeMessages[safeMessages.length - 1].role !== "user" || !safeMessages[safeMessages.length - 1].content) {
    return sendJson(res, 400, { error: "Your latest message must be a non-empty question." });
  }

  const latestQuestion = safeMessages[safeMessages.length - 1].content;
  const priorMessages = safeMessages.slice(0, -1);
  if (!isWhiteRhinoQuestion(latestQuestion, priorMessages)) {
    return sendJson(res, 200, { answer: outOfScopeAnswer, mode: hasApiKey ? "gpt" : "demo", webSearch: hasApiKey, scope: "out-of-scope" });
  }

  if (!hasApiKey) {
    const answer = getDemoAnswer(latestQuestion, priorMessages);
    return sendJson(res, 200, { answer, mode: "demo" });
  }

  try {
    const apiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(buildWebSearchRequest({
        model,
        instructions: systemInstructions,
        input: safeMessages,
        maxOutputTokens: 650
      })),
      signal: AbortSignal.timeout(30_000)
    });

    const result = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      // Log the useful OpenAI error fields for debugging, while redacting any
      // API-key-like strings before they reach Render logs.
      const openAiError = result?.error && typeof result.error === "object" ? result.error : {};
      const redact = (value) => String(value ?? "")
        .replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]")
        .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted API key]");
      const details = {
        status: apiResponse.status,
        type: redact(openAiError.type),
        code: redact(openAiError.code),
        message: redact(openAiError.message),
        requestId: redact(apiResponse.headers.get("x-request-id"))
      };
      console.error("OpenAI API error details:", JSON.stringify(details));
      return sendJson(res, 502, { error: "The AI service could not answer right now. Please try again or ask an exhibit staff member." });
    }

    const { answer, citations } = parseWebSearchResponse(result);

    if (!answer) {
      return sendJson(res, 502, { error: "The assistant did not return an answer. Please try again." });
    }
    return sendJson(res, 200, { answer, citations, mode: "gpt", webSearch: true });
  } catch (error) {
    console.error("OpenAI request failed:", error?.name || "Unknown error");
    return sendJson(res, 502, { error: "The AI service could not answer right now. Please try again or ask an exhibit staff member." });
  }
}

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

async function serveStatic(req, res, pathname) {
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === "/" ? "/index.html" : decoded;
  const filePath = resolve(PUBLIC_DIR, `.${requested}`);
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + sep)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  try {
    const contents = await fs.readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'"
    });
    if (req.method === "HEAD") return res.end();
    return res.end(contents);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Not found");
  }
}

const server = createServer(async (req, res) => {
  let pathname;
  try {
    pathname = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`).pathname;
  } catch {
    return sendJson(res, 400, { error: "Invalid request." });
  }

  if (pathname.startsWith("/api/")) {
    if (req.method === "GET" && pathname === "/api/status") {
      if (!allowApiRequest(req)) return sendJson(res, 429, { error: "Please take a short pause." });
      return sendJson(res, 200, {
        mode: hasApiKey ? "gpt" : "demo",
        model: hasApiKey ? model : null,
        webSearch: hasApiKey,
        sources: sourceLinks
      });
    }
    if (req.method === "POST" && pathname === "/api/chat") return handleChat(req, res);
    return sendJson(res, 404, { error: "API route not found." });
  }

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    return res.end("Method not allowed");
  }

  try {
    return await serveStatic(req, res, pathname);
  } catch {
    res.writeHead(400);
    return res.end("Bad request");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`\n🦏 Rhino Explorer is running at http://localhost:${port}`);
  console.log(hasApiKey ? `GPT mode: ${model}` : "Demo mode: add an API key in .env to enable GPT responses.");
  console.log("Press Ctrl+C to stop.\n");
});
