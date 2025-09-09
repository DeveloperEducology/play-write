// scraper.js
import { chromium } from "playwright";
import fs from "fs";

const STORAGE_PATH = "/run/secrets/storageState.json"; // secret file in Render


const launchBrowser = () => chromium.launch({
    headless: true,
    args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
    ],
});

export async function scrapeUserTweets(username) {
    const browser = await launchBrowser();
    const context = fs.existsSync(STORAGE_PATH)
        ? await browser.newContext({ storageState: STORAGE_PATH })
        : await browser.newContext();

    const page = await context.newPage();
    const url = `https://twitter.com/${username}`;

    console.log(`Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await page.waitForSelector('div[aria-label^="Timeline"]', { timeout: 60000 });
    await page.waitForSelector("article", { timeout: 60000 });
    console.log("Tweets loaded. Starting extraction...");

    const tweets = await page.$$eval("article", (articles) =>
        articles
        .map((article) => {
            if (article.querySelector('div[data-testid="socialContext"]')) return null;
            if (article.querySelector('div[aria-label*="Replying to"]')) return null;

            const textNode = article.querySelector('div[data-testid="tweetText"]');
            const text = textNode ? textNode.innerText : "";

            const anchor = Array.from(article.querySelectorAll("a")).find(a => a.href.includes('/status/'));
            const url = anchor ? "https://twitter.com" + anchor.getAttribute("href") : "";

            const imgNode = article.querySelector('div[data-testid="tweetPhoto"] img');
            const image = imgNode ? imgNode.src : null;

            const timeNode = article.querySelector("time");
            const publishedAt = timeNode ? timeNode.getAttribute("datetime") : null;

            let id = null;
            if (url) {
                const match = url.match(/status\/(\d+)/);
                if (match) id = match[1];
            }

            if (!id || !text) return null;

            return { id, text, url, image, publishedAt };
        })
        .filter(Boolean)
    );

    console.log(`Found ${tweets.length} tweets.`);
    await browser.close();
    return tweets.slice(0, 20);
}

// ✨ --- NEW FUNCTION TO SCRAPE A SINGLE POST --- ✨
export async function scrapeSingleTweet(tweetUrl) {
    const browser = await launchBrowser();
    const context = fs.existsSync(STORAGE_PATH)
        ? await browser.newContext({ storageState: STORAGE_PATH })
        : await browser.newContext();
    const page = await context.newPage();

    console.log(`Navigating to single tweet: ${tweetUrl}`);
    await page.goto(tweetUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    try {
        // Wait for the main tweet article to be visible
        await page.waitForSelector('article[data-testid="tweet"]', { timeout: 60000 });

        // Extract data from the single tweet
        const tweetData = await page.$eval('article[data-testid="tweet"]', (article) => {
            const textNode = article.querySelector('div[data-testid="tweetText"]');
            const text = textNode ? textNode.innerText : "";

            const imgNode = article.querySelector('div[data-testid="tweetPhoto"] img');
            const image = imgNode ? imgNode.src : null;

            const timeNode = article.querySelector("time");
            const publishedAt = timeNode ? timeNode.getAttribute("datetime") : null;

            return { text, image, publishedAt };
        });

        // Extract ID from the URL
        const match = tweetUrl.match(/status\/(\d+)/);
        const id = match ? match[1] : null;

        if (!id || !tweetData.text) {
             console.warn("Could not extract complete data for the tweet.");
             return null;
        }

        await browser.close();
        return {
            id,
            url: tweetUrl,
            ...tweetData
        };
    } catch (error) {
        console.error(`Failed to scrape single tweet: ${error.message}`);
        await browser.close();
        return null;
    }
}