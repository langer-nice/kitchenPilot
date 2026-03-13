function parseRecipeInput(inputText, inputUrl) {
  const hasText = Boolean(inputText && inputText.trim());
  const hasUrl = Boolean(inputUrl && inputUrl.trim());

  // Placeholder parser:
  // In a real implementation, this is where AI or NLP parsing could transform
  // unstructured recipe text/URL content into structured ingredients and steps.
  // For now, return the bundled example recipe while preserving a custom title hint.
  const recipe = JSON.parse(JSON.stringify(EXAMPLE_RECIPE));

  if (hasText) {
    recipe.title = "Custom Pasted Recipe";
  } else if (hasUrl) {
    recipe.title = "Recipe From URL";
  }

  return recipe;
}
