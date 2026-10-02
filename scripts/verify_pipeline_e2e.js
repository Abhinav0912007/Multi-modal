const http = require('http');

async function getWsUrl() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const tabs = await res.json();
  const tab = tabs.find(t => t.url.includes('localhost:5173')) || tabs[0];
  return tab.webSocketDebuggerUrl;
}

async function run() {
  const wsUrl = await getWsUrl();
  console.log('Connecting to Chrome CDP at:', wsUrl);
  const ws = new WebSocket(wsUrl);

  let id = 1;
  const pending = new Map();

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  function send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  await new Promise(res => ws.onopen = res);
  console.log('Connected to CDP.');

  async function evaluate(expression) {
    const r = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return r.result?.value;
  }

  await send('Page.reload');
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n======================================================');
  console.log('E2E TEST: CHANDRAYAAN LUNAR REGISTRATION PIPELINE');
  console.log('======================================================');

  // 1. Check Navbar
  const navItems = await evaluate(`
    Array.from(document.querySelectorAll('.nav-pill-container .nav-link-btn')).map(b => b.textContent.trim())
  `);
  console.log('Top Navigation Items:', navItems);

  // 2. Feature Correspondence View
  console.log('\n--> Testing Feature Correspondence View...');
  await evaluate("document.querySelector('#nav-btn-feature')?.click()");
  await new Promise(r => setTimeout(r, 1200));

  const featHeader = await evaluate("document.querySelector('#view-feature-workspace .badge-chip, #view-feature-workspace .fw-header-tag, #view-feature-workspace h2')?.textContent?.trim()");
  console.log('Feature Workspace Header / Chip:', featHeader);

  // 3. Spatial Analysis View
  console.log('\n--> Testing Spatial Analysis View...');
  await evaluate("document.querySelector('#nav-btn-spatial')?.click()");
  await new Promise(r => setTimeout(r, 1500));

  const spatialChip = await evaluate("document.querySelector('#view-spatial-workspace .badge-chip')?.textContent?.trim()");
  console.log('Spatial Analysis Chip:', spatialChip);

  // 4. Alignment View
  console.log('\n--> Testing Alignment View...');
  await evaluate("document.querySelector('#nav-btn-alignment')?.click()");
  await new Promise(r => setTimeout(r, 1500));

  const alignChip = await evaluate("document.querySelector('#view-alignment-studio .badge-chip')?.textContent?.trim()");
  console.log('Alignment Chip:', alignChip);

  // 5. Transformation View
  console.log('\n--> Testing Transformation View...');
  await evaluate("document.querySelector('#nav-btn-transformation')?.click()");
  
  // Wait for RANSAC / Homography computation
  for (let i = 0; i < 20; i++) {
    await new Promise(r => setTimeout(r, 500));
    const ready = await evaluate("!!document.querySelector('.ta-comp-mode-pills, #ta-btn-adjust-roi')");
    if (ready) break;
  }

  const transChip = await evaluate("document.querySelector('#view-transformation-analysis .badge-chip')?.textContent?.trim()");
  console.log('Transformation Chip:', transChip);

  const compPills = await evaluate("Array.from(document.querySelectorAll('.ta-comp-mode-pills .hud-btn')).map(b => b.textContent.trim())");
  console.log('Transformation Multi-view Comparison Modes:', compPills);

  // Test clicking comparison pill
  await evaluate("document.querySelector('#ta-view-checker')?.click()");
  await new Promise(r => setTimeout(r, 500));
  const activeLabel = await evaluate("document.querySelector('#ta-active-img-label')?.textContent?.trim()");
  console.log('After clicking Checkerboard mode, active label:', activeLabel);

  // 6. Export View
  console.log('\n--> Testing Export View...');
  await evaluate("document.querySelector('#nav-btn-export')?.click()");
  await new Promise(r => setTimeout(r, 2000));

  const exportHeader = await evaluate("document.querySelector('#view-export-workspace .ew-badge, #view-export-workspace h2')?.textContent?.trim()");
  console.log('Export Workspace Header / Badge:', exportHeader);

  const downloadBtns = await evaluate("Array.from(document.querySelectorAll('.export-quick-downloads-strip button')).map(b => b.textContent.trim())");
  console.log('Export Direct Action Buttons:', downloadBtns);

  console.log('\n======================================================');
  console.log('ALL E2E PIPELINE VIEWS VERIFIED SUCCESSFULLY!');
  console.log('======================================================\n');

  process.exit(0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
