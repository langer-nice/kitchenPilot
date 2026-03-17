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

------------------
------------------
------------------

# Session work log (2026-03-16)

- Added and aligned design-system style classes (buttons, steps, timer, voice, cooking container).
- Kept existing UI behavior while introducing reusable class aliases for safer future styling changes.
- Timeline improvements:
	- removed the "Focused step timeline" heading.
	- timer indicator icon now renders in step cards and is right-aligned.
- Cooking/Timer voice UI updates:
	- replaced noisy listening text with visual voice panel state.
	- added mic icon and active panel emphasis styling.
- Timer panel updates:
	- reduced content to icon + remaining time only.
	- added strong running/paused visual states.
- Cooking action buttons updates:
	- larger tap targets (60px min height).
	- improved spacing and primary action emphasis.
- Voice toggle reliability fixes:
	- introduced a single source of truth (`voiceEnabled`) for toggle intent.
	- synchronized UI highlight, toggle checked state, and recognition lifecycle.
	- centralized toggle behavior in one helper (`setVoiceEnabled`).
	- improved mobile tap hit area for custom switch input.
	- added inline voice error messages for permission/support/start failures.

- Validation status:
	- syntax/errors checked after each wave of edits; app.js and style.css were clean in editor checks.


	# Apres VSC fermé
	Analyze the project structure
	Review current implementation
	Review current implementation