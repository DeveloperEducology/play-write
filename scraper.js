// scraper.js
import { chromium } from "playwright";

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

  const page = await browser.newPage();

  const url = `https://twitter.com/search?q=${encodeURIComponent(query)}&src=typed_query`;

  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Wait for at least one tweet
  await page.waitForSelector("article");

  // Scroll a few times to load more tweets
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.scrollBy(0, window.innerHeight));
    await page.waitForTimeout(2000);
  }

  // Extract tweet texts
  const tweets = await page.$$eval("article div[lang]", nodes =>
    nodes.map(n => n.innerText)
  );

  await browser.close();
  return tweets.slice(0, 20); // Return first 20
}
