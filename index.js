import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Import both scraper functions
import { scrapeUserTweets, scrapeSingleTweet } from "./scraper.js";

// Load environment variables
dotenv.config();

// --- Gemini AI Initialization ---
// Using a modern, efficient model
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const geminiModel = genAI.getGenerativeModel({
  model: "gemini-1.5-flash-latest",
});

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://127.0.0.1:27017/twitter_scraper";

app.use(cors());
app.use(express.json());

// --- MongoDB Connection ---
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected successfully."))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// --- Mongoose Schema ---
const ArticleSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    summary: { type: String },
    body: { type: String },
    teluguTitle: { type: String },
    teluguNews: { type: String },
    url: { type: String, required: true, unique: true },
    source: { type: String, required: true },
    isCreatedBy: { type: String, required: true, default: "manual" },
    publishedAt: { type: Date },
    media: [
      {
        mediaType: {
          type: String,
          enum: ["image", "video_post", "youtube_video"],
        },
        url: { type: String },
      },
    ],
  },
  { timestamps: true }
);

const Article = mongoose.model("Article", ArticleSchema);


// --- TELUGU SUMMARY HELPER FUNCTION ---
async function summarizeTeluguNews(teluguText) {
  if (!teluguText) return null;

  const prompt = `
మీరు ఒక ప్రముఖ తెలుగు వార్తా పత్రికలో అనుభవజ్ఞులైన సంపాదకులు. 
కింది వార్తా పాఠ్యాన్ని సుమారు 80 పదాలలోపు స్పష్టంగా, సరిగ్గా, పాఠకులకు అనువుగా **సారాంశం** రాయాలి. 
ప్రధాన విషయాలు మాత్రమే ఉంచాలి, అనవసర వివరాలు తొలగించాలి.

---
వార్తా పాఠ్యం:
${teluguText}
---

ఫలితం: కేవలం సారాంశం మాత్రమే ఇవ్వాలి, మరేమీ కాదు.
`;

  try {
    console.log("📰 Calling Gemini API for Telugu summarization...");
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    let text = response.text().trim();

    // Just plain summary text (no JSON expected here)
    return text;
  } catch (error) {
    console.error("❌ Error summarizing Telugu news:", error);
    return null;
  }
}

// --- API: Summarize Telugu News ---
app.post("/summarize-telugu", async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "Telugu text is required." });
  }

  try {
    const summary = await summarizeTeluguNews(text);
    if (!summary) {
      return res
        .status(500)
        .json({ error: "Failed to generate Telugu summary." });
    }

    res.json({
      originalLength: text.length,
      summaryLength: summary.length,
      summary,
    });
  } catch (err) {
    console.error("❌ Error in /summarize-telugu route:", err);
    res.status(500).json({ error: "Something went wrong.", details: err.message });
  }
});



// --- NEW: TELUGU TITLE GENERATION HELPER ---
async function generateTeluguTitle(teluguText) {
  if (!teluguText) return null;
  const prompt = `
మీరు ఒక వార్తాపత్రిక సంపాదకులు. కింది తెలుగు వార్తా పాఠ్యానికి అత్యంత ఆకర్షణీయమైన, క్లుప్తమైన శీర్షిక (title)ను రాయాలి. శీర్షిక 5-8 పదాలకు మించకూడదు.

---
వార్తా పాఠ్యం:
${teluguText}
---

ఫలితం: కేవలం శీర్షిక మాత్రమే ఇవ్వాలి.`;
  try {
    console.log("📰 Calling Gemini API for Telugu title...");
    const result = await geminiModel.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error("❌ Error generating Telugu title:", error);
    return null;
  }
}

// --- API: Create Article From Telugu Text ---
app.post("/create-news", async (req, res) => {
  const { text } = req.body;
  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: "A substantial amount of Telugu text is required." });
  }

  try {
    // 1. Generate all necessary components in parallel
    const [title, summary, imagePrompt] = await Promise.all([
      generateTeluguTitle(text),
      summarizeTeluguNews(text),
    ]);

    // Check if essential components were generated
    if (!title || !summary) {
      return res.status(500).json({ error: "Failed to generate essential content (title or summary)." });
    }
    
    // This is where you would use the image prompt to get an actual URL.
    // For now, we'll use a placeholder.
    const imageUrl = `https://cdn.pixabay.com/photo/2017/06/26/19/03/news-2444778_960_720.jpg`;

    // 2. Create the new article object
    const newArticle = new Article({
      title: title,
      summary: summary,
      body: text, // The original text is the body
      teluguTitle: title,
      teluguNews: summary,
      // Create a unique placeholder URL to satisfy the schema's unique constraint
      url: `manual://text-entry/${Date.now()}`,
      source: "manual_text_input", // Set a default source
      isCreatedBy: "manual",
      publishedAt: new Date(),
      media: [{
        mediaType: "image",
        url: imageUrl
      }],
    });

    // 3. Save the new article to the database
    await newArticle.save();

    res.status(201).json({
      message: "Successfully created and saved the new article.",
      article: newArticle,
    });

  } catch (err) {
    console.error("❌ Error in /create-from-text route:", err);
    res.status(500).json({ error: "An internal server error occurred.", details: err.message });
  }
});
// --- Utility ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- NEW: GEMINI HELPER FOR ENGLISH SUMMARIZATION ---
/**
 * Generates a summarized English title and summary from text using the Gemini API.
 * @param {string} englishText The text to be summarized.
 * @returns {Promise<{title: string, summary: string}|null>} A promise that resolves to an object with title and summary, or null on failure.
 */
