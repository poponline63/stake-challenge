/**
 * bust-animation.js
 * Plays a dramatic "BUSTED" fire explosion animation for the TikTok video
 * Records it as a video clip in recordings/
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const RECORDINGS_DIR = path.resolve(__dirname, '..', 'recordings');

async function playBustAnimation(dayNumber, ath) {
  fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ['--start-fullscreen'],
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    recordVideo: {
      dir: RECORDINGS_DIR,
      size: { width: 1920, height: 1080 },
    },
  });

  const page = await context.newPage();

  // Build the bust animation as an inline HTML page
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body {
      background: #0a0a0f;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .container {
      text-align: center;
      position: relative;
      z-index: 10;
    }

    /* Fire particles */
    .particles {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 1;
    }

    .particle {
      position: absolute;
      border-radius: 50%;
      animation: particleFly linear forwards;
    }

    @keyframes particleFly {
      0% { 
        transform: translate(0, 0) scale(1); 
        opacity: 1; 
      }
      100% { 
        transform: translate(var(--tx), var(--ty)) scale(0); 
        opacity: 0; 
      }
    }

    /* Screen shake */
    @keyframes shake {
      0%, 100% { transform: translate(0, 0); }
      10% { transform: translate(-15px, -8px); }
      20% { transform: translate(12px, 10px); }
      30% { transform: translate(-10px, 5px); }
      40% { transform: translate(8px, -12px); }
      50% { transform: translate(-5px, 8px); }
      60% { transform: translate(10px, -5px); }
      70% { transform: translate(-8px, -10px); }
      80% { transform: translate(5px, 8px); }
      90% { transform: translate(-12px, -5px); }
    }

    .shaking {
      animation: shake 0.5s ease-in-out 3;
    }

    /* Flash */
    .flash-overlay {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      background: #ef4444;
      opacity: 0;
      z-index: 100;
      pointer-events: none;
      animation: flashBang 0.8s ease-out 0.2s forwards;
    }

    @keyframes flashBang {
      0% { opacity: 0.9; }
      100% { opacity: 0; }
    }

    /* BUSTED text */
    .busted-text {
      font-family: 'Orbitron', monospace;
      font-size: 140px;
      font-weight: 900;
      color: #ef4444;
      text-shadow: 
        0 0 40px #ef444488,
        0 0 80px #ef444444,
        0 0 120px #ef444422,
        0 4px 0 #dc2626,
        0 8px 0 #b91c1c;
      opacity: 0;
      transform: scale(3);
      animation: bustSlam 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) 0.3s forwards;
      letter-spacing: 12px;
    }

    @keyframes bustSlam {
      0% { opacity: 0; transform: scale(3); }
      60% { opacity: 1; transform: scale(0.9); }
      80% { transform: scale(1.05); }
      100% { opacity: 1; transform: scale(1); }
    }

    /* Skull */
    .skull {
      font-size: 100px;
      opacity: 0;
      animation: skullAppear 0.5s ease-out 1s forwards;
      filter: drop-shadow(0 0 30px #ef444466);
    }

    @keyframes skullAppear {
      0% { opacity: 0; transform: translateY(30px) rotate(-10deg); }
      100% { opacity: 1; transform: translateY(0) rotate(0deg); }
    }

    /* Stats */
    .stats {
      opacity: 0;
      animation: fadeUp 0.6s ease-out 1.5s forwards;
      margin-top: 30px;
    }

    @keyframes fadeUp {
      0% { opacity: 0; transform: translateY(20px); }
      100% { opacity: 1; transform: translateY(0); }
    }

    .stat-line {
      font-family: 'Orbitron', monospace;
      font-size: 28px;
      color: #94a3b8;
      margin: 8px 0;
    }

    .stat-line .value {
      color: #f59e0b;
      font-weight: 700;
    }

    .stat-line .red {
      color: #ef4444;
    }

    /* Fire border glow */
    .fire-border {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none;
      z-index: 5;
      box-shadow: inset 0 0 100px #ef444466, inset 0 0 200px #ef444422;
      animation: firePulse 1s ease-in-out infinite alternate;
    }

    @keyframes firePulse {
      0% { box-shadow: inset 0 0 80px #ef444444, inset 0 0 160px #ef444411; }
      100% { box-shadow: inset 0 0 120px #ef444466, inset 0 0 240px #ef444433; }
    }

    /* Restart text */
    .restart {
      opacity: 0;
      animation: fadeUp 0.6s ease-out 2.5s forwards;
      margin-top: 40px;
    }

    .restart-text {
      font-family: 'Orbitron', monospace;
      font-size: 22px;
      color: #10b981;
      letter-spacing: 4px;
    }
  </style>
  </head>
  <body>
    <div class="flash-overlay"></div>
    <div class="fire-border"></div>
    <div class="particles" id="particles"></div>
    
    <div class="container shaking">
      <div class="busted-text">BUSTED</div>
      <div class="skull">💀🔥💀</div>
      <div class="stats">
        <div class="stat-line">Survived <span class="value">${dayNumber}</span> days</div>
        <div class="stat-line">All-Time High: <span class="value">$${ath.toFixed(2)}</span></div>
        <div class="stat-line">Final Balance: <span class="red">$0.00</span></div>
      </div>
      <div class="restart">
        <div class="restart-text">♻️ RESETTING TO $1.00...</div>
      </div>
    </div>

    <script>
      // Spawn fire/explosion particles
      const container = document.getElementById('particles');
      const colors = ['#ef4444', '#f97316', '#f59e0b', '#fbbf24', '#dc2626', '#ff6b35'];
      
      function spawnParticles(count, delay) {
        setTimeout(() => {
          for (let i = 0; i < count; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            const size = 4 + Math.random() * 16;
            const angle = Math.random() * Math.PI * 2;
            const distance = 200 + Math.random() * 600;
            const tx = Math.cos(angle) * distance;
            const ty = Math.sin(angle) * distance;
            const duration = 0.8 + Math.random() * 1.5;
            
            p.style.cssText = \`
              width: \${size}px;
              height: \${size}px;
              background: \${colors[Math.floor(Math.random() * colors.length)]};
              left: 50%;
              top: 50%;
              --tx: \${tx}px;
              --ty: \${ty}px;
              animation-duration: \${duration}s;
              animation-delay: \${Math.random() * 0.3}s;
              box-shadow: 0 0 \${size}px \${colors[Math.floor(Math.random() * colors.length)]};
            \`;
            container.appendChild(p);
          }
        }, delay);
      }
      
      // Multiple waves of particles
      spawnParticles(80, 200);   // Initial explosion
      spawnParticles(50, 600);   // Second wave
      spawnParticles(30, 1200);  // Aftershock
    </script>
  </body>
  </html>
  `;

  await page.setContent(html, { waitUntil: 'load' });
  
  // Wait for fonts to load
  await page.waitForTimeout(2000);
  
  // Let the full animation play out
  await page.waitForTimeout(4000);

  // Finalize video
  const video = page.video();
  await page.close();
  await context.close();

  const videoPath = await video.path();
  await browser.close();

  const finalPath = path.join(RECORDINGS_DIR, `bust-animation-${Date.now()}.webm`);
  if (fs.existsSync(videoPath)) {
    fs.renameSync(videoPath, finalPath);
  }

  return finalPath;
}

module.exports = { playBustAnimation };
