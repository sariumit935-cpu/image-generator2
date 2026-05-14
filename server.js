const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const app = express();

app.use(express.json());

app.post('/generate', async (req, res) => {
  const { html } = req.body;
  
  try {
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1920 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    const page = await browser.newPage();
    await page.setContent(html);
    await new Promise(r => setTimeout(r, 500));
    const screenshot = await page.screenshot({ type: 'png' });
    await browser.close();
    res.set('Content-Type', 'image/png');
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Running on port 3000'));
