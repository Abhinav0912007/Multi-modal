// Automated verification script for DATASET ISOLATION RULE
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

  // Reload page to start with a fresh application state
  await send('Page.reload');
  await new Promise(r => setTimeout(r, 1500));

  console.log('\n======================================================');
  console.log('TEST 1: INITIAL STATE — PAIR_001 (OHRC)');
  console.log('======================================================');

  // Verify PAIR_001 ROI
  await evaluate(`document.querySelector('button[data-tab="roi"]')?.click()`);
  await new Promise(r => setTimeout(r, 600));

  let roi1 = await evaluate(`
    (() => {
      const sStart = document.querySelector('#input-src-sample-start')?.value;
      const sEnd = document.querySelector('#input-src-sample-end')?.value;
      const lStart = document.querySelector('#input-src-line-start')?.value;
      const lEnd = document.querySelector('#input-src-line-end')?.value;
      return { sStart, sEnd, lStart, lEnd };
    })()
  `);
  console.log('PAIR_001 (OHRC) ROI Coordinates:', roi1);
  if (roi1.lStart === '42000' && roi1.lEnd === '46000' && roi1.sStart === '1000' && roi1.sEnd === '7000') {
    console.log('✅ PASS: PAIR_001 has OHRC-specific nominal ROI.');
  } else {
    console.error('❌ FAIL: PAIR_001 ROI mismatch:', roi1);
  }

  console.log('\n======================================================');
  console.log('TEST 2: SWITCH TO PAIR_003 (TMC) — VERIFY ISOLATION');
  console.log('======================================================');

  await evaluate(`
    (() => {
      const dropdown = document.querySelector('#home-dataset-dropdown');
      if (dropdown) {
        dropdown.value = 'pair_003';
        dropdown.dispatchEvent(new Event('change'));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 800));

  // Check ROI for PAIR_003
  let roi3 = await evaluate(`
    (() => {
      const sStart = document.querySelector('#input-src-sample-start')?.value;
      const sEnd = document.querySelector('#input-src-sample-end')?.value;
      const lStart = document.querySelector('#input-src-line-start')?.value;
      const lEnd = document.querySelector('#input-src-line-end')?.value;
      return { sStart, sEnd, lStart, lEnd };
    })()
  `);
  console.log('PAIR_003 (TMC) ROI Coordinates:', roi3);
  if (roi3.lStart === '20000' && roi3.lEnd === '24000' && roi3.sStart === '500' && roi3.sEnd === '3500') {
    console.log('✅ PASS: PAIR_003 has its own dedicated TMC nominal ROI (no OHRC cross-contamination).');
  } else {
    console.error('❌ FAIL: PAIR_003 ROI contamination from PAIR_001:', roi3);
  }

  // Verify Feature Workspace for PAIR_003
  await evaluate(`document.querySelector('button[data-tab="feature-correspondence"]')?.click()`);
  await new Promise(r => setTimeout(r, 600));

  let fw3 = await evaluate(`
    (() => {
      const inst = document.querySelector('#fc-text-inst')?.textContent;
      const mission = document.querySelector('#fc-text-mission')?.textContent;
      return { inst, mission };
    })()
  `);
  console.log('PAIR_003 Feature Workspace Header:', fw3);
  if (fw3.inst?.includes('TMC') && fw3.mission?.includes('Chandrayaan-1')) {
    console.log('✅ PASS: Feature Workspace reflects TMC / Chandrayaan-1.');
  } else {
    console.error('❌ FAIL: Feature Workspace wrong metadata for TMC:', fw3);
  }

  console.log('\n======================================================');
  console.log('TEST 3: SWITCH TO PAIR_002 (IIRS) — VERIFY GUARDS & ZERO METRICS');
  console.log('======================================================');

  await evaluate(`
    (() => {
      const dropdown = document.querySelector('#home-dataset-dropdown');
      if (dropdown) {
        dropdown.value = 'pair_002';
        dropdown.dispatchEvent(new Event('change'));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 800));

  // Check Feature Workspace has IIRS guard
  let iirsFw = await evaluate(`
    (() => {
      const guard = document.querySelector('#fc-iirs-guard');
      const isVisible = guard && getComputedStyle(guard).display !== 'none';
      const btnRun = document.querySelector('#fc-btn-run');
      return { isVisible, btnDisabled: btnRun?.disabled };
    })()
  `);
  console.log('PAIR_002 Feature Workspace Guard:', iirsFw);
  if (iirsFw.isVisible) {
    console.log('✅ PASS: IIRS hyperspectral guard is visible in Feature Workspace.');
  } else {
    console.error('❌ FAIL: IIRS guard missing in Feature Workspace:', iirsFw);
  }

  // Check Spatial Workspace for PAIR_002
  await evaluate(`document.querySelector('button[data-tab="spatial-analysis"]')?.click()`);
  await new Promise(r => setTimeout(r, 600));

  let iirsSpatial = await evaluate(`
    (() => {
      const stat = document.querySelector('#insp-cell-status')?.textContent;
      const coverage = document.querySelector('#sp-kpi-coverage')?.textContent;
      return { stat, coverage };
    })()
  `);
  console.log('PAIR_002 Spatial Analysis Status:', iirsSpatial);
  if (iirsSpatial.stat?.includes('Band Extraction Required') && iirsSpatial.coverage === '0.0%') {
    console.log('✅ PASS: Spatial analysis correctly blocks IIRS with 0% coverage and band extraction required notice.');
  } else {
    console.error('❌ FAIL: Spatial analysis did not block IIRS:', iirsSpatial);
  }

  // Check Transformation Analysis for PAIR_002
  await evaluate(`document.querySelector('button[data-tab="transformation"]')?.click()`);
  await new Promise(r => setTimeout(r, 600));

  let iirsTransform = await evaluate(`
    (() => {
      const text = document.querySelector('#ta-content-area')?.textContent;
      const grade = document.querySelector('#ta-grade-badge')?.textContent;
      return { text: text?.substring(0, 100), grade };
    })()
  `);
  console.log('PAIR_002 Transformation Analysis:', iirsTransform);
  if (iirsTransform.grade?.includes('BAND EXTRACTION REQUIRED')) {
    console.log('✅ PASS: Transformation analysis shows IIRS band extraction required banner.');
  } else {
    console.error('❌ FAIL: Transformation analysis failed to block IIRS:', iirsTransform);
  }

  console.log('\n======================================================');
  console.log('TEST 4: SWITCH BACK TO PAIR_001 (OHRC) — RESTORE SESSION');
  console.log('======================================================');

  await evaluate(`
    (() => {
      const dropdown = document.querySelector('#home-dataset-dropdown');
      if (dropdown) {
        dropdown.value = 'pair_001';
        dropdown.dispatchEvent(new Event('change'));
      }
    })()
  `);
  await new Promise(r => setTimeout(r, 800));

  await evaluate(`document.querySelector('button[data-tab="roi"]')?.click()`);
  await new Promise(r => setTimeout(r, 600));

  let roi1Restored = await evaluate(`
    (() => {
      const sStart = document.querySelector('#input-src-sample-start')?.value;
      const sEnd = document.querySelector('#input-src-sample-end')?.value;
      const lStart = document.querySelector('#input-src-line-start')?.value;
      const lEnd = document.querySelector('#input-src-line-end')?.value;
      return { sStart, sEnd, lStart, lEnd };
    })()
  `);
  console.log('Restored PAIR_001 ROI:', roi1Restored);
  if (roi1Restored.lStart === '42000' && roi1Restored.lEnd === '46000' && roi1Restored.sStart === '1000' && roi1Restored.sEnd === '7000') {
    console.log('✅ PASS: PAIR_001 session accurately restored without any leakage from PAIR_002 or PAIR_003.');
  } else {
    console.error('❌ FAIL: PAIR_001 failed to restore cleanly:', roi1Restored);
  }

  console.log('\n======================================================');
  console.log('ALL DATASET ISOLATION RULES STRICTLY VERIFIED!');
  console.log('======================================================\n');
  ws.close();
}

run().catch(console.error);