async function summarizeTweetWithGemini(englishText) {
  if (!englishText || englishText.trim().length < 20) {
    console.warn("⚠️ Skipping Gemini call for short or empty text.");
    return null;
  }

  const prompt = `
You are an expert news editor. Your task is to summarize the following text, which is from a social media post, into a clean, professional news format.

Based on the text provided, generate:
1.  A concise and compelling news headline (title).
2.  A brief summary of the key information (summary) in about 40-50 words.

The output must be a single, clean JSON object with only two keys: "title" and "summary".

---
Source Text:
"${englishText}"
---
`;

  try {
    console.log("📰 Calling Gemini API for English summarization...");
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();
    const parsedJson = JSON.parse(text);

    if (parsedJson.title && parsedJson.summary) {
      console.log("✅ English summary generated successfully.");
      return parsedJson;
    } else {
      console.warn(
        "⚠️ Gemini response was missing title or summary.",
        parsedJson
      );
      return null;
    }
  } catch (error) {
    console.error("❌ Error calling Gemini API or parsing response:", error);
    return null;
  }
}

// --- GEMINI HELPER FUNCTION (WITH IMPROVED PROMPT) ---
/**
 * Generates a short Telugu news article from English text using the Gemini API.
 * @param {string} englishText The text to be converted into news.
 * @returns {Promise<{title: string, news: string}|null>} A promise that resolves to an object with title and news, or null on failure.
 */
