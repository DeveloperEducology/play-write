import express from "express";
import cors from "cors";
import { scrapeUserTweets } from "./scraper.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get("/user-tweets", async (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ error: "Username query parameter is required." });

  try {
    const tweets = await scrapeUserTweets(username);
    res.json({ username, tweets });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch tweets." });
  }
});

app.get("/", (req, res) => res.send("Twitter scraper running ✅"));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
