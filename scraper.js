import { chromium } from "playwright";
import fs from "fs";

export async function scrapeTwitter(query) {
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
  const url = `https://twitter.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`; // live/latest tweets

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Wait for first tweets to load
  await page.waitForSelector("article", { timeout: 60000 });

  // Extract only the visible tweets
  const tweets = await page.$$eval("article", (articles) =>
    articles.map((article) => {
      const textNode = article.querySelector("div[lang]");
      const text = textNode ? textNode.innerText : "";

      const anchor = article.querySelector("a[href*='/status/']");
      const link = anchor ? "https://twitter.com" + anchor.getAttribute("href") : "";

      const imgNode = article.querySelector("img[src*='twimg']");
      const image = imgNode ? imgNode.src : null;

      const timeNode = article.querySelector("time");
      const publishedAt = timeNode ? timeNode.getAttribute("datetime") : null;

      return { text, link, image, publishedAt };
    })
  );

  await browser.close();
  return tweets.slice(0, 20); // only first 20 latest tweets
}
