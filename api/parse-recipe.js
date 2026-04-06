const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const REMOTE_FETCH_USER_AGENT = "KitchenPilot/1.0 (+https://localhost)";

function getOpenAiApiKey() {
  const rawKey = process.env.OPENAI_API_KEY;
  if (typeof rawKey !== "string") {
    return "";
  }
  return rawKey.trim();
}

function hasOpenAiApiKey() {
  return Boolean(getOpenAiApiKey());
}

function setCorsHeaders(res) {
  if (!res || typeof res.setHeader !== "function") {
    return;
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(res, statusCode, payload) {
  if (res && typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json(payload);
    return;
  }

  if (res && typeof res.writeHead === "function" && typeof res.end === "function") {
    res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(payload));
  }
}

function getMissingKeyMessage(req) {
  const host = String(req?.headers?.host || "").toLowerCase();
  const origin = String(req?.headers?.origin || "").toLowerCase();
  const isVercelRequest = host.includes("vercel.app") || origin.includes("vercel.app") || Boolean(req?.headers?.["x-vercel-id"]);

  if (isVercelRequest) {
    return "Missing OPENAI_API_KEY. Add it in your Vercel Project Settings > Environment Variables and redeploy.";
  }

  return "Missing OPENAI_API_KEY. Set it in your terminal before running npm start.";
}

async function parseRequestBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      throw createApiError("Invalid JSON body", 400, "invalid_json_body");
    }
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  if (!chunks.length) {
    return {};
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(raw);
  } catch {
    throw createApiError("Invalid JSON body", 400, "invalid_json_body");
  }
}

function createApiError(message, statusCode, code) {
  const error = new Error(message || "Recipe parsing failed");
  if (statusCode) {
    error.statusCode = statusCode;
  }
  if (code) {
    error.code = code;
  }
  return error;
}

function isHttpUrl(value) {
  if (typeof value !== "string") {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function stripHtml(html) {
  return decodeHtmlEntities(
    String(html || "")
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(br|\/p|\/div|\/li|\/section|\/article|\/h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  );
}

function parseJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function flattenJsonLdNodes(node, results = []) {
  if (!node) {
    return results;
  }

  if (Array.isArray(node)) {
    node.forEach((item) => flattenJsonLdNodes(item, results));
    return results;
  }

  if (typeof node !== "object") {
    return results;
  }

  results.push(node);

  if (Array.isArray(node["@graph"])) {
    node["@graph"].forEach((item) => flattenJsonLdNodes(item, results));
  }

  return results;
}

function getTypeNames(node) {
  const type = node?.["@type"];
  if (Array.isArray(type)) {
    return type.map((entry) => String(entry || "").toLowerCase());
  }
  if (typeof type === "string") {
    return [type.toLowerCase()];
  }
  return [];
}

function isRecipeSchemaNode(node) {
  return getTypeNames(node).includes("recipe");
}

function extractJsonLdRecipe(html) {
  const scriptRegex = /<script[^>]*type=(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi;
  const recipeCandidates = [];
  let match;

  while ((match = scriptRegex.exec(String(html || "")))) {
    const payload = parseJsonSafely(match[1].trim());
    if (!payload) {
      continue;
    }

    const nodes = flattenJsonLdNodes(payload, []);
    nodes.forEach((node) => {
      if (isRecipeSchemaNode(node)) {
        recipeCandidates.push(node);
      }
    });
  }

  recipeCandidates.sort((left, right) => {
    const leftScore = (Array.isArray(left?.recipeIngredient) ? left.recipeIngredient.length : 0) +
      (Array.isArray(left?.recipeInstructions) ? left.recipeInstructions.length : 0);
    const rightScore = (Array.isArray(right?.recipeIngredient) ? right.recipeIngredient.length : 0) +
      (Array.isArray(right?.recipeInstructions) ? right.recipeInstructions.length : 0);
    return rightScore - leftScore;
  });

  return recipeCandidates[0] || null;
}

function parseIsoDurationToMinutes(value) {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i);
  if (!match) {
    return null;
  }

  const days = Number(match[1] || 0);
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return (days * 24 * 60) + (hours * 60) + minutes;
}

function normalizeDurationMetadata(value) {
  if (value === null || value === undefined || value === "") {
    return {};
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return { minutes: value };
  }

  if (typeof value === "string") {
    const isoMinutes = parseIsoDurationToMinutes(value);
    if (isoMinutes !== null) {
      return { minutes: isoMinutes };
    }

    const trimmed = normalizeWhitespace(value);
    if (trimmed) {
      return { display: trimmed };
    }
  }

  return {};
}

function getTextContent(value) {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number") {
    return normalizeWhitespace(value);
  }
  if (typeof value === "object") {
    if (typeof value.text === "string") {
      return normalizeWhitespace(value.text);
    }
    if (typeof value.name === "string") {
      return normalizeWhitespace(value.name);
    }
  }
  return "";
}

function getAuthorText(value) {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    return value.map(getAuthorText).filter(Boolean).join(", ");
  }

  if (typeof value === "string") {
    return normalizeWhitespace(value);
  }

  if (typeof value === "object") {
    if (typeof value.name === "string") {
      return normalizeWhitespace(value.name);
    }
    if (typeof value.author === "string") {
      return normalizeWhitespace(value.author);
    }
  }

  return "";
}

function getYieldText(value) {
  if (!value) {
    return "";
  }

  if (Array.isArray(value)) {
    const candidates = value
      .map(getTextContent)
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    return candidates[0] || "";
  }

  return getTextContent(value);
}

function flattenRecipeInstructions(value, results = []) {
  if (!value) {
    return results;
  }

  if (typeof value === "string") {
    const text = normalizeWhitespace(value);
    if (text) {
      results.push(text);
    }
    return results;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => flattenRecipeInstructions(item, results));
    return results;
  }

  if (typeof value === "object") {
    const typeNames = getTypeNames(value);

    if (typeNames.includes("howtosection")) {
      flattenRecipeInstructions(value.itemListElement || value.hasPart, results);
      return results;
    }

    const text = getTextContent(value);
    if (text) {
      results.push(text);
    }

    flattenRecipeInstructions(value.itemListElement, results);
  }

  return results;
}

function extractMetaTagContent(html, attrName, attrValue) {
  const escapedValue = attrValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*${attrName}=["']${escapedValue}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attrName}=["']${escapedValue}["'][^>]*>`, "i")
  ];

  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match && match[1]) {
      return normalizeWhitespace(decodeHtmlEntities(match[1]));
    }
  }

  return "";
}

function extractItempropContent(html, itempropName) {
  const escapedValue = itempropName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]*itemprop=["']${escapedValue}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<[^>]*itemprop=["']${escapedValue}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<[^>]*itemprop=["']${escapedValue}["'][^>]*>([^<]+)<\\/[^>]+>`, "i")
  ];

  for (const pattern of patterns) {
    const match = String(html || "").match(pattern);
    if (match && match[1]) {
      return normalizeWhitespace(decodeHtmlEntities(match[1]));
    }
  }

  return "";
}

function extractTitleFromHtml(html) {
  const ogTitle = extractMetaTagContent(html, "property", "og:title");
  if (ogTitle) {
    return ogTitle;
  }

  const titleMatch = String(html || "").match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    return normalizeWhitespace(decodeHtmlEntities(titleMatch[1]));
  }

  const h1Match = String(html || "").match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    return normalizeWhitespace(stripHtml(h1Match[1]));
  }

  return "";
}

function extractFallbackMetadataFromHtml(html) {
  const prep = normalizeDurationMetadata(extractItempropContent(html, "prepTime"));
  const cook = normalizeDurationMetadata(extractItempropContent(html, "cookTime"));
  const total = normalizeDurationMetadata(extractItempropContent(html, "totalTime"));
  const yieldValue = extractItempropContent(html, "recipeYield");
  const difficulty = extractItempropContent(html, "difficulty");
  const category = extractItempropContent(html, "recipeCategory") || extractItempropContent(html, "recipeCuisine");
  const author = extractMetaTagContent(html, "name", "author") || extractItempropContent(html, "author");
  const ratingValue = extractItempropContent(html, "ratingValue");
  const reviewCount = extractItempropContent(html, "ratingCount") || extractItempropContent(html, "reviewCount");

  return {
    title: extractTitleFromHtml(html) || undefined,
    prepTime: prep.display,
    prepTimeMinutes: prep.minutes,
    cookTime: cook.display,
    cookTimeMinutes: cook.minutes,
    totalTime: total.display,
    totalTimeMinutes: total.minutes,
    yield: yieldValue || undefined,
    difficulty: difficulty || undefined,
    category: category || undefined,
    author: author || undefined,
    rating: ratingValue || undefined,
    reviewCount: reviewCount || undefined
  };
}

function extractMetadataFromRecipeSchema(recipeNode) {
  if (!recipeNode || typeof recipeNode !== "object") {
    return {};
  }

  const prep = normalizeDurationMetadata(recipeNode.prepTime);
  const cook = normalizeDurationMetadata(recipeNode.cookTime);
  const total = normalizeDurationMetadata(recipeNode.totalTime);
  const yieldValue = getYieldText(recipeNode.recipeYield);
  const category = Array.isArray(recipeNode.recipeCategory)
    ? recipeNode.recipeCategory.map(getTextContent).filter(Boolean).join(", ")
    : getTextContent(recipeNode.recipeCategory);
  const cuisine = Array.isArray(recipeNode.recipeCuisine)
    ? recipeNode.recipeCuisine.map(getTextContent).filter(Boolean).join(", ")
    : getTextContent(recipeNode.recipeCuisine);
  const author = getAuthorText(recipeNode.author);
  const aggregateRating = recipeNode.aggregateRating || {};

  return {
    title: getTextContent(recipeNode.name) || undefined,
    prepTime: prep.display,
    prepTimeMinutes: prep.minutes,
    cookTime: cook.display,
    cookTimeMinutes: cook.minutes,
    totalTime: total.display,
    totalTimeMinutes: total.minutes,
    yield: yieldValue || undefined,
    difficulty: getTextContent(recipeNode.difficulty || recipeNode.skillLevel) || undefined,
    category: category || cuisine || undefined,
    author: author || undefined,
    rating: getTextContent(aggregateRating.ratingValue) || undefined,
    reviewCount: getTextContent(aggregateRating.ratingCount || aggregateRating.reviewCount) || undefined
  };
}

function buildRecipeTextFromSchema(recipeNode, metadata = {}) {
  if (!recipeNode || typeof recipeNode !== "object") {
    return "";
  }

  const title = getTextContent(recipeNode.name) || metadata.title || "Recipe";
  const ingredients = Array.isArray(recipeNode.recipeIngredient)
    ? recipeNode.recipeIngredient.map(getTextContent).filter(Boolean)
    : [];
  const instructions = flattenRecipeInstructions(recipeNode.recipeInstructions, []);

  if (!ingredients.length && !instructions.length) {
    return "";
  }

  const sections = [title];

  if (ingredients.length) {
    sections.push(`Ingredients:\n${ingredients.join("\n")}`);
  }

  if (instructions.length) {
    sections.push(`Instructions:\n${instructions.map((step, index) => `${index + 1}. ${step}`).join("\n")}`);
  }

  return sections.join("\n\n").trim();
}

function buildRecipeTextFromHtmlFallback(html, metadata = {}) {
  const visibleText = stripHtml(html);
  const lines = visibleText
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  const dedupedLines = [];
  const seen = new Set();

  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    dedupedLines.push(line);
    if (dedupedLines.length >= 220) {
      break;
    }
  }

  const title = metadata.title || dedupedLines[0] || "Recipe";
  return `${title}\n\n${dedupedLines.join("\n")}`.trim();
}

