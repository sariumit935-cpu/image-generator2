const express = require('express');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');

ffmpeg.setFfmpegPath(ffmpegStatic);

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

const MUSIC_URL = 'https://res.cloudinary.com/df1u8jqzy/video/upload/v1780299910/kutlama_abvxfs_cj39rm.mp3';

const FONT_LARGE = path.join(__dirname, 'fonts', 'open-sans-32-white.fnt');
const FONT_MEDIUM = path.join(__dirname, 'fonts', 'open-sans-16-white.fnt');

app.post('/generate', async (req, res) => {
  const text = req.body.html;
  if (!text) return res.status(400).json({ error: 'HTML is empty' });

  const tmpDir = '/tmp';
  const stamp = Date.now();
  const imgPath = path.join(tmpDir, `img_${stamp}.png`);
  const videoPath = path.join(tmpDir, `video_${stamp}.mp4`);
  const musicPath = path.join(tmpDir, `music_${stamp}.mp3`);

  try {
    const W = 1080, H = 1920;

    // Arka plan
    const img = new Jimp({ width: W, height: H, color: 0x0d0d0dff });

    // Kart arka planı (koyu gri dikdörtgen)
    const cardX = 65, cardY = 650, cardW = W - 130, cardH = 620;
    const card = new Jimp({ width: cardW, height: cardH, color: 0x1a1a1aff });
    img.composite(card, cardX, cardY);

    // Mesaj kutusu (beyaz)
    const msgX = 115, msgY = 720, msgW = cardW - 100, msgH = 380;
    const msgBox = new Jimp({ width: msgW, height: msgH, color: 0xf5f5f5ff });
    img.composite(msgBox, msgX, msgY);

    // Fontları yükle
    const fontLarge = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
    const fontMedium = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

    // Header yazısı
    img.print(fontMedium, 0, cardY + 35, {
      text: 'CONFESSION TIME',
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    }, W, 40);

    // Mesaj metni
    img.print(fontLarge, msgX + 30, msgY + 30, {
      text: text,
      alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
      alignmentY: Jimp.VERTICAL_ALIGN_TOP
    }, msgW - 60, msgH - 60);

    // Footer yazısı
    img.print(fontMedium, 0, cardY + cardH - 50, {
      text: '— anonymous confession —',
      alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE
    }, W, 40);

    await img.write(imgPath);

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
