const SIMPLE_PASTED_RECIPE = `Simple Tomato Pasta
Ingredients:
200g pasta
2 tomatoes
1 tbsp olive oil
1 pinch salt
Instructions:
1. Chop the tomatoes.
2. Boil the pasta until tender.
3. Drain the pasta.
4. Add the tomatoes, olive oil, and salt.
5. Stir everything together and serve.`;

const SIMPLE_PARSED_RECIPE = {
  title: "Simple Tomato Pasta",
  ingredients: [
    "200g pasta",
    "2 tomatoes",
    "1 tbsp olive oil",
    "1 pinch salt"
  ],
  preparationSteps: [
    "Chop the tomatoes"
  ],
  cookingSteps: [
    { text: "Boil the pasta until tender." },
    { text: "Drain the pasta." },
    { text: "Add the tomatoes, olive oil, and salt." },
    { text: "Stir everything together and serve." }
  ],
  sourceUrl: ""
};

const TIMER_PASTED_RECIPE = `Quick Tomato Beans
Ingredients:
1 tbsp olive oil
1 onion
1 can tomatoes
1 can beans
1 pinch salt
Instructions:
1. Chop the onion.
2. Heat the olive oil in a pan.
3. Add the onion and stir for 3 seconds.
4. Add the tomatoes and beans and mix.
5. Simmer for 3 seconds.
6. Stir and serve.`;

const TIMER_PARSED_RECIPE = {
  title: "Quick Tomato Beans",
  ingredients: [
    "1 tbsp olive oil",
    "1 onion",
    "1 can tomatoes",
    "1 can beans",
    "1 pinch salt"
  ],
  preparationSteps: [
    "Chop the onion"
  ],
  cookingSteps: [
    { text: "Heat the olive oil in a pan." },
    { text: "Add the onion and stir for 3 seconds.", timerSeconds: 3 },
    { text: "Add the tomatoes and beans and mix." },
    { text: "Simmer for 3 seconds.", timerSeconds: 3 },
    { text: "Stir and serve." }
  ],
  sourceUrl: ""
};

module.exports = {
  SIMPLE_PASTED_RECIPE,
  SIMPLE_PARSED_RECIPE,
  TIMER_PASTED_RECIPE,
  TIMER_PARSED_RECIPE
};