function omitUndefinedValues(object) {
  return Object.fromEntries(
    Object.entries(object || {}).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

async function fetchRecipeSourcePayload(sourceUrl) {
  const response = await fetch(sourceUrl, {
    headers: {
      "User-Agent": REMOTE_FETCH_USER_AGENT,
      "Accept": "text/html,application/xhtml+xml"
    },
    redirect: "follow"
  });

  if (!response.ok) {
    throw createApiError(`Could not fetch recipe URL (${response.status})`, 502, "recipe_fetch_failed");
  }

  const html = await response.text();
  const recipeSchema = extractJsonLdRecipe(html);
  const schemaMetadata = extractMetadataFromRecipeSchema(recipeSchema);
  const fallbackMetadata = extractFallbackMetadataFromHtml(html);
  const metadata = {
    ...omitUndefinedValues(fallbackMetadata),
    ...omitUndefinedValues(schemaMetadata),
    sourceUrl
  };
  const recipeText = buildRecipeTextFromSchema(recipeSchema, metadata) || buildRecipeTextFromHtmlFallback(html, metadata);
  const expectedMetadataFields = [
    "prepTime",
    "prepTimeMinutes",
    "cookTime",
    "cookTimeMinutes",
    "totalTime",
    "totalTimeMinutes",
    "servings",
    "yield",
    "category",
    "author",
    "rating",
    "reviewCount",
    "sourceUrl"
  ];
  const presentMetadataFields = expectedMetadataFields.filter((field) => metadata[field] !== undefined && metadata[field] !== null && metadata[field] !== "");
  const missingMetadataFields = expectedMetadataFields.filter((field) => !presentMetadataFields.includes(field));

  console.log("[api/parse-recipe] Structured recipe data found", {
    sourceUrl,
    recipeSchemaFound: Boolean(recipeSchema)
  });
  console.log("[api/parse-recipe] Extracted recipe metadata", {
    metadata,
    presentMetadataFields,
    missingMetadataFields
  });

  return {
    recipeText,
    metadata,
    recipeSchemaFound: Boolean(recipeSchema),
    presentMetadataFields,
    missingMetadataFields
  };
}

function mergeRecipeMetadata(parsedRecipe, metadata) {
  const merged = { ...(parsedRecipe || {}) };

  Object.entries(metadata || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      merged[key] = value;
    }
  });

  return merged;
}

function extractResponseText(payload) {
  if (payload && typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload && payload.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item && item.content) ? item.content : [];
    for (const block of content) {
      if (typeof block?.text === "string" && block.text.trim()) {
        return block.text.trim();
      }
      if (typeof block?.output_text === "string" && block.output_text.trim()) {
        return block.output_text.trim();
      }
    }
  }

  return "";
}

function findFirstJsonObject(text) {
  if (!text) {
    return "";
  }

  const source = String(text).trim();

  // Fast path: already valid JSON.
  try {
    JSON.parse(source);
    return source;
  } catch {
    // Continue to relaxed extraction.
  }

  // Remove markdown code fences if present.
  const withoutFences = source
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    JSON.parse(withoutFences);
    return withoutFences;
  } catch {
    // Continue to object scanning.
  }

  let depth = 0;
  let start = -1;

  for (let i = 0; i < withoutFences.length; i += 1) {
    const char = withoutFences[i];

    if (char === "{") {
      if (depth === 0) {
        start = i;
      }
      depth += 1;
      continue;
    }

    if (char === "}") {
      if (depth > 0) {
        depth -= 1;
      }

      if (depth === 0 && start >= 0) {
        const candidate = withoutFences.slice(start, i + 1).trim();
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // Keep scanning in case there is a later valid object.
        }
      }
    }
  }

  return "";
}

function buildPrompt(recipeText) {
  return `You are a recipe parser for a cooking assistant application.

Convert the recipe text into structured JSON.

Rules:
- Return ONLY JSON
- Split preparation steps and cooking steps
- Each step must contain a single clear action
- Split vague combined steps into multiple execution-friendly steps
- For pasta/boiling style tasks, separate actions like: bring water to boil, add pasta, cook for X minutes
- Detect cooking timers and convert them into timerSeconds
- If no timer exists, omit timerSeconds

Return exactly this format:

{
  "title": "string",
  "ingredients": ["string"],
  "preparationSteps": ["string"],
  "cookingSteps": [
    {
      "text": "string",
      "timerSeconds": number
    }
  ]
}

Recipe text:
${recipeText}`;
}

