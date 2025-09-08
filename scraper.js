// scraper.js
import { chromium } from "playwright";
import fs from "fs";

const STORAGE_PATH = "/run/secrets/storageState.json"; // secret file in Render

export async function scrapeUserTweets(username) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });

  const context = fs.existsSync("storageState.json")
    ? await browser.newContext({ storageState: "storageState.json" })
    : await browser.newContext();

  const page = await context.newPage();
  const url = `https://twitter.com/${username}`;

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for the first tweets to appear
  await page.waitForSelector("article", { timeout: 60000 });

  // Extract tweets
  const tweets = await page.$$eval("article", (articles) =>
    articles
      .map((article) => {
        if (article.querySelector('svg[aria-label="Retweeted"]')) return null;
        if (article.querySelector('div[aria-label*="Replying to"]')) return null;

        const textNode = article.querySelector("div[lang]");
        const text = textNode ? textNode.innerText : "";

        const anchor = article.querySelector("a[href*='/status/']");
        const url = anchor ? "https://twitter.com" + anchor.getAttribute("href") : "";

        const imgNode = article.querySelector("img[src*='twimg']");
        const image = imgNode ? imgNode.src : null;

        const timeNode = article.querySelector("time");
        const publishedAt = timeNode ? timeNode.getAttribute("datetime") : null;

        // ✅ Extract ID from the url if available
        let id = null;
        if (url) {
          const match = url.match(/status\/(\d+)/);
          if (match) id = match[1];
        }

        return { id, text, url, image, publishedAt };
      })
      .filter(Boolean)
  );

  await browser.close();
  return tweets.slice(0, 20);
}