async function generateTeluguNews(englishText) {
  if (!englishText) return null;

  // ⭐ --- MODIFIED PROMPT FOR BETTER, JOURNALISTIC STYLE --- ⭐
  // This prompt now asks for a specific style ("in the style of a major newspaper")
  // and gives a more flexible word count ("around 65 words") to allow for more natural language.

  const prompt = `
You are no longer just an editor; you are a master Telugu journalist and storyteller for a top-tier publication like Eenadu. Your mission is not merely to translate but to **create** a complete, compelling, and publish-ready news article from the source text, embodying the highest standards of journalistic integrity and flair.

You will execute this mission by meticulously following a multi-layered protocol.

---
### 
  **Core Journalistic Principles (ప్రాథమిక సూత్రాలు)**
This is your guiding philosophy.
* **Objectivity (వస్తుनिष्ठత):** Report the facts without bias or personal opinion.
* **Clarity & Cohesion (స్పష్టత & పొందిక):** Ensure the report flows logically and is easily understood by any reader.
* **Impact (ప్రభావం):** Always consider *why* this news matters and subtly convey its significance.

---
### 
  **Step 1: Content Analysis & Elaboration**
* **Categorize:** First, identify the primary category of the news (Political, Sports, Movie, Accident, Human Interest).
* **Elaborate (If Needed):** If the input text is brief (under ~15 words), invoke the **Elaboration Mandate**. Act as a true journalist: use your general knowledge to add necessary context, background, and plausible details (like key figures, location significance, or public sentiment) to build a complete 65-70 word report.

---
### 
  **Step 2: The Art of Writing (రచనా నైపుణ్యం)**
Based on the category, you will now craft the report.

#### 
  **A. Title Crafting Matrix (శీర్షిక నైపుణ్యం):**
Choose the most fitting title style from below.
* **Direct & Factual:** For official/political news (e.g., "పోలవరంపై మంత్రి సమీక్ష").
* **Intriguing & Evocative:** For sports/movies (e.g., "రికార్డుల వేటలో 'సలార్'").
* **Impact-Oriented:** For accidents/tragedies (e.g., "హైవేపై పెను విషాదం: ఐదుగురి మృతి").
* **Quote-Based:** If a powerful quote defines the story.

#### 
  **B. The Lede - Perfecting the First Sentence (మొదటి వాక్యం):**
The opening sentence is critical. Choose the best approach.
* **Direct Lede:** For breaking news. State the most critical fact immediately (e.g., "హైదరాబాద్-విజయవాడ రహదారిపై ఘోర ప్రమాదం జరిగింది.").
* **Contextual Lede:** For complex stories. Start with the significance or background (e.g., "బహుళ ప్రతీక్షల మధ్య 'కల్కి' చిత్రం ఈరోజు విడుదలైంది.").
* **Creative Lede:** For human interest/entertainment. Use a compelling description (e.g., "క్రీడాభిమానుల కేరింతల మధ్య టీమిండియా సిరీస్‌ను కైవసం చేసుకుంది.").

#### 
  **C. The Concluding Sentence (ముగింపు వాక్యం):**
End the report with a meaningful conclusion.
* **Next Steps:** State what is happening next (e.g., "...ఈ ఘటనపై పోలీసులు దర్యాప్తు చేస్తున్నారు.").
* **Broader Impact:** Mention the public reaction or significance (e.g., "...ఈ నిర్ణయంపై సర్వత్రా హర్షం వ్యక్తమవుతోంది.").
* **Official Statement:** End with a relevant quote (e.g., "...అని మంత్రి స్పష్టం చేశారు.").

---
### 
  **Step 3: Final Output Format**
* **Dateline:** The news body MUST begin with a dateline (e.g., "అమరావతి:"). If the location is unclear, infer a logical one ("హైదరాబాద్:", "న్యూఢిల్లీ:", "ముంబై:").
* **Length:** The body must be approximately 65-70 words.
* **JSON Structure:** The final output must be a single, clean JSON object with only two keys: "title" and "news". No extra text, notes, or markdown.

---
### 
  **Exemplars of Excellence**

#### 
  **Example 1: Political News (Contextual Lede, Direct Title)**
* **Input:** "CM Revanth Reddy launched the 'Praja Palana' scheme in Hyderabad."
* **Output:**
    {
        "title": "ప్రజా పాలన పథకం ప్రారంభం",
        "news": "హైదరాబాద్: రాష్ట్రంలో అర్హులైన ప్రతి ఒక్కరికీ ప్రభుత్వ పథకాలు అందాలనే లక్ష్యంతో ముఖ్యమంత్రి రేవంత్ రెడ్డి 'ప్రజా పాలన' కార్యక్రమాన్ని ప్రారంభించారు. ఈ కార్యక్రమం ద్వారా అధికారులు ప్రజల వద్దకే వెళ్లి దరఖాస్తులు స్వీకరిస్తారని ఆయన తెలిపారు. ఈ నిర్ణయంపై ప్రజల నుంచి సానుకూల స్పందన వ్యక్తమవుతోంది."
    }

#### 
  **Example 2: Movie News (Elaboration Mandate, Intriguing Title)**
* **Input:** "Kalki 2898 AD released."
* **Output:**
    {
        "title": "ప్రేక్షకుల ముందుకు 'కల్కి'.. థియేటర్ల వద్ద పండుగ వాతావరణం",
        "news": "హైదరాబాద్: బహుళ ప్రతీక్షల మధ్య పాన్ ఇండియా స్టార్ ప్రభాస్ నటించిన 'కల్కి 2898 ఏడీ' చిత్రం ఈరోజు ప్రపంచవ్యాప్తంగా విడుదలైంది. నాగ్ అశ్విన్ దర్శకత్వంలో సైన్స్ ఫిక్షన్ కథాంశంతో తెరకెక్కిన ఈ సినిమాపై భారీ అంచనాలున్నాయి. తొలి ప్రదర్శన నుంచే సినిమాకు అద్భుతమైన స్పందన లభిస్తుండటంతో చిత్రబృందం హర్షం వ్యక్తం చేస్తోంది."
    }
---

Now, execute this protocol with the precision and flair of a world-class editor for the following text.
---
**English Text:**
${englishText}
---
`;
  try {
    console.log("📰 Calling Gemini API with improved prompt...");
    const result = await geminiModel.generateContent(prompt);
    const response = await result.response;
    let text = response.text();

    // Clean up the response to ensure it's valid JSON
    text = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsedJson = JSON.parse(text);

    if (parsedJson.title && parsedJson.news) {
      console.log("✅ Telugu news generated successfully.");
      return parsedJson;
    } else {
      console.warn("⚠️ Gemini response was missing title or news.", parsedJson);
      return null;
    }
  } catch (error) {
    console.error("❌ Error calling Gemini API or parsing response:", error);
    return null;
  }
}

// --- API Routes ---

