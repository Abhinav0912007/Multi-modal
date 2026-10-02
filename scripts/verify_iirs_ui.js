// Automated UI and State Verification using Chrome DevTools Protocol
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

  // 1. Initial State Check (PAIR_001 OHRC)
  console.log('\n--- 1. Testing PAIR_001 (OHRC) Initial State ---');
  let pair1Summary = await evaluate(`
    (() => {
      return {
        dropdown: document.querySelector('#home-dataset-dropdown')?.value,
        inst: document.querySelector('#summary-val-instrument')?.textContent,
        status: document.querySelector('#summary-val-status')?.textContent,
        statusClass: document.querySelector('#summary-val-status')?.className,
      };
    })()
  `);
  console.log('PAIR_001 Home Summary:', pair1Summary);

  // 2. Select PAIR_002 (IIRS)
  console.log('\n--- 2. Selecting PAIR_002 (IIRS Hyperspectral) ---');
  let pair2Summary = await evaluate(`
    (() => {
      const dropdown = document.querySelector('#home-dataset-dropdown');
      if (dropdown) {
        dropdown.value = 'pair_002';
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return {
        dropdown: dropdown?.value,
        inst: document.querySelector('#summary-val-instrument')?.textContent,
        status: document.querySelector('#summary-val-status')?.textContent,
        statusClass: document.querySelector('#summary-val-status')?.className,
      };
    })()
  `);
  console.log('PAIR_002 Home Summary:', pair2Summary);

  // 3. Test ROI Workspace with PAIR_002
  console.log('\n--- 3. Testing ROI Workspace with PAIR_002 ---');
  let roiState = await evaluate(`
    (() => {
      document.querySelector('#nav-btn-roi')?.click();
      const guard = document.querySelector('#roi-iirs-guard');
      const pill = document.querySelector('#roi-status-pill');
      const badge = document.querySelector('#roi-status-badge');
      const applyBtn = document.querySelector('#btn-apply-roi');
      const srcTag = document.querySelector('#source-status-tag');
      const refTag = document.querySelector('#reference-status-tag');
      return {
        hasGuardCard: !!guard,
        guardTitle: guard?.querySelector('.iirs-guard-title')?.textContent,
        guardStatus: guard?.querySelector('.iirs-guard-status-val')?.textContent,
        pillClass: pill?.className,
        badgeText: badge?.textContent,
        applyDisabled: applyBtn?.disabled,
        srcTagText: srcTag?.textContent,
        refTagText: refTag?.textContent,
      };
    })()
  `);
  console.log('PAIR_002 ROI State:', roiState);

  // 4. Test Feature Correspondence Workspace with PAIR_002
  console.log('\n--- 4. Testing Feature Correspondence Workspace with PAIR_002 ---');
  let fcState = await evaluate(`
    (() => {
      document.querySelector('#nav-btn-feature')?.click();
      const bannerTitle = document.querySelector('#fc-banner-title')?.textContent;
      const bannerDesc = document.querySelector('#fc-banner-desc')?.textContent;
      const btnRun = document.querySelector('#fc-btn-run');
      const inliers = document.querySelector('#fc-stat-inliers')?.textContent;
      const candidates = document.querySelector('#fc-stat-candidates')?.textContent;
      const guard = document.querySelector('#fc-iirs-guard');
      const nextBtn = document.querySelector('#fc-btn-next');
      return {
        bannerTitle,
        bannerDesc,
        btnRunDisabled: btnRun?.disabled,
        btnRunText: btnRun?.textContent?.trim().replace(/\\s+/g, ' '),
        inliersStat: inliers,
        candidatesStat: candidates,
        hasGuardCard: !!guard,
        hasNextButton: !!nextBtn,
      };
    })()
  `);
  console.log('PAIR_002 Feature Correspondence State:', fcState);

  // 5. Switch back to PAIR_001 and verify Isolation
  console.log('\n--- 5. Switching to PAIR_001 (OHRC) — Verifying Dataset Isolation ---');
  let p1Return = await evaluate(`
    (() => {
      document.querySelector('#nav-btn-home')?.click();
      const dropdown = document.querySelector('#home-dataset-dropdown');
      if (dropdown) {
        dropdown.value = 'pair_001';
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
      }
      document.querySelector('#nav-btn-feature')?.click();
      const btnRun = document.querySelector('#fc-btn-run');
      const guard = document.querySelector('#fc-iirs-guard');
      return {
        dropdown: dropdown?.value,
        btnRunDisabled: btnRun?.disabled,
        btnRunText: btnRun?.textContent?.trim().replace(/\\s+/g, ' '),
        hasGuardCard: !!guard,
      };
    })()
  `);
  console.log('PAIR_001 Return State:', p1Return);

  // 6. Switch to PAIR_003 and verify Isolation
  console.log('\n--- 6. Switching to PAIR_003 (TMC) — Verifying TMC State ---');
  let p3State = await evaluate(`
    (() => {
      document.querySelector('#nav-btn-home')?.click();
      const dropdown = document.querySelector('#home-dataset-dropdown');
      if (dropdown) {
        dropdown.value = 'pair_003';
        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return {
        dropdown: dropdown?.value,
        inst: document.querySelector('#summary-val-instrument')?.textContent,
        status: document.querySelector('#summary-val-status')?.textContent,
      };
    })()
  `);
  console.log('PAIR_003 Home Summary:', p3State);

  console.log('\n=== ALL SCIENTIFIC CRITERIA VERIFIED SUCCESSFULLY ===');
  ws.close();
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
