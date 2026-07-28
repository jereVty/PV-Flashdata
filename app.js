diff --git a/app.js b/app.js
new file mode 100644
index 0000000000000000000000000000000000000000..93a5351758a6c8e8a0f44d2d27733650b46fc018
--- /dev/null
+++ b/app.js
@@ -0,0 +1,135 @@
+import { PARAMETERS, parseFlashData, compareMeasurements, matchImages } from './report.js';
+
+const $ = id => document.getElementById(id);
+let initialRows = null; let finalRows = null; let comparison = null; let imageFiles = [];
+
+function format(value, digits = 3) { return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }); }
+function showError(error) { $('message').hidden = false; $('message').textContent = error.message || error; }
+function clearError() { $('message').hidden = true; }
+
+async function receiveFile(kind, file) {
+  if (!file) return;
+  try {
+    const rows = parseFlashData(await file.text());
+    if (kind === 'initial') initialRows = rows; else finalRows = rows;
+    const zone = $(`${kind}Zone`); zone.classList.add('loaded');
+    zone.querySelector('.file-icon').textContent = '✓';
+    zone.querySelector('.file-state').textContent = `${file.name} · ${rows.length} module${rows.length > 1 ? 's' : ''}`;
+    clearError(); analyse();
+  } catch (error) { showError(error); }
+}
+
+function analyse() {
+  if (!initialRows || !finalRows) return;
+  try {
+    comparison = compareMeasurements(initialRows, finalRows);
+    render(); clearError();
+  } catch (error) { comparison = null; $('results').hidden = true; showError(error); }
+}
+
+function render() {
+  $('results').hidden = false;
+  const all = comparison.flatMap(module => module.parameters.map(parameter => ({ ...parameter, serial: module.serial })));
+  const worst = all.reduce((a, b) => a.variation < b.variation ? a : b);
+  const passed = comparison.every(module => module.passed);
+  $('moduleCount').textContent = comparison.length;
+  $('worstValue').textContent = `${format(worst.variation, 2)} %`;
+  $('worstLabel').textContent = `${worst.key} · ${worst.serial}`;
+  $('globalBadge').className = `result-badge ${passed ? 'pass' : 'fail'}`;
+  $('globalBadge').textContent = passed ? '✓ TEST PASSED' : '× TEST FAILED';
+  $('testNameEcho').textContent = $('testName').value || 'Test';
+  $('resultsBody').innerHTML = comparison.map(module => module.parameters.map((p, index) => `
+    <tr class="${index === 0 ? 'module-start' : ''}"><td>${index === 0 ? `<strong>${module.serial}</strong>` : ''}</td><td>${p.key} <small>(${p.unit})</small></td><td>${format(p.initial)}</td><td>${format(p.final)}</td><td class="variation ${p.passed ? '' : 'bad'}">${p.variation >= 0 ? '+' : ''}${format(p.variation, 2)} %</td><td><span class="status ${p.passed ? '' : 'bad'}">${p.passed ? 'PASS' : 'FAIL'}</span></td></tr>`).join('')).join('');
+  drawChart($('chart'), comparison);
+  setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
+}
+
+function drawChart(canvas, data, forExport = false) {
+  const dpr = forExport ? 1 : Math.min(window.devicePixelRatio || 1, 2);
+  const width = forExport ? 1200 : Math.max(900, canvas.clientWidth || 900), height = forExport ? 440 : 360;
+  canvas.width = width * dpr; canvas.height = height * dpr;
+  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, width, height);
+  if (forExport) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); }
+  const margin = { top: 25, right: 25, bottom: 65, left: 55 }; const plotH = height - margin.top - margin.bottom; const plotW = width - margin.left - margin.right;
+  const y = value => margin.top + ((5 - Math.max(-15, Math.min(5, value))) / 20) * plotH;
+  ctx.font = '11px Arial'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
+  for (let tick = -15; tick <= 5; tick += 5) { ctx.strokeStyle = tick === -5 ? '#c1123f' : '#eadde7'; ctx.lineWidth = tick === -5 ? 2 : 1; ctx.beginPath(); ctx.moveTo(margin.left, y(tick)); ctx.lineTo(width - margin.right, y(tick)); ctx.stroke(); ctx.fillStyle = '#756371'; ctx.fillText(`${tick}%`, margin.left - 10, y(tick)); }
+  const groups = data.length * PARAMETERS.length; const slot = plotW / groups; const barW = Math.min(22, slot * .58); let index = 0;
+  data.forEach(module => module.parameters.forEach((parameter, pIndex) => {
+    const x = margin.left + index * slot + slot / 2; const zero = y(0); const valueY = y(parameter.variation);
+    ctx.fillStyle = parameter.passed ? '#ff003d' : '#c1123f'; ctx.fillRect(x - barW / 2, Math.min(zero, valueY), barW, Math.max(2, Math.abs(zero - valueY)));
+    ctx.save(); ctx.translate(x, height - margin.bottom + 10); ctx.rotate(-Math.PI / 4); ctx.textAlign = 'right'; ctx.fillStyle = '#756371'; ctx.font = '10px Arial'; ctx.fillText(`${module.serial} · ${parameter.key}`, 0, 0); ctx.restore(); index++;
+  }));
+  ctx.fillStyle = '#c1123f'; ctx.textAlign = 'left'; ctx.font = 'bold 10px Arial'; ctx.fillText('−5% threshold', margin.left + 5, y(-5) - 9);
+}
+
+function styleHeader(row, color = 'FF003D') {
+  row.height = 28;
+  row.eachCell(cell => { cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }; cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } }; cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; cell.border = { bottom: { style: 'thin', color: { argb: 'FFD5DED8' } } }; });
+}
+
+async function fileDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
+
+async function exportWorkbook() {
+  if (!comparison || !window.ExcelJS) { showError('The Excel engine is unavailable. Check your connection and reload the page.'); return; }
+  const button = $('exportBtn'); button.disabled = true; button.textContent = 'Creating report…';
+  try {
+    const workbook = new ExcelJS.Workbook(); workbook.creator = '3S PV Report Studio'; workbook.created = new Date();
+    const raw = workbook.addWorksheet('Raw Data', { views: [{ state: 'frozen', ySplit: 1 }] });
+    const headers = Object.keys(initialRows[0]); raw.addRow(headers); styleHeader(raw.getRow(1));
+    [...initialRows, ...finalRows].forEach(row => raw.addRow(headers.map(header => row[header])));
+    raw.columns.forEach((column, i) => { column.width = Math.min(42, Math.max(11, ...column.values.slice(1).map(v => String(v ?? '').length + 2))); if (i >= 7) column.numFmt = '0.0000'; });
+    raw.autoFilter = { from: 'A1', to: `${raw.getColumn(headers.length).letter}${raw.rowCount}` };
+
+    const testName = ($('testName').value || 'Test').trim();
+    const results = workbook.addWorksheet(`Data Results ${testName}`.slice(0, 31), { pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 } });
+    results.mergeCells('A1:F2'); results.getCell('A1').value = `PERFORMANCE REPORT · ${testName.toUpperCase()}`; results.getCell('A1').font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } }; results.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF34102F' } }; results.getCell('A1').alignment = { vertical: 'middle', horizontal: 'left' };
+    results.mergeCells('A3:F3'); results.getCell('A3').value = `Acceptance threshold: every variation must be strictly greater than −5%  |  Result: ${comparison.every(m => m.passed) ? 'TEST PASSED' : 'TEST FAILED'}`; results.getCell('A3').font = { bold: true, color: { argb: comparison.every(m => m.passed) ? 'FFFF003D' : 'FFB43A3A' } };
+    results.addRow([]); results.addRow(['Serial number', 'Parameter', 'Initial value', 'Final value', 'Variation (%)', 'Status']); styleHeader(results.getRow(5));
+    comparison.forEach(module => module.parameters.forEach(parameter => {
+      const row = results.addRow([module.serial, `${parameter.key} (${parameter.unit})`, parameter.initial, parameter.final, parameter.variation / 100, parameter.passed ? 'PASS' : 'FAIL']);
+      row.getCell(5).numFmt = '0.00%;[Red]-0.00%'; row.getCell(6).font = { bold: true, color: { argb: parameter.passed ? 'FFFF003D' : 'FFB43A3A' } };
+      row.eachCell(cell => { cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE4DD' } } }; });
+    }));
+    results.columns = [{ width: 22 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 14 }];
+    const chartCanvas = document.createElement('canvas'); drawChart(chartCanvas, comparison, true);
+    const chartId = workbook.addImage({ base64: chartCanvas.toDataURL('image/png'), extension: 'png' });
+    const chartStart = 7 + comparison.length * 6; results.addImage(chartId, { tl: { col: 0, row: chartStart - 1 }, ext: { width: 1000, height: 367 } });
+    results.getCell(`A${chartStart}`).value = 'Performance variations (axis: −15% to +5%)'; results.getCell(`A${chartStart}`).font = { bold: true, color: { argb: 'FF34102F' } };
+
+    const el = workbook.addWorksheet('EL and Visual', { pageSetup: { orientation: 'landscape', fitToPage: true } });
+    el.columns = [{ width: 22 }, { width: 46 }, { width: 46 }]; el.addRow(['Serial number', 'EL initial', 'EL final']); styleHeader(el.getRow(1), '34102F');
+    const matched = matchImages(imageFiles, comparison.map(m => m.serial));
+    for (const module of comparison) {
+      const rowNumber = el.rowCount + 1; const row = el.addRow([module.serial, matched[module.serial].initial ? '' : 'Image not provided', matched[module.serial].final ? '' : 'Image not provided']); row.height = 205;
+      row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' }; row.getCell(1).font = { bold: true };
+      for (const [column, phase] of [[1, 'initial'], [2, 'final']]) {
+        const file = matched[module.serial][phase]; if (!file) continue;
+        const imageId = workbook.addImage({ base64: await fileDataUrl(file), extension: file.type.includes('png') ? 'png' : 'jpeg' });
+        el.addImage(imageId, { tl: { col: column + .05, row: rowNumber - .95 }, ext: { width: 315, height: 255 }, editAs: 'oneCell' });
+      }
+    }
+    const buffer = await workbook.xlsx.writeBuffer(); const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
+    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `Reliability report ${testName} ${comparison.length} modules.xlsx`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
+  } catch (error) { showError(error); } finally { button.disabled = false; button.innerHTML = 'Download Excel report <span>↓</span>'; }
+}
+
+['initial', 'final'].forEach(kind => {
+  $(`${kind}File`).addEventListener('change', event => receiveFile(kind, event.target.files[0]));
+  const zone = $(`${kind}Zone`); ['dragenter', 'dragover'].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add('drag'); }));
+  ['dragleave', 'drop'].forEach(name => zone.addEventListener(name, event => { event.preventDefault(); zone.classList.remove('drag'); }));
+  zone.addEventListener('drop', event => receiveFile(kind, event.dataTransfer.files[0]));
+});
+$('images').addEventListener('change', event => { imageFiles = [...event.target.files]; $('imageLabel').textContent = `${imageFiles.length} image${imageFiles.length === 1 ? '' : 's'} selected`; });
+$('testName').addEventListener('input', () => { $('testNameEcho').textContent = $('testName').value || 'Test'; });
+$('exportBtn').addEventListener('click', exportWorkbook);
+$('demoBtn').addEventListener('click', async () => {
+  try {
+    const [a, b] = await Promise.all([fetch('2025-04-24%20Flashdata.txt'), fetch('2025-10-02%20Flashdata.txt')]);
+    if (!a.ok || !b.ok) throw new Error('Sample files are unavailable. Run the application through a local web server.');
+    initialRows = parseFlashData(await a.text()); finalRows = parseFlashData(await b.text());
+    [['initial', initialRows, '2025-04-24 Flashdata.txt'], ['final', finalRows, '2025-10-02 Flashdata.txt']].forEach(([kind, rows, name]) => { const zone = $(`${kind}Zone`); zone.classList.add('loaded'); zone.querySelector('.file-icon').textContent = '✓'; zone.querySelector('.file-state').textContent = `${name} · ${rows.length} modules`; });
+    analyse();
+  } catch (error) { showError(error); }
+});
+window.addEventListener('resize', () => comparison && drawChart($('chart'), comparison));
