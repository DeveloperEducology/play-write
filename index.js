import express from "express";
import cors from "cors";
import mongoose from "mongoose";

// Import both scraper functions
import { scrapeUserTweets, scrapeSingleTweet } from "./scraper.js";



const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/twitter_scraper";

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
        url: { type: String, required: true, unique: true },
        source: { type: String, required: true },
        isCreatedBy: { type: String, required: true, default: "manual" },
        publishedAt: { type: Date },
        media: [{
            mediaType: {
                type: String,
                enum: ["image", "video_post", "youtube_video"],
            },
            url: { type: String },
        }, ],
    }, { timestamps: true }
);

const Article = mongoose.model("Article", ArticleSchema);

// --- Utility ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- API Routes ---

// ✅ --- CORRECTED ROUTE TO SCRAPE A USER'S TIMELINE --- ✅
app.get("/scrape-user", async (req, res) => {
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: "Username query parameter is required." });
    }

    try {
        const tweets = await scrapeUserTweets(username);

        const savedArticles = [];
        const skippedDuplicates = [];
        const skippedInvalid = [];

        for (const tweet of tweets) {
            // Validate that the tweet has a URL, which is our unique identifier
            if (!tweet.url) {
                console.warn("⚠️ Skipping tweet with no URL:", tweet);
                skippedInvalid.push(tweet);
                continue;
            }

            try {
                // Check for duplicate using the unique tweet URL
                const exists = await Article.findOne({ url: tweet.url });
                if (exists) {
                    skippedDuplicates.push(tweet.url);
                    continue;
                }

                // **FIXED:** Correctly format the media array from tweet.image
                const mediaData = tweet.image
                    ? [{ mediaType: "image", url: tweet.image }]
                    : [];

                // Create new article
                const article = new Article({
                    title: tweet.text.slice(0, 100),
                    summary: tweet.text.slice(0, 200),
                    body: tweet.text,
                    url: tweet.url, // Use the reliable URL from the scraper
                    source: username,
                    isCreatedBy: "twitter_scraper_user",
                    // **FIXED:** Use 'publishedAt' from scraper, not 'date'
                    publishedAt: tweet.publishedAt ? new Date(tweet.publishedAt) : new Date(),
                    media: mediaData,
                });

                await article.save();
                savedArticles.push(article);

            } catch (err) {
                console.error(`⚠️ Error saving tweet ${tweet.id}:`, err.message);
            }
            await delay(200); // Small delay to be polite to the DB
        }

        res.json({
            message: `Scraping for ${username} complete.`,
            savedCount: savedArticles.length,
            skippedDuplicatesCount: skippedDuplicates.length,
            skippedInvalidCount: skippedInvalid.length,
            savedArticles,
            skippedDuplicates,
        });

    } catch (err) {
        console.error(`❌ Failed to fetch tweets for ${username}:`, err);
        res.status(500).json({ error: "Failed to fetch or process user tweets.", details: err.message });
    }
});


// ✅ --- CORRECTED ROUTE TO SCRAPE A SINGLE POST --- ✅
app.get("/scrape-post", async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: "URL query parameter is required." });
    }

    const twitterStatusRegex = /^https?:\/\/(twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
    if (!twitterStatusRegex.test(url)) {
        return res.status(400).json({ error: "Invalid Twitter/X post URL provided." });
    }

    try {
        const existingArticle = await Article.findOne({ url });
        if (existingArticle) {
            return res.status(200).json({
                message: "Article already exists in the database.",
                isNew: false,
                article: existingArticle
            });
        }

        const tweet = await scrapeSingleTweet(url);

        if (!tweet) {
            return res.status(404).json({ error: "Could not find or scrape the specified post." });
        }

        const mediaData = tweet.image ? [{ mediaType: "image", url: tweet.image }] : [];
        const username = url.match(/(?:twitter|x)\.com\/(.*?)\/status/)[1] || 'unknown';

        const newArticle = new Article({
            title: tweet.text.slice(0, 100),
            summary: tweet.text.slice(0, 200),
            body: tweet.text,
            url: tweet.url,
            source: username,
            isCreatedBy: "twitter_scraper_single",
            publishedAt: tweet.publishedAt ? new Date(tweet.publishedAt) : new Date(),
            media: mediaData,
        });

        await newArticle.save();

        res.status(201).json({
            message: "Successfully scraped and saved the new article.",
            isNew: true,
            article: newArticle
        });

    } catch (err) {
        console.error(`❌ Failed to process post URL ${url}:`, err);
        res.status(500).json({ error: "Failed to fetch or process the post.", details: err.message });
    }
});


app.get("/", (req, res) => res.send("Twitter scraper is running ✅"));

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));

