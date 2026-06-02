const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createCanvas, registerFont } = require('canvas');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const MUSIC_URL = 'https://res.cloudinary.com/df1u8jqzy/video/upload/v1780299910/kutlama_abvxfs_cj39rm.mp3';

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    const test = current ? current + ' ' + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

app.post('/generate', async (req, res) => {
  const text = req.body.html;
  if (!text) return res.status(400).json({ error: 'HTML is empty' });

  const tmpDir = '/tmp';
  const stamp = Date.now();
  const imgPath = path.join(tmpDir, `img_${stamp}.png`);
  const videoPath = path.join(tmpDir, `video_${stamp}.mp4`);
  const musicPath = path.join(tmpDir, `music_${stamp}.mp3`);

  try {
    // Canvas ile görsel oluştur
    const W = 1080, H = 1920;
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');

    // Arka plan
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    // Wrapper kart
    const padX = 65, cardY = 680, cardW = W - padX * 2, cardH = 560;
    ctx.fillStyle = '#1a1a1a';
    drawRoundedRect(ctx, padX, cardY, cardW, cardH, 50);
    ctx.fill();
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Header
    ctx.fillStyle = '#888888';
    ctx.font = '28px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('✉  CONFESSION TIME', W / 2, cardY + 70);

    // Mesaj kutusu
    const msgX = padX + 50, msgY = cardY + 110, msgW = cardW - 100, msgH = 340;
    ctx.fillStyle = '#f5f5f5';
    drawRoundedRect(ctx, msgX, msgY, msgW, msgH, 30);
    ctx.fill();

    // Mesaj metni
    ctx.fillStyle = '#1a1a1a';
    ctx.font = '34px Arial';
    ctx.textAlign = 'left';
    const lines = wrapText(ctx, text, msgW - 80);
    const lineHeight = 52;
    const totalTextH = lines.length * lineHeight;
    let textY = msgY + (msgH - totalTextH) / 2 + 34;
    for (const line of lines) {
      ctx.fillText(line, msgX + 40, textY);
      textY += lineHeight;
    }

    // Footer
    ctx.fillStyle = '#555555';
    ctx.font = '26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('— anonymous confession —', W / 2, cardY + cardH - 30);

    // PNG kaydet
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(imgPath, buffer);

    // Müzik indir
    const musicRes = await axios.get(MUSIC_URL, { responseType: 'stream', timeout: 60000 });
    await new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(musicPath);
      musicRes.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Video oluştur
    await new Promise((resolve, reject) => {
      ffmpeg()
        .input(imgPath)
        .inputOptions(['-loop 1', '-framerate 30'])
        .input(musicPath)
        .inputOptions(['-stream_loop -1'])
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
    [imgPath, videoPath, musicPath].forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) {}
    });
  }
});

app.get('/', (req, res) => res.send('Image generator is running.'));
app.listen(3000, () => console.log('Running on port 3000'));
