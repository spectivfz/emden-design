import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const url = process.argv[2] || 'http://localhost:3000';
const label = process.argv[3] ? `-${process.argv[3]}` : '';
const outDir = join(__dirname, 'temporary screenshots');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const existing = existsSync(outDir)
  ? readdirSync(outDir).filter(f => f.startsWith('screenshot-') && f.endsWith('.png')).length
  : 0;
const filename = `screenshot-${existing + 1}${label}.png`;
const outPath = join(outDir, filename);

// Try known puppeteer locations
const candidates = [
  'C:/Users/ellio/OneDrive/Desktop/Spectiv Media/Spectiv Claude Code Website Design/node_modules/puppeteer',
  `C:/Users/${process.env.USERNAME}/AppData/Local/Temp/puppeteer-test/node_modules/puppeteer`,
  join(__dirname, 'node_modules/puppeteer'),
];

let puppeteer;
for (const p of candidates) {
  if (existsSync(p)) {
    const mod = await import(`file:///${p.replace(/\\/g, '/')}/lib/esm/puppeteer/puppeteer.js`).catch(() => null)
      || await import(`file:///${p.replace(/\\/g, '/')}/lib/cjs/puppeteer/puppeteer.js`).catch(() => null);
    if (mod) { puppeteer = mod.default || mod; break; }
  }
}

if (!puppeteer) {
  puppeteer = (await import('puppeteer').catch(() => null))?.default;
}

if (!puppeteer) {
  console.error('Puppeteer not found. Install with: npm install puppeteer');
  process.exit(1);
}

const chromePaths = [
  'C:/Users/ellio/.cache/puppeteer/chrome/win64-148.0.7778.97/chrome-win64/chrome.exe',
  `C:/Users/${process.env.USERNAME}/.cache/puppeteer/chrome/win64-131.0.6778.204/chrome-win64/chrome.exe`,
];

const executablePath = chromePaths.find(p => existsSync(p));

const browser = await puppeteer.launch({
  headless: 'new',
  ...(executablePath ? { executablePath } : {}),
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: outPath, fullPage: false });
await browser.close();

console.log(`Saved: temporary screenshots/${filename}`);
