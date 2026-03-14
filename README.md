# kitchenPilot

## Run locally with AI parsing

1. Export your OpenAI API key:

```bash
export OPENAI_API_KEY="your_api_key_here"
```

2. Start the local server:

```bash
npm start
```

3. Open the app in browser:

```text
http://localhost:3000
```

Notes:
- This server serves static files and the API route `/api/parse-recipe`.
- If you open `index.html` directly from disk, AI parsing will not work because `/api/parse-recipe` is not available.