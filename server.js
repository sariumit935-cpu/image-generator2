const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.post('/generate', async (req, res) => {
  const html = req.body.html;
  
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
    await page.setViewport({ width: 1080, height: 1920 });
    await page.setContent(`
      <html>
        <head>
          <meta charset="UTF-8">
          <link href="https://fonts.googleapis.com/css2?family=Noto+Emoji&display=swap" rel="stylesheet">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              width: 1080px;
              height: 1920px;
              background: #0d0d0d;
              display: flex;
              align-items: center;
              justify-content: center;
              font-family: Arial, sans-serif;
            }
            .bubble {
              background: #f0f0f0;
              border-radius: 40px;
              padding: 60px;
              width: 900px;
              position: relative;
              box-shadow: 0 8px 40px rgba(0,0,0,0.5);
            }
            .bubble p {
              font-size: 38px;
              color: #1a1a1a;
              line-height: 1.7;
            }
            .bubble::after {
              content: '';
              position: absolute;
              bottom: -30px;
              left: 60px;
              width: 0;
              height: 0;
              border-left: 30px solid transparent;
              border-right: 0px solid transparent;
              border-top: 30px solid #f0f0f0;
            }
          </style>
        </head>
        <body>
          <div class="bubble">
            <p>${html}</p>
          </div>
        </body>
      </html>
    `);
    await new Promise(r => setTimeout(r, 1000));
    const screenshot = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920 } });
    await browser.close();
    res.set('Content-Type', 'image/png');
    res.send(screenshot);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(3000, () => console.log('Running on port 3000'));