const DETERMINISTIC_COOKING_KEYWORDS = [
  "preheat", "heat", "cook", "roast", "bake", "fry", "boil", "simmer", "saute", "sautee",
  "oven", "stovetop", "gas", "fan", "degrees", "temperature", "bring to the boil",
  "bring to a boil", "gentle boil", "reduce heat", "lower heat", "until tender",
  "until golden", "until set", "minutes", "minute", "hours", "hour", "drain", "serve",
  "add", "bring", "toss", "mix", "stir", "pour"
];

const DETERMINISTIC_PREP_KEYWORDS = [
  "chop", "dice", "slice", "grate", "mince", "crush", "peel", "trim", "whisk", "roll",
  "beat", "cut", "measure", "open", "prepare", "set out", "gather"
];

function normalizeInstructionLine(line) {
  return normalizeWhitespace(String(line || "").replace(/^\d+[\).\s-]*/, ""));
}

function splitStructuredRecipeSections(recipeText) {
  const normalized = String(recipeText || "").replace(/\r/g, "").trim();
  if (!normalized) {
    return null;
  }

  const ingredientsMatch = normalized.match(/\bIngredients\s*:/i);
  const instructionsMatch = normalized.match(/\b(?:Instructions|Method|Directions)\s*:/i);

  if (!ingredientsMatch || !instructionsMatch || instructionsMatch.index <= ingredientsMatch.index) {
    return null;
  }

  const title = normalizeWhitespace(normalized.slice(0, ingredientsMatch.index).split("\n").find(Boolean) || "");
  const ingredientsText = normalized.slice(ingredientsMatch.index + ingredientsMatch[0].length, instructionsMatch.index).trim();
  const instructionsText = normalized.slice(instructionsMatch.index + instructionsMatch[0].length).trim();

  if (!title || !ingredientsText || !instructionsText) {
    return null;
  }

  return {
    title,
    ingredientsText,
    instructionsText
  };
}

function parseStructuredIngredients(ingredientsText) {
  return String(ingredientsText || "")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function parseStructuredInstructionLines(instructionsText) {
  const lines = String(instructionsText || "")
    .split("\n")
    .map((line) => normalizeInstructionLine(line))
    .filter(Boolean);

  if (lines.length > 1) {
    return lines;
  }

  return String(instructionsText || "")
    .split(/(?=\d+[\).\s-])/)
    .map((line) => normalizeInstructionLine(line))
    .filter(Boolean);
}

function deterministicParseStepDurationSeconds(stepText) {
  const text = String(stepText || "");
  const hourMatch = text.match(/(\d+(?:\s*1\/2|\.\d+)?)\s*(hour|hours|hr|hrs)/i);
  if (hourMatch) {
    const raw = hourMatch[1].replace(/\s+/g, "");
    const hours = raw.includes("1/2") ? Number.parseInt(raw, 10) + 0.5 : Number.parseFloat(raw);
    if (Number.isFinite(hours)) {
      return Math.round(hours * 60 * 60);
    }
  }

  const minuteMatch = text.match(/(\d+)\s*(minute|minutes|min|mins)/i);
  if (minuteMatch) {
    const minutes = Number.parseInt(minuteMatch[1], 10);
    if (Number.isFinite(minutes)) {
      return minutes * 60;
    }
  }

  const secondMatch = text.match(/(\d+)\s*(second|seconds|sec|secs)/i);
  if (secondMatch) {
    const seconds = Number.parseInt(secondMatch[1], 10);
    if (Number.isFinite(seconds)) {
      return seconds;
    }
  }

  return null;
}

function isDeterministicCookingStep(stepText) {
  const normalized = normalizeWhitespace(String(stepText || "").toLowerCase());
  return DETERMINISTIC_COOKING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function isDeterministicPrepStep(stepText) {
  const normalized = normalizeWhitespace(String(stepText || "").toLowerCase());
  return DETERMINISTIC_PREP_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function buildDeterministicIngredientPrepSteps(ingredients, instructionSteps) {
  const prepSteps = [];
  const seen = new Set();
  const normalizedInstructions = (Array.isArray(instructionSteps) ? instructionSteps : [])
    .map((step) => normalizeWhitespace(String(step || "").toLowerCase()));

  function pushPrepStep(stepText) {
    const normalized = normalizeWhitespace(stepText);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    prepSteps.push(normalized);
  }

  (Array.isArray(ingredients) ? ingredients : []).forEach((ingredientText) => {
    const ingredient = normalizeWhitespace(String(ingredientText || ""));
    const normalizedIngredient = ingredient.toLowerCase();

    if (!normalizedIngredient) {
      return;
    }

    if (/\bgarlic\b/.test(normalizedIngredient)) {
      if (normalizedInstructions.some((step) => /\bsliced garlic\b/.test(step))) {
        pushPrepStep("Slice the garlic");
      } else if (normalizedInstructions.some((step) => /\bminced garlic\b/.test(step))) {
        pushPrepStep("Mince the garlic");
      } else {
        pushPrepStep("Prepare the garlic");
      }
      return;
    }

    if (/\bparsley\b/.test(normalizedIngredient)) {
      pushPrepStep(/\boptional\b/.test(normalizedIngredient) ? "Chop the parsley (optional)" : "Chop the parsley");
    }
  });

  return prepSteps;
}

function deterministicParseRecipeText(recipeText) {
  const sections = splitStructuredRecipeSections(recipeText);
  if (!sections) {
    return null;
  }

  const ingredients = parseStructuredIngredients(sections.ingredientsText);
  const rawInstructionSteps = parseStructuredInstructionLines(sections.instructionsText);
  if (!ingredients.length || !rawInstructionSteps.length) {
    return null;
  }

  const preparationSteps = [];
  const cookingSteps = [];
  const inferredPreparationSteps = buildDeterministicIngredientPrepSteps(ingredients, rawInstructionSteps);

  inferredPreparationSteps.forEach((step) => {
    preparationSteps.push(step);
  });

  rawInstructionSteps.forEach((stepText) => {
    const normalized = normalizeWhitespace(stepText);
    if (!normalized) {
      return;
    }

    if (isDeterministicPrepStep(normalized) && !isDeterministicCookingStep(normalized)) {
      preparationSteps.push(normalized);
      return;
    }

    const timerSeconds = deterministicParseStepDurationSeconds(normalized);
    cookingSteps.push(timerSeconds ? { text: normalized, timerSeconds } : { text: normalized });
  });

  const parsed = {
    title: sections.title,
    ingredients,
    preparationSteps,
    cookingSteps
  };

  console.log("[api/parse-recipe] Deterministic parser output", {
    title: parsed.title,
    rawInstructionSteps,
    preparationSteps: parsed.preparationSteps,
    cookingSteps: parsed.cookingSteps,
    preparationCount: parsed.preparationSteps.length,
    cookingCount: parsed.cookingSteps.length
  });

  return parsed;
}

async function parseWithOpenAI(recipeText) {
  const apiKey = getOpenAiApiKey();

  if (!apiKey) {
    throw createApiError("Missing OPENAI_API_KEY environment variable", 503, "missing_api_key");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "gpt-4.1-mini",
      input: buildPrompt(recipeText)
    })
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw createApiError("OpenAI returned a non-JSON response", 502, "openai_invalid_response");
  }

  if (!response.ok) {
    console.error("OpenAI API error payload:", payload);
    throw createApiError(
      payload.error?.message || "OpenAI request failed",
      response.status,
      payload.error?.code || "openai_request_failed"
    );
  }

  const rawText = extractResponseText(payload);

  if (!rawText) {
    console.error("OpenAI response without output_text:", payload);
    throw createApiError("AI returned an empty response", 502, "openai_empty_output");
  }

  const normalizedJsonText = findFirstJsonObject(rawText);

  if (!normalizedJsonText) {
    console.error("Failed to extract JSON from AI output:", rawText);
    throw createApiError("AI returned invalid JSON", 502, "openai_invalid_json");
  }

  try {
    return JSON.parse(normalizedJsonText);
  } catch {
    console.error("Failed to parse AI JSON output:", normalizedJsonText);
    throw createApiError("AI returned invalid JSON", 502, "openai_invalid_json");
  }
}

