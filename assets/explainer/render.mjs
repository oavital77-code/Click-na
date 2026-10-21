// usage: node render.mjs <html> <outdir> stills t1,t2,...   |   node render.mjs <html> <out.mp4> video <fps> <audio> <ffmpeg>
import { chromium } from "playwright-core";
import { spawn } from "node:child_process";
const [, , html, out, mode, a, audio, ffmpeg] = process.argv;
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.goto("file://" + html);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(300);
if (mode === "stills") {
  for (const t of a.split(",").map(Number)) {
    await page.evaluate((t) => window.render(t), t);
    await page.screenshot({ path: `${out}/still-${String(t).padStart(5, "0")}.png` });
  }
} else {
  const fps = Number(a);
  const duration = await page.evaluate(() => window.DURATION);
  const frames = Math.round(duration * fps);
  const ff = spawn(ffmpeg, ["-y", "-f", "image2pipe", "-framerate", String(fps), "-i", "-", "-i", audio,
    "-c:v", "libx264", "-preset", "slow", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-c:a", "aac", "-b:a", "128k", "-af", "apad", "-shortest", out], { stdio: ["pipe", "inherit", "inherit"] });
  for (let i = 0; i < frames; i++) {
    await page.evaluate((t) => window.render(t), i / fps);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 150 === 0) console.error(`frame ${i}/${frames}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
}
await browser.close();
