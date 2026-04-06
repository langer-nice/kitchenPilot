https://github.com/langer-nice/kitchenPilot

Vercel : 
https://vercel.com/david-lang/kitchen-pilot

Open AI - API Keys : 
https://platform.openai.com/api-keys


Ingredients 
1 tbsp any vinegar or lemon juice (my favourite is cider vinegar) (Note 1)
3 tbsp extra virgin olive oil or other neutral oil
1/2 tsp Dijon Mustard (or other non spicy smooth mustard)
1/2 tsp EACH salt and pepper

Preparation
Juice the lemon 
Open the mustard

Instructions
Mix ingredients together & Stir for 03 seconds
Season with salt and pepper
Add mustard together & Stir for 03 seconds
Serve on a plate



unset OPENAI_API_KEY
export OPENAI_API_KEY="sk-...YOUR_NEW_REAL_KEY..."
 
echo "$OPENAI_API_KEY" | cut -c1-12 

Start server
cd /Users/davidlang/documents-local/design/kitchenPilot/kitchenpilot
npm start

# KitchenPilot context

KitchenPilot is a mobile-first hands-free cooking assistant built with HTML, CSS, and JavaScript.

Main screens:
- Home
- Recipe Analysis
- Ingredient Check
- Preparation
- Cooking Mode
- Timer Active
- Recipe Completed

Current priorities:
- keep UI compact
- avoid scrolling in cooking mode
- support recipe parsing from pasted recipe text
- later add URL parsing

Important UX rules:
- large readable instructions
- minimal controls
- Next is the main action
- Pause is compact
- voice control should use a compact toggle

------------------
------------------
------------------

# Apres fermature

You are working on the KitchenPilot web app.

Before implementing anything, you must fully understand the project.

DO NOT make any changes yet.

--------------------------------------------------
1. PROJECT SCAN
--------------------------------------------------

Scan the entire project structure.

Identify and explain:

- main entry point (app.js or equivalent)
- where routing or screen switching happens
- where homepage is implemented
- where Recipe Analysis page is implemented
- where recipe parsing happens (parse-recipe.js or similar)
- where state/data is passed between screens

Keep explanation short and clear.

--------------------------------------------------
2. DATA FLOW
--------------------------------------------------

Trace how a recipe moves through the app:

- from input (URL, screenshot, text)
→ parsing
→ normalized recipe object
→ Recipe Analysis screen

Show:
- where the recipe object is created
- where it is transformed
- where it is rendered

--------------------------------------------------
3. RECIPE OBJECT STRUCTURE
--------------------------------------------------

Find and describe the current recipe object structure.

List all fields currently used, for example:
- title
- ingredients
- preparationSteps
- cookingSteps
- sourceUrl
- etc.

Confirm:
- which metadata fields exist
- which are missing (prepTime, cookTime, etc.)

--------------------------------------------------
4. PARSER ANALYSIS
--------------------------------------------------

Locate the parser (parse-recipe.js or equivalent).

Explain:
- how HTML is fetched
- how data is extracted
- whether JSON-LD / schema.org is used
- what fields are currently extracted

--------------------------------------------------
5. RENDERING ANALYSIS
--------------------------------------------------

Locate Recipe Analysis rendering logic.

Explain:
- how data is displayed
- where metadata would appear
- how missing values are handled

--------------------------------------------------
6. CONSTRAINTS
--------------------------------------------------

Confirm the following:

- No UI redesign unless explicitly requested
- No new libraries unless necessary
- Keep changes minimal and controlled
- Do not break existing flows

--------------------------------------------------
7. SUMMARY
--------------------------------------------------

Provide a short summary:

- current architecture
- current limitations (especially missing metadata extraction)
- where future changes should be applied (parser vs UI)

--------------------------------------------------

STOP HERE.

Do NOT implement anything yet.

Wait for the next instruction.