// --- USER SCRAPE ROUTE (Checks all tweets, skips duplicates) ---
app.get("/scrape-user", async (req, res) => {
  const { username } = req.query;
  if (!username) {
    return res
      .status(400)
      .json({ error: "Username query parameter is required." });
  }

  try {
    const tweets = await scrapeUserTweets(username);

    const savedArticles = [];
    const skippedDuplicates = [];
    const skippedInvalid = [];

    for (const tweet of tweets) {
      if (!tweet.url) {
        console.warn("⚠️ Skipping tweet with no URL:", tweet);
        skippedInvalid.push(tweet);
        continue;
      }

      try {
        const exists = await Article.findOne({ url: tweet.url });

        // ⭐ Logic reverted: Now it skips the duplicate and continues the loop
        if (exists) {
          skippedDuplicates.push(tweet.url);
          continue; // Skip this tweet and move to the next one
        }

        const summarizedContent = await summarizeTweetWithGemini(tweet.text);
        const mediaData = tweet.image
          ? [{ mediaType: "image", url: tweet.image }]
          : [];

        const article = new Article({
          title: summarizedContent
            ? summarizedContent.title
            : tweet.text.slice(0, 100),
          summary: summarizedContent
            ? summarizedContent.summary
            : tweet.text.slice(0, 200),
          body: tweet.text,
          url: tweet.url,
          source: username,
          isCreatedBy: "twitter_scraper_user",
          publishedAt: tweet.publishedAt
            ? new Date(tweet.publishedAt)
            : new Date(),
          media: mediaData,
        });

        await article.save();
        savedArticles.push(article);
      } catch (err) {
        console.error(`⚠️ Error saving tweet ${tweet.id}:`, err.message);
      }
      await delay(200);
    }

    res.json({
      message: `Scraping for ${username} complete. All fetched tweets have been checked.`,
      savedCount: savedArticles.length,
      skippedDuplicatesCount: skippedDuplicates.length,
      skippedInvalidCount: skippedInvalid.length,
      savedArticles,
      skippedDuplicates,
    });
  } catch (err) {
    console.error(`❌ Failed to fetch tweets for ${username}:`, err);
    res.status(500).json({
      error: "Failed to fetch or process user tweets.",
      details: err.message,
    });
  }
});

// --- SINGLE POST SCRAPE ROUTE (As provided by you) ---
app.get("/scrape-post", async (req, res) => {
  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: "URL query parameter is required." });
  }

  const twitterStatusRegex =
    /^https?:\/\/(twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
  if (!twitterStatusRegex.test(url)) {
    return res
      .status(400)
      .json({ error: "Invalid Twitter/X post URL provided." });
  }

  try {
    const existingArticle = await Article.findOne({ url });
    if (existingArticle) {
      return res.status(200).json({
        message: "Article already exists in the database.",
        isNew: false,
        article: existingArticle,
      });
    }

    // 1. Scrape the tweet
    const tweet = await scrapeSingleTweet(url);

    if (!tweet || !tweet.text) {
      return res.status(404).json({
        error:
          "Could not find or scrape the specified post, or post has no text.",
      });
    }

    // 2. Call Gemini API to generate Telugu news ⭐️
    const teluguContent = await generateTeluguNews(tweet.text);

    const mediaData = tweet.image
      ? [{ mediaType: "image", url: tweet.image }]
      : [];
    const username =
      url.match(/(?:twitter|x)\.com\/(.*?)\/status/)[1] || "unknown";

    // 3. Create the new article with both English and Telugu content
    const newArticle = new Article({
      title: teluguContent ? teluguContent.title : tweet.text.slice(0, 100),
      summary: teluguContent ? teluguContent.news : tweet.text.slice(0, 200),
      // body: tweet.text,
      url: tweet.url.replace("x.com", "twitter.com"),
      source: username,
      isCreatedBy: "twitter_scraper",
      publishedAt: tweet.publishedAt ? new Date(tweet.publishedAt) : new Date(),
      media: mediaData,
      // Add telugu content if it was successfully generated
      teluguTitle: teluguContent ? teluguContent.title : null,
      teluguNews: teluguContent ? teluguContent.news : null,
    });

    // 4. Save to the database
    await newArticle.save();

    res.status(201).json({
      message:
        "Successfully scraped, generated Telugu news, and saved the new article.",
      isNew: true,
      article: newArticle,
    });
  } catch (err) {
    console.error(`❌ Failed to process post URL ${url}:`, err);
    res.status(500).json({
      error: "Failed to fetch or process the post.",
      details: err.message,
    });
  }
});

app.get("/", (req, res) => res.send("Twitter scraper is running ✅"));

app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);
