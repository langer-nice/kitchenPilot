async function parseRecipeText(recipeText) {
  try {
    const API_BASE_URL = window.KITCHENPILOT_API_BASE_URL || "http://localhost:3000";
    const endpoint = `${API_BASE_URL}/api/parse-recipe`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({
        recipeText: recipeText
      })
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || "Recipe parsing request failed");
    }

    return payload;

  } catch (error) {
    console.error("Recipe parsing error:", error);
    throw error;
  }
}