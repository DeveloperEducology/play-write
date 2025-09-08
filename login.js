import { chromium } from "playwright";

(async () => {
  const browser = await chromium.launch({ headless: false }); // not headless so you can enter login manually
  const page = await browser.newPage();

  await page.goto("https://twitter.com/login");

  console.log("👉 Please log in manually in the browser window...");

  // Wait until logged in (profile avatar shows up)
  await page.waitForSelector('a[href="/home"]', { timeout: 120000 });

  // Save cookies + localStorage
  await page.context().storageState({ path: "storageState.json" });

  console.log("✅ Session saved to storageState.json");

  await browser.close();
})();
