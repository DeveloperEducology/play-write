import { chromium } from "playwright";
import fs from "fs";

const STORAGE_PATH = "/run/secrets/storageState.json"; // secret file in Render

export async function scrapeUserTweets(username) {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]
  });

  const context = fs.existsSync(STORAGE_PATH)
    ? await browser.newContext({ storageState: STORAGE_PATH })
    : await browser.newContext();

  const page = await context.newPage();
  const url = `https://twitter.com/${username}`;

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("article", { timeout: 60000 });

    // Scroll a bit
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await page.waitForTimeout(1500);
    }

    const tweets = await page.$$eval("article", (articles) =>
      articles
        .map((article) => {
          if (article.querySelector('svg[aria-label="Retweeted"]')) return null;
          if (article.querySelector('div[aria-label*="Replying to"]')) return null;

          const textNode = article.querySelector("div[lang]");
          const text = textNode ? textNode.innerText : "";

          const anchor = article.querySelector("a[href*='/status/']");
          const link = anchor ? "https://twitter.com" + anchor.getAttribute("href") : "";

          const imgNodes = Array.from(article.querySelectorAll("img[src*='twimg']"));
          const images = imgNodes.map(img => img.src);

          const timeNode = article.querySelector("time");
          const publishedAt = timeNode ? timeNode.getAttribute("datetime") : null;

          return { text, link, images, publishedAt };
        })
        .filter(Boolean)
    );

    return tweets.slice(0, 20);
  } catch (err) {
    console.error("❌ Error scraping tweets:", err);
    return [];
  } finally {
    await browser.close();
  }
}
