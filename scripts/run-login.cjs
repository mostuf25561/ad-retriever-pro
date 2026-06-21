const fs = require('fs');
const path = require('path');
const url = 'http://localhost:7070/login';
(async () => {
  try {
    const file = path.resolve(__dirname, 'yad2-login.json');
    const bodyObj = JSON.parse(fs.readFileSync(file, 'utf8'));

    // Load .env and use credentials if the request file doesn't include them
    const envPath = path.resolve(__dirname, '..', '.env');
    let env = {};
    try {
      const envText = fs.readFileSync(envPath, 'utf8');
      for (const line of envText.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        env[key] = val;
      }
    } catch (e) {
      // ignore
    }
    if (!bodyObj.loginUrl && env.LOGIN_URL) bodyObj.loginUrl = env.LOGIN_URL;
    if (!bodyObj.user && env.USER) bodyObj.user = env.USER;
    if (!bodyObj.password && env.PASSWORD) bodyObj.password = env.PASSWORD;

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj),
    });
    const text = await res.text();

    const artifactsDir = path.resolve(__dirname, 'login-artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });

    const result = {
      status: res.status,
      ok: res.ok,
      body: null,
      artifacts: []
    };

    try {
      const payload = JSON.parse(text);
      result.body = payload;
      const responseFile = path.resolve(artifactsDir, 'login-response.json');
      fs.writeFileSync(responseFile, JSON.stringify(payload, null, 2), 'utf8');
      result.artifacts.push(responseFile);

      if (typeof payload.html === 'string') {
        const htmlFile = path.resolve(artifactsDir, 'login-page.html');
        fs.writeFileSync(htmlFile, payload.html, 'utf8');
        result.artifacts.push(htmlFile);
      }

      if (typeof payload.screenshot === 'string' && payload.screenshot.startsWith('data:image/png;base64,')) {
        const screenshotData = payload.screenshot.replace(/^data:image\/png;base64,/, '');
        const screenshotFile = path.resolve(artifactsDir, 'login-screenshot.png');
        fs.writeFileSync(screenshotFile, screenshotData, 'base64');
        result.artifacts.push(screenshotFile);
      }

      if (Array.isArray(payload.logs)) {
        const logsFile = path.resolve(artifactsDir, 'login-logs.txt');
        fs.writeFileSync(logsFile, payload.logs.join('\n'), 'utf8');
        result.artifacts.push(logsFile);
      }

      console.log(JSON.stringify(result, null, 2));
    } catch (e) {
      const rawFile = path.resolve(artifactsDir, 'login-response.raw.txt');
      fs.writeFileSync(rawFile, text, 'utf8');
      result.body = { error: 'non-json response', raw: text.slice(0, 1000) };
      result.artifacts.push(rawFile);
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (e) {
    console.error('error:', e && e.stack ? e.stack : String(e));
    process.exit(1);
  }
})();
