const express = require('express');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

ffmpeg.setFfmpegPath(ffmpegStatic);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const MUSIC_URL = 'https://res.cloudinary.com/df1u8jqzy/video/upload/v1780299910/kutlama_abvxfs_cj39rm.mp3';

app.post('/generate', async (req, res) => {
  const text = req.body.html;

  if (!text) {
    return res.status(400).json({ error: 'HTML is empty' });
  }

  const fullHtml = `
    <html>
    <head>
      <meta charset="UTF-8">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Color+Emoji&display=swap">
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          width: 1080px;
          height: 1920px;
          background: #0d0d0d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: Arial, 'Noto Color Emoji', sans-serif;
        }
        .wrapper {
          width: 950px;
          background: #1a1a1a;
          border-radius: 50px;
          padding: 80px;
          position: relative;
          border: 2px solid #333;
        }
        .header {
          font-size: 28px;
          color: #888;
          margin-bottom: 40px;
          letter-spacing: 3px;
          text-transform: uppercase;
        }
        .message {
          background: #f5f5f5;
          border-radius: 30px;
          padding: 50px;
          position: relative;
        }
        .message p {
          font-size: 36px;
          color: #1a1a1a;
          line-height: 1.8;
          font-family: Arial, 'Noto Color Emoji', sans-serif;
        }
        .message::after {
          content: '';
          position: absolute;
          bottom: -25px;
          left: 50px;
          width: 0;
          height: 0;
          border-left: 25px solid transparent;
          border-right: 0 solid transparent;
          border-top: 25px solid #f5f5f5;
        }
        .footer {
          margin-top: 60px;
          font-size: 26px;
          color: #555;
          text-align: center;
          letter-spacing: 2px;
        }
      </style>
    </head>
    <body>
      <div class="wrapper">
        <div class="header">✉ Confession Time</div>
        <div class="message">
          <p>${text}</p>
        </div>
        <div class="footer">— anonymous confession —</div>
      </div>
    </body>
    </html>
  `;

  const tmpDir = '/tmp';
  const stamp = Date.now();
  const imgPath = path.join(tmpDir, `img_${stamp}.png`);
  const videoPath = path.join(tmpDir, `video_${stamp}.mp4`);
  const musicPath = path.join(tmpDir, `music_${stamp}.mp3`);

  let browser;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1080, height: 1920 },
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920 });
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 2000));

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: 1080, height: 1920 }
    });

    fs.writeFileSync(imgPath, screenshot);
    await browser.close();
    browser = null;

    // Müziği stream ile indir — arraybuffer yerine direkt diske yaz
    const musicRes = await axios.get(MUSIC_URL, {
      responseType: 'stream',
      timeout: 60000
    });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(musicPath);
      musicRes.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(imgPath)
        .inputOptions([
          '-loop 1',
          '-framerate 30'
        ])
        .input(musicPath)
        .inputOptions([
          '-stream_loop -1'
        ])
        .outputOptions([
          '-t 15',
          '-c:v libx264',
          '-preset veryfast',
          '-profile:v high',
          '-level 4.0',
          '-r 30',
          '-vf format=yuv420p,scale=1080:1920',
          '-c:a aac',
          '-b:a 128k',
          '-ar 44100',
          '-ac 2',
          '-movflags +faststart',
          '-shortest'
        ])
        .output(videoPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });

    // Video buffer yerine direkt stream — RAM'e yükleme
    const stat = fs.statSync(videoPath);
    res.set({
      'Content-Type': 'video/mp4',
      'Content-Length': stat.size,
      'Cache-Control': 'no-store'
    });
    fs.createReadStream(videoPath).pipe(res);

  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (browser) {
      try { await browser.close(); } catch (e) {}
    }

    [imgPath, videoPath, musicPath].forEach(f => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (e) {}
      }
    });
  }
});

app.get('/', (req, res) => {
  res.send('Image generator is running.');
});

app.listen(3000, () => console.log('Running on port 3000'));
