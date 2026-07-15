import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data", "ecommerce_orders_2024.csv");
const VIDEO_DIR = path.join(__dirname, "videos");
const BASE_URL = process.env.AEGIS_URL ?? "http://localhost:5173";

const CHAT_PROMPT =
  "I need a comprehensive sales intelligence analysis: filter to completed orders from Q1 2024 (Jan-Mar), compute profit_margin as (gross_revenue - shipping_cost) / gross_revenue, group by region and product_category with total revenue, average order value, and mean profit margin, sort by revenue descending, and create a bar chart of revenue by region, a heatmap of region vs category, and a line chart of monthly revenue trend.";

const FOLLOW_UP =
  "Ensure the pipeline uses compute_column, groupby_agg with multiple metrics, and at least two visualize steps including a heatmap.";

async function fillChatInput(page, text) {
  const chatInput = page.getByPlaceholder("What do you want to analyze?");
  await chatInput.click();
  await chatInput.fill(text);
  // React controlled input — verify Send enables; fallback to native setter
  const send = page.locator("button", { hasText: "Send" });
  if (await send.isDisabled()) {
    await chatInput.evaluate((el, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(el, value);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }, text);
  }
  await page.waitForFunction(
    () => {
      const btn = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Send");
      return btn && !btn.disabled;
    },
    undefined,
    { timeout: 10_000 },
  );
}

async function clickSend(page) {
  await page.locator("button", { hasText: "Send" }).click();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForChatReady(page, timeout = 180_000) {
  await page.waitForFunction(
    () => {
      const send = [...document.querySelectorAll("button")].find(
        (b) => b.textContent?.trim() === "Send",
      );
      const typing = document.querySelector(".animate-typing-dot");
      return send && !send.disabled && !typing;
    },
    undefined,
    { timeout },
  );
}

async function waitForPipelineNodes(page, minNodes = 3, timeout = 180_000) {
  await page.waitForFunction(
    (min) => document.querySelectorAll(".react-flow__node").length >= min,
    minNodes,
    { timeout },
  );
}

async function waitForResults(page, timeout = 120_000) {
  await page.getByText("result rows").waitFor({ timeout });
}

function findFfmpeg() {
  try {
    execSync("ffmpeg -version", { stdio: "ignore" });
    return "ffmpeg";
  } catch {
    const roots = [
      path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright"),
      path.join(process.env.USERPROFILE ?? "", "AppData", "Local", "ms-playwright"),
    ];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const stack = [root];
      while (stack.length) {
        const dir = stack.pop();
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) stack.push(full);
          else if (/^ffmpeg(\.exe)?$/i.test(entry.name)) return full;
        }
      }
    }
    return null;
  }
}

