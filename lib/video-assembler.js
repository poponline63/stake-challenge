/**
 * video-assembler.js
 * Stitches wheel spin recording + gameplay recording into a vertical 9:16 TikTok video
 * with overlays (bankroll, game name, bet amount, day number)
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const OUTPUT_DIR = path.resolve(__dirname, '..', 'output');

function assembleVideo({ wheelVideoPath, gameVideoPath, gameName, betAmount, bankroll, day }) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const timestamp = Date.now();
  const outputPath = path.join(OUTPUT_DIR, `day${day}-${gameName.toLowerCase().replace(/\s+/g, '-')}-${timestamp}.mp4`);
  const tempWheel = path.join(OUTPUT_DIR, `temp-wheel-${timestamp}.mp4`);
  const tempGame = path.join(OUTPUT_DIR, `temp-game-${timestamp}.mp4`);
  const tempConcat = path.join(OUTPUT_DIR, `temp-concat-${timestamp}.mp4`);
  const concatFile = path.join(OUTPUT_DIR, `concat-${timestamp}.txt`);

  try {
    // Step 1: Convert wheel webm to mp4 (scaled to 1080x1920)
    console.log('Converting wheel recording...');
    execSync(
      `ffmpeg -y -i "${wheelVideoPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 23 -r 30 -an "${tempWheel}"`,
      { stdio: 'pipe', timeout: 120000 }
    );

    // Step 2: Convert game webm to mp4 (scaled to 1080x1920)
    console.log('Converting game recording...');
    execSync(
      `ffmpeg -y -i "${gameVideoPath}" -vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black" -c:v libx264 -preset fast -crf 23 -r 30 -an "${tempGame}"`,
      { stdio: 'pipe', timeout: 120000 }
    );

    // Step 3: Create concat file
    console.log('Stitching videos...');
    fs.writeFileSync(concatFile, `file '${tempWheel.replace(/\\/g, '/')}'\nfile '${tempGame.replace(/\\/g, '/')}'`);

    execSync(
      `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${tempConcat}"`,
      { stdio: 'pipe', timeout: 120000 }
    );

    // Step 4: Add overlays
    console.log('Adding overlays...');
    const bankrollText = `$${bankroll.toFixed(2)}`;
    const gameText = `${gameName} — $${betAmount.toFixed(2)}`;
    const dayText = `Day ${day}`;

    // Overlay filter: bankroll top-left, game+bet center-top, day top-right
    const overlayFilter = [
      // Background bars for readability
      `drawbox=x=0:y=0:w=iw:h=120:color=black@0.6:t=fill`,
      // Bankroll top-left
      `drawtext=text='💰 ${bankrollText}':fontsize=42:fontcolor=white:x=30:y=35:font=Arial:borderw=3:bordercolor=black`,
      // Game + bet center-top
      `drawtext=text='${gameText}':fontsize=38:fontcolor=gold:x=(w-text_w)/2:y=40:font=Arial:borderw=3:bordercolor=black`,
      // Day number top-right
      `drawtext=text='${dayText}':fontsize=42:fontcolor=white:x=w-text_w-30:y=35:font=Arial:borderw=3:bordercolor=black`,
      // Bottom branding bar
      `drawbox=x=0:y=ih-80:w=iw:h=80:color=black@0.6:t=fill`,
      `drawtext=text='Stake $1 Challenge':fontsize=36:fontcolor=gold:x=(w-text_w)/2:y=h-65:font=Arial:borderw=2:bordercolor=black`,
    ].join(',');

    execSync(
      `ffmpeg -y -i "${tempConcat}" -vf "${overlayFilter}" -c:v libx264 -preset fast -crf 20 -r 30 -an "${outputPath}"`,
      { stdio: 'pipe', timeout: 180000 }
    );

    console.log(`✅ Video assembled: ${outputPath}`);
    return outputPath;

  } finally {
    // Cleanup temp files
    [tempWheel, tempGame, tempConcat, concatFile].forEach(f => {
      try { fs.unlinkSync(f); } catch (e) {}
    });
  }
}

module.exports = { assembleVideo };
