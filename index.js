// index.js
import express from "express";
import { scrapeTwitter } from "./scraper.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("✅ Twitter Scraper API running");
});

app.get("/scrape", async (req, res) => {
  try {
    const query = req.query.q || "playwright";
    const tweets = await scrapeTwitter(query);
    res.json({ query, tweets });
  } catch (err) {
    console.error("❌ Error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
