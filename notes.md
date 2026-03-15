https://github.com/langer-nice/kitchenPilot

Vercel : 
https://vercel.com/david-lang/kitchen-pilot

Open AI - API Keys : 
https://platform.openai.com/api-keys


Ingredients
300g spaghetti
2 garlic cloves
2 tbsp olive oil

Instructions
Boil the spaghetti for 10 minutes.
Heat olive oil in a pan.
Add garlic and cook for 30 seconds.
Add the pasta and mix.



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