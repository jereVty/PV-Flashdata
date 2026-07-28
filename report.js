diff --git a/report.js b/report.js
new file mode 100644
index 0000000000000000000000000000000000000000..7d851bc140ac7ecab7f13e5b177ca1d684ad8ddc
--- /dev/null
+++ b/report.js
@@ -0,0 +1,80 @@
+export const PARAMETERS = [
+  { key: 'Pmax', source: 'Pmax', unit: 'W' },
+  { key: 'Vmpp', source: 'Vpmax', unit: 'V' },
+  { key: 'Impp', source: 'Ipmax', unit: 'A' },
+  { key: 'Voc', source: 'Voc', unit: 'V' },
+  { key: 'Isc', source: 'Isc', unit: 'A' },
+  { key: 'FF', source: 'FF', unit: '%' }
+];
+
+function csvLine(line) {
+  const out = []; let current = ''; let quoted = false;
+  for (let i = 0; i < line.length; i++) {
+    const char = line[i];
+    if (char === '"') quoted = !quoted;
+    else if (char === ',' && !quoted) { out.push(current.trim()); current = ''; }
+    else current += char;
+  }
+  out.push(current.trim()); return out;
+}
+
+export function parseFlashData(text) {
+  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
+  if (lines.length < 2) throw new Error('The file does not contain any measurements.');
+  const headers = csvLine(lines[0]);
+  const required = ['Date', 'Snr', ...PARAMETERS.map(p => p.source)];
+  const missing = required.filter(name => !headers.includes(name));
+  if (missing.length) throw new Error(`Missing columns: ${missing.join(', ')}.`);
+  return lines.slice(1).map((line, index) => {
+    const values = csvLine(line);
+    const row = Object.fromEntries(headers.map((header, i) => [header, values[i] ?? '']));
+    row.Snr = row.Snr.trim();
+    if (!row.Snr) throw new Error(`Missing serial number on line ${index + 2}.`);
+    for (const { source } of PARAMETERS) {
+      row[source] = Number(String(row[source]).replace(',', '.'));
+      if (!Number.isFinite(row[source])) throw new Error(`Invalid ${source} value for ${row.Snr}.`);
+    }
+    return row;
+  });
+}
+
+export function compareMeasurements(initialRows, finalRows, threshold = -5) {
+  const initial = new Map(initialRows.map(row => [row.Snr.toLowerCase(), row]));
+  const final = new Map(finalRows.map(row => [row.Snr.toLowerCase(), row]));
+  const missingFinal = initialRows.filter(row => !final.has(row.Snr.toLowerCase())).map(row => row.Snr);
+  const missingInitial = finalRows.filter(row => !initial.has(row.Snr.toLowerCase())).map(row => row.Snr);
+  if (missingFinal.length || missingInitial.length) {
+    const parts = [];
+    if (missingFinal.length) parts.push(`missing from the final file: ${missingFinal.join(', ')}`);
+    if (missingInitial.length) parts.push(`missing from the initial file: ${missingInitial.join(', ')}`);
+    throw new Error(`Serial numbers do not match (${parts.join('; ')}).`);
+  }
+  return initialRows.map(initialRow => {
+    const finalRow = final.get(initialRow.Snr.toLowerCase());
+    const parameters = PARAMETERS.map(parameter => {
+      const initialValue = initialRow[parameter.source];
+      const finalValue = finalRow[parameter.source];
+      const variation = initialValue === 0 ? 0 : ((finalValue - initialValue) / initialValue) * 100;
+      return { ...parameter, initial: initialValue, final: finalValue, variation, passed: variation > threshold };
+    });
+    return { serial: initialRow.Snr, initialRow, finalRow, parameters, passed: parameters.every(p => p.passed) };
+  });
+}
+
+export function normalizeFilename(value) {
+  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
+}
+
+export function matchImages(files, serials) {
+  const result = Object.fromEntries(serials.map(serial => [serial, { initial: null, final: null }]));
+  for (const file of files) {
+    const normalized = normalizeFilename(file.name.replace(/\.[^.]+$/, ''));
+    for (const serial of serials) {
+      const token = normalizeFilename(serial);
+      if (!normalized.includes(token)) continue;
+      if (/(init|initial|before)/.test(normalized)) result[serial].initial = file;
+      if (/(final|after)/.test(normalized)) result[serial].final = file;
+    }
+  }
+  return result;
+}
