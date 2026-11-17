import test from "node:test";
import assert from "node:assert/strict";
import { buildWebSearchRequest, parseWebSearchResponse } from "../openai-search.js";

test("requires live web search on every GPT request", () => {
  const payload = buildWebSearchRequest({
    model: "gpt-6-luna",
    instructions: "Only answer white rhino questions.",
    input: [{ role: "user", content: "Tell me about white rhino habitat." }]
  });

  assert.equal(payload.tools[0].type, "web_search");
  assert.equal(payload.tools[0].external_web_access, true);
  assert.equal(payload.tool_choice, "required");
  assert.deepEqual(payload.include, ["web_search_call.action.sources"]);
});

test("extracts answer text and safe unique citation links", () => {
  const parsed = parseWebSearchResponse({
    output: [
      {
        type: "message",
        content: [{
          type: "output_text",
          text: "White rhinos live in African savannas.",
          annotations: [{
            type: "url_citation",
            url: "https://rhinos.org/about-rhinos/rhino-species/white-rhino/",
            title: "International Rhino Foundation"
          }]
        }]
      },
      {
        type: "web_search_call",
        action: { sources: [
          { url: "https://rhinos.org/about-rhinos/rhino-species/white-rhino/", title: "Duplicate source" },
          { url: "javascript:alert(1)", title: "Unsafe source" },
          { url: "https://wwf.org/white-rhino", title: "WWF" }
        ] }
      }
    ]
  });

  assert.match(parsed.answer, /African savannas/);
  assert.equal(parsed.citations.length, 2);
  assert.equal(parsed.citations[0].title, "International Rhino Foundation");
  assert.ok(parsed.citations.every((source) => /^https:\/\//.test(source.url)));
});
