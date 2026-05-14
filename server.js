const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/generate', async (req, res) => {
  const html = req.body.html;
  
  console.log('Received HTML:', html ? html.substring(0, 100) : 'EMPTY');
  
  if (!html) {
    return res.status(400).json({ error: 'HTML is empty' });
  }
  
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
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Running on port 3000'));
