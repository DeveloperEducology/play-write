import { quantumNewsPrompt } from './prompts.js';

/**
 * A generic, reusable function to call the Gemini API.
 * It handles the API request, response parsing, and error logging.
 * @param {object} geminiModel - The initialized GoogleGenerativeAI model instance.
 * @param {string} prompt - The complete prompt to send to the API.
 * @returns {Promise<object|null>} A promise that resolves to the parsed JSON object from Gemini, or null on failure.
 */
async function callGemini(geminiModel, prompt) {
    try {
        console.log("📰 Calling Gemini API...");
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Clean up the response to ensure it's valid JSON
        text = text.replace(/```json/g, "").replace(/```/g, "").trim();

        const parsedJson = JSON.parse(text);
        console.log("✅ Gemini response parsed successfully.");
        return parsedJson;

    } catch (error) {
        console.error("❌ Error calling Gemini API or parsing response:", error);
        return null;
    }
}

/**
 * Generates a short Telugu news article from English text using the Gemini API.
 * This function utilizes the sophisticated "Quantum News Editor Protocol" prompt
 * to generate high-quality, context-aware news articles.
 *
 * @param {object} geminiModel - The initialized GoogleGenerativeAI model instance.
 * @param {string} englishText - The source English text to be converted into a news article.
 * @returns {Promise<{title: string, news: string}|null>} A promise that resolves to an object
 * with the Telugu title and news, or null on failure.
 */
export async function generateTeluguNews(geminiModel, englishText) {
    if (!englishText) {
        console.warn("⚠️ generateTeluguNews called with no englishText.");
        return null;
    }

    // Inject the English text into the master prompt template from prompts.js
    const finalPrompt = quantumNewsPrompt.replace('${englishText}', englishText);

    // Use the generic helper to get the news content
    const result = await callGemini(geminiModel, finalPrompt);

    if (result && result.title && result.news) {
        return result;
    } else {
        console.warn("⚠️ Gemini response was missing title or news.", result);
        return null;
    }
}

