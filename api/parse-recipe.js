const OPENAI_API_URL = "https://api.openai.com/v1/responses";

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

async function parseWithOpenAI(recipeText) {
  const apiKey = process.env.OPENAI_API_KEY;

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

    const parsedRecipe = await parseWithOpenAI(recipeText);
    sendJson(res, 200, parsedRecipe);
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
