const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const parseRecipeHandler = require("./api/parse-recipe");

const PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = __dirname;
const ALLOWED_ORIGINS = new Set([
  "http://127.0.0.1:5500",
  "http://localhost:5500"
]);

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function setCorsHeaders(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function safeResolveFile(pathname) {
  const relativePath = pathname === "/" ? "/index.html" : pathname;
  const decodedPath = decodeURIComponent(relativePath);
  const absolutePath = path.resolve(ROOT_DIR, `.${decodedPath}`);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    return null;
  }

  return absolutePath;
}

async function serveStatic(pathname, res) {
  const absolutePath = safeResolveFile(pathname);
  if (!absolutePath) {
    sendJson(res, 400, { error: "Invalid path" });
    return;
  }

  try {
    const stat = await fs.promises.stat(absolutePath);
    if (stat.isDirectory()) {
      sendJson(res, 403, { error: "Directory listing not allowed" });
      return;
    }

    const ext = path.extname(absolutePath).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    const file = await fs.promises.readFile(absolutePath);
    res.statusCode = 200;
    res.setHeader("Content-Type", mimeType);
    res.end(file);
  } catch {
    sendJson(res, 404, { error: "Not found" });
  }
}

const server = http.createServer(async (req, res) => {
  setCorsHeaders(req, res);

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const { pathname } = parsedUrl;

  if (pathname === "/api/parse-recipe") {
    const origin = req.headers.origin || "unknown-origin";
    console.log(`[API] ${req.method} ${pathname} from ${origin}`);

    try {
      req.body = await readRequestBody(req);
      console.log(`[API] recipeText length: ${String(req.body?.recipeText || "").length}`);
    } catch (error) {
      console.error("[API] Invalid request body:", error.message);
      sendJson(res, 400, { error: error.message });
      return;
    }

    const responseShim = {
      status(statusCode) {
        this.statusCode = statusCode;
        return this;
      },
      json(payload) {
        sendJson(res, this.statusCode || 200, payload);
      }
    };

    try {
      await parseRecipeHandler(req, responseShim);
      console.log("[API] parse-recipe completed");
    } catch (error) {
      console.error("Unhandled API error:", error);
      sendJson(res, 500, { error: "Internal server error" });
    }
    return;
  }

  await serveStatic(pathname, res);
});

server.listen(PORT, () => {
  console.log(`KitchenPilot server running at http://localhost:${PORT}`);
  console.log("Set OPENAI_API_KEY before starting to enable AI recipe parsing.");
});
