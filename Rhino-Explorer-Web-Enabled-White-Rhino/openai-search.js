/** Build a Responses API request that must use live web search. */
export function buildWebSearchRequest({ model, instructions, input, maxOutputTokens = 650 }) {
  return {
    model,
    instructions,
    input,
    tools: [{
      type: "web_search",
      external_web_access: true,
      search_context_size: "medium"
    }],
    tool_choice: "required",
    include: ["web_search_call.action.sources"],
    max_output_tokens: maxOutputTokens
  };
}

/** Extract generated text and unique web citations from a Responses API result. */
export function parseWebSearchResponse(result) {
  const outputItems = Array.isArray(result?.output) ? result.output : [];
  const answer = (typeof result?.output_text === "string" ? result.output_text : outputItems
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("\n"))
    .trim();

  const citationMap = new Map();
  const addCitation = (candidate) => {
    if (!candidate || typeof candidate !== "object") return;
    const url = typeof candidate.url === "string" ? candidate.url : candidate.url?.uri;
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) return;
    let fallbackTitle = "Source";
    try { fallbackTitle = new URL(url).hostname; } catch { return; }
    const title = typeof candidate.title === "string" && candidate.title.trim()
      ? candidate.title.trim()
      : fallbackTitle;
    if (!citationMap.has(url)) citationMap.set(url, { title, url });
  };

  for (const item of outputItems) {
    for (const content of item.content || []) {
      for (const annotation of content.annotations || []) {
        addCitation(annotation.url_citation || annotation);
      }
    }
    for (const source of item.action?.sources || []) addCitation(source);
  }

  return { answer, citations: [...citationMap.values()].slice(0, 8) };
}
