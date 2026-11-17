import test from "node:test";
import assert from "node:assert/strict";
import { getDemoAnswer, isWhiteRhinoQuestion, knowledgeBase, sourceLinks, outOfScopeAnswer } from "../knowledge.js";

 test("answers a basic diet question without claiming an exhibit-specific menu", () => {
  const answer = getDemoAnswer("What do white rhinos eat?");
  assert.match(answer, /grasses/i);
  assert.match(answer, /diet/i);
  assert.doesNotMatch(answer, /Phoenix Zoo/i);
});

test("puts visitor safety first for feeding questions", () => {
  const answer = getDemoAnswer("Can I feed the rhino?");
  assert.match(answer, /do not touch or feed/i);
  assert.match(answer, /barrier/i);
});

test("redirects unrelated questions", () => {
  const answer = getDemoAnswer("Who will win the football game?");
  assert.match(answer, /white rhinos/i);
});

test("uses a dated conservation estimate", () => {
  const answer = getDemoAnswer("What is the white rhino conservation status?");
  assert.match(answer, /Near Threatened/i);
  assert.match(answer, /end of 2024/i);
});

test("does not pretend to know current exhibit activity", () => {
  const answer = getDemoAnswer("What is the rhino doing right now?");
  assert.match(answer, /can't see the exhibit/i);
  assert.match(answer, /exhibit staff member/i);
});

test("keeps the project independent of a named zoo", () => {
  assert.doesNotMatch(knowledgeBase, /Phoenix Zoo/i);
  assert.equal(sourceLinks.some((source) => /phoenixzoo\.org/i.test(source.url)), false);
});


test("blocks unrelated questions even when no FAQ keyword matches", () => {
  for (const question of [
    "What is the capital of France?",
    "Can you help me with algebra?",
    "Tell me a joke.",
    "What is the weather today?",
    "Who won the football game?"
  ]) {
    assert.equal(getDemoAnswer(question), outOfScopeAnswer, question);
  }
});

test("allows a short follow-up only when recent user context is about white rhinos", () => {
  const context = [{ role: "user", content: "What do white rhinos eat?" }];
  assert.equal(isWhiteRhinoQuestion("How long do they live?", context), true);
  assert.equal(getDemoAnswer("What do they eat?", context).toLowerCase().includes("grasses"), true);
  assert.equal(isWhiteRhinoQuestion("Who won the game?", context), false);
});

test("rejects unrelated sports questions even when they mention rhinos", () => {
  assert.equal(isWhiteRhinoQuestion("What is a white rhino's favorite football team?"), false);
});

test("does not answer questions about other rhino species or other animals", () => {
  assert.equal(getDemoAnswer("What do black rhinos eat?"), outOfScopeAnswer);
  assert.equal(getDemoAnswer("How do elephants live?"), outOfScopeAnswer);
  assert.equal(getDemoAnswer("Compare white rhinos with giraffes."), outOfScopeAnswer);
});

test("accepts direct questions about white rhino biology", () => {
  for (const question of [
    "Why do white rhinos have horns?",
    "Where do rhinoceroses live?",
    "How does a Southern White Rhino graze?"
  ]) {
    assert.equal(isWhiteRhinoQuestion(question), true, question);
  }
});


test("answers a question about the original white rhino habitat and range in Demo Mode", () => {
  const answer = getDemoAnswer("Tell me about the original habitat of the white rhino.");
  assert.match(answer, /sub-Saharan Africa/i);
  assert.match(answer, /Southern white rhinos/i);
  assert.match(answer, /Northern white rhinos/i);
  assert.match(answer, /savannas/i);
});


test("uses one consistent white-rhino-only redirect message", () => {
  const answer = getDemoAnswer("What is the capital of France?");
  assert.match(answer, /white rhinos/i);
  assert.match(answer, /biology/i);
  assert.doesNotMatch(answer, /Phoenix Zoo/i);
});
