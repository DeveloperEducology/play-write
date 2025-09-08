// server.js
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import { scrapeUserTweets } from "./scraper.js"; // <-- your scraper function

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

// --- Utility ---
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- API Routes ---
app.get("/user-tweets", async (req, res) => {
  const username = req.query.username;
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
      try {
        // Always build the tweet link as url
        if (!tweet.id) {
          console.warn("⚠️ Skipping tweet with no ID:", tweet);
          skippedInvalid.push(tweet);
          continue;
        }

        const tweetUrl = `https://twitter.com/${username}/status/${tweet.id}`;

        // Check for duplicate
        const exists = await Article.findOne({ url: tweetUrl });
        if (exists) {
          skippedDuplicates.push(tweetUrl);
          continue;
        }

        // Create new article
        const article = new Article({
          title: tweet.text?.slice(0, 100) || "Untitled",
          summary: tweet.text?.slice(0, 200) || "",
          body: tweet.text,
          url: tweetUrl, // ✅ always stored as Twitter link
          source: username,
          isCreatedBy: "twitter_scraper",
          publishedAt: tweet.date ? new Date(tweet.date) : new Date(),
          media: tweet.media || [],
        });

        await article.save();
        savedArticles.push(article);
      } catch (err) {
        console.error("⚠️ Error saving tweet:", err.message);
      }

      await delay(300); // avoid overload
    }

    res.json({
      username,
      savedCount: savedArticles.length,
      skippedDuplicatesCount: skippedDuplicates.length,
      skippedInvalidCount: skippedInvalid.length,
      savedArticles,
      skippedDuplicates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tweets." });
  }
});

app.get("/", (req, res) => res.send("Twitter scraper running ✅"));

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