async function main() {
  if (!fs.existsSync(DATA_FILE)) {
    console.error(`Dataset missing: ${DATA_FILE}. Run: python demo/generate_dataset.py`);
    process.exit(1);
  }

  fs.mkdirSync(VIDEO_DIR, { recursive: true });

  console.log("Launching browser for demo recording...");
  const browser = await chromium.launch({
    headless: false,
    slowMo: 80,
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: VIDEO_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();
  page.setDefaultTimeout(180_000);

  try {
    // ── 1. Load app ──────────────────────────────────────────────
    console.log("Opening Aegis...");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await sleep(2000);

    // ── 2. Upload complex dataset ───────────────────────────────
    console.log("Uploading ecommerce dataset (600 rows, 16 columns)...");
    const fileInput = page.locator("#file-input");
    await fileInput.setInputFiles(DATA_FILE);

    await page.getByText(/600 rows/i).waitFor({ timeout: 60_000 });
    await page.getByText("order_id").waitFor({ timeout: 10_000 });
    await sleep(2500);

    // Collapse upload panel if visible
    const hideUpload = page.locator("header button", { hasText: "Hide Upload" });
    if (await hideUpload.isVisible().catch(() => false)) {
      await hideUpload.click();
      await sleep(1000);
    }

    // ── 3. Chat — complex analysis request ───────────────────────
    console.log("Sending complex analysis prompt...");
    await fillChatInput(page, CHAT_PROMPT);
    await sleep(500);
    await clickSend(page);

    console.log("Waiting for agent response (LLM streaming)...");
    try {
      await waitForChatReady(page);
    } catch {
      console.warn("Chat response timed out — continuing with pipeline generation");
    }
    await sleep(3000);

    // Follow-up (optional — skip if chat still busy)
    const sendBtn = page.locator("button", { hasText: "Send" });
    if (await sendBtn.isEnabled().catch(() => false)) {
      console.log("Sending follow-up refinement...");
      await fillChatInput(page, FOLLOW_UP);
      await clickSend(page);
      try {
        await waitForChatReady(page);
      } catch {
        console.warn("Follow-up timed out — continuing");
      }
      await sleep(2000);
    }

    // ── 4. Generate pipeline ─────────────────────────────────────
    console.log("Generating pipeline...");
    await page.getByRole("button", { name: "Generate Pipeline" }).click();
    await page.getByText("Pipeline generated!").waitFor({ timeout: 180_000 });
    await waitForPipelineNodes(page, 4);
    await sleep(3000);

    // Pan/zoom canvas to show full DAG
    const canvas = page.locator(".react-flow");
    await canvas.hover();
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, -120);
      await sleep(400);
    }
    await sleep(1500);

    // ── 5. Inspect a pipeline step ───────────────────────────────
    console.log("Inspecting pipeline step editor...");
    const firstNode = page.locator(".react-flow__node").first();
    await firstNode.click();
    await page.getByText("Edit Step").waitFor({ timeout: 10_000 });
    await sleep(2500);
    await page.locator("button", { hasText: "×" }).first().click();
    await sleep(800);

    // Click a visualize node if present
    const vizNode = page.locator(".react-flow__node").filter({ hasText: /visualize|chart|revenue|heatmap/i }).first();
    if (await vizNode.count()) {
      await vizNode.click();
      await sleep(2000);
      await page.locator("button", { hasText: "×" }).first().click();
      await sleep(800);
    }

    // ── 6. Run pipeline ──────────────────────────────────────────
    console.log("Running pipeline...");
    await page.getByRole("button", { name: "Run Pipeline" }).click();
    await waitForResults(page);
    await sleep(2000);

    // ── 7. Showcase results ──────────────────────────────────────
    console.log("Showcasing execution logs and charts...");
    await page.getByText("Execution Log").scrollIntoViewIfNeeded();
    await sleep(2500);

    await page.getByText("Charts").scrollIntoViewIfNeeded();
    await sleep(3000);

    await page.getByText("Data Preview").scrollIntoViewIfNeeded();
    await sleep(2500);

    // Scroll back up to show full layout
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(2000);

    console.log("Demo flow complete.");
  } catch (err) {
    console.error("Recording failed:", err);
    throw err;
  } finally {
    const video = page.video();
    await context.close();
    await browser.close();

    if (video) {
      const webmPath = await video.path();
      const finalWebm = path.join(__dirname, "aegis-demo.webm");
      fs.copyFileSync(webmPath, finalWebm);
      console.log(`Saved: ${finalWebm}`);

      const ffmpeg = findFfmpeg();
      if (ffmpeg) {
        const mp4Path = path.join(__dirname, "aegis-demo.mp4");
        console.log("Converting to MP4...");
        execSync(
          `"${ffmpeg}" -y -i "${finalWebm}" -c:v libx264 -preset fast -crf 22 -pix_fmt yuv420p "${mp4Path}"`,
          { stdio: "inherit" },
        );
        console.log(`Saved: ${mp4Path}`);
      } else {
        console.log("ffmpeg not found — deliverable is aegis-demo.webm");
      }
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
