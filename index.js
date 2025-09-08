// server.js
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

// --- API Routes ---

// Route to scrape a user's timeline
app.get("/scrape-user", async (req, res) => {
    // ... (this is your existing user tweets endpoint - no changes needed here)
    const { username } = req.query;
    if (!username) {
        return res.status(400).json({ error: "Username query parameter is required." });
    }
    try {
        const tweets = await scrapeUserTweets(username);
        // ... rest of the logic to save multiple tweets
        res.json({ message: `Scraping for ${username} complete.`, data: tweets });
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch user tweets.", details: err.message });
    }
});


// ✨ --- NEW API ENDPOINT TO SCRAPE A SINGLE POST --- ✨
app.get("/scrape-post", async (req, res) => {
    const { url } = req.query;
    if (!url) {
        return res.status(400).json({ error: "URL query parameter is required." });
    }

    // Basic URL validation
    const twitterStatusRegex = /^https?:\/\/(twitter|x)\.com\/[a-zA-Z0-9_]+\/status\/[0-9]+/;
    if (!twitterStatusRegex.test(url)) {
        return res.status(400).json({ error: "Invalid Twitter/X post URL provided." });
    }

    try {
        // Check if the article already exists in the DB
        const existingArticle = await Article.findOne({ url });
        if (existingArticle) {
            return res.status(200).json({
                message: "Article already exists in the database.",
                isNew: false,
                article: existingArticle
            });
        }

        // If it doesn't exist, scrape it
        const tweet = await scrapeSingleTweet(url);

        if (!tweet) {
            return res.status(404).json({ error: "Could not find or scrape the specified post." });
        }

        // Save the new article to the database
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