async function handler(req, res) {
  setCorsHeaders(res);

  if (req.method === "OPTIONS") {
    if (res && typeof res.status === "function" && typeof res.end === "function") {
      res.status(204).end();
    } else if (res && typeof res.writeHead === "function" && typeof res.end === "function") {
      res.writeHead(204);
      res.end();
    }
    return;
  }

  console.log("[api/parse-recipe] Request received", {
    method: req.method,
    host: req.headers.host,
    origin: req.headers.origin || "n/a"
  });

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = await parseRequestBody(req);
    const recipeText = body?.recipeText;

    console.log("[api/parse-recipe] Body parsed", {
      hasRecipeText: Boolean(recipeText),
      recipeTextLength: typeof recipeText === "string" ? recipeText.length : 0
    });

    if (!recipeText || typeof recipeText !== "string") {
      sendJson(res, 400, { error: "recipeText is required" });
      return;
    }

    let recipeSourceText = recipeText;
    let extractedMetadata = {};

    if (isHttpUrl(recipeText)) {
      const sourcePayload = await fetchRecipeSourcePayload(recipeText);
      recipeSourceText = sourcePayload.recipeText || recipeText;
      extractedMetadata = sourcePayload.metadata || {};

      console.log("[api/parse-recipe] URL source processed", {
        sourceUrl: recipeText,
        recipeSchemaFound: sourcePayload.recipeSchemaFound,
        extractedTextLength: recipeSourceText.length,
        presentMetadataFields: sourcePayload.presentMetadataFields,
        missingMetadataFields: sourcePayload.missingMetadataFields
      });
    }

    const openAiKeyPresent = hasOpenAiApiKey();
    const deterministicRecipe = deterministicParseRecipeText(recipeSourceText);
    const parsedRecipe = openAiKeyPresent
      ? await parseWithOpenAI(recipeSourceText)
      : deterministicRecipe;

    if (!parsedRecipe) {
      throw createApiError("Missing OPENAI_API_KEY environment variable", 503, "missing_api_key");
    }

    const finalRecipe = mergeRecipeMetadata(parsedRecipe, extractedMetadata);
    console.log("[api/parse-recipe] Final structured recipe", {
      parserStrategy: openAiKeyPresent ? "openai" : "deterministic_plain_text",
      openAiKeyPresent,
      title: finalRecipe.title,
      preparationSteps: finalRecipe.preparationSteps,
      cookingSteps: finalRecipe.cookingSteps,
      preparationCount: Array.isArray(finalRecipe.preparationSteps) ? finalRecipe.preparationSteps.length : 0,
      cookingCount: Array.isArray(finalRecipe.cookingSteps) ? finalRecipe.cookingSteps.length : 0
    });
    console.log("[api/parse-recipe] Final metadata fields", omitUndefinedValues({
      prepTime: finalRecipe.prepTime,
      prepTimeMinutes: finalRecipe.prepTimeMinutes,
      cookTime: finalRecipe.cookTime,
      cookTimeMinutes: finalRecipe.cookTimeMinutes,
      totalTime: finalRecipe.totalTime,
      totalTimeMinutes: finalRecipe.totalTimeMinutes,
      servings: finalRecipe.servings,
      yield: finalRecipe.yield,
      difficulty: finalRecipe.difficulty,
      category: finalRecipe.category,
      rating: finalRecipe.rating,
      reviewCount: finalRecipe.reviewCount,
      sourceUrl: finalRecipe.sourceUrl
    }));
    sendJson(res, 200, finalRecipe);
  } catch (error) {
    console.error("Recipe parser endpoint failed:", error);
    const message = error && error.message ? error.message : "Recipe parsing failed";

    if (error.code === "missing_api_key" || message.includes("OPENAI_API_KEY")) {
      sendJson(res, 503, { error: getMissingKeyMessage(req) });
      return;
    }

    if (error.code === "insufficient_quota") {
      sendJson(res, 429, { error: "OpenAI quota exceeded. Check billing and usage limits." });
      return;
    }

    if (error.code === "rate_limit_exceeded") {
      sendJson(res, 429, { error: "OpenAI rate limit exceeded. Please retry in a moment." });
      return;
    }

    if (error.code === "invalid_api_key") {
      sendJson(res, 401, { error: "Invalid OPENAI_API_KEY. Update your key and restart the server." });
      return;
    }

    sendJson(res, error.statusCode || 500, { error: message });
  }
}

module.exports = handler;
module.exports.default = handler;
