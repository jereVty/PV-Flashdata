/*
 * 3S PV Reliability Report Builder
 *
 * All parsing, analysis, chart rendering, and workbook creation happen locally in
 * the browser. No customer measurement or image data is sent to a server.
 */

const PARAMETERS = [
  { key: "Pmax", label: "Pmax", unit: "W" },
  { key: "Vpmax", label: "Vmpp", unit: "V" },
  { key: "Ipmax", label: "Impp", unit: "A" },
  { key: "Voc", label: "Voc", unit: "V" },
  { key: "Isc", label: "Isc", unit: "A" },
  { key: "FF", label: "FF", unit: "%" }
];
const LIMIT = -5;
const COLORS = { navy: "142D4C", blue: "0877BD", cyan: "14A7D8", lime: "B7CF34", pale: "F3F7F9", white: "FFFFFF", red: "C83C4A" };
const state = { initialFile: null, finalFile: null, images: [], analysis: null };

const $ = selector => document.querySelector(selector);

// Parse the tester's comma-delimited text while trimming the padding commonly
// added around numeric values. Duplicate serials intentionally retain the last
// measurement, which is normally the final valid run in an instrument export.
function parseFlashData(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("The measurement file contains no data rows.");
  const headers = lines[0].split(",").map(value => value.trim());
  const serialIndex = headers.indexOf("Snr");
  if (serialIndex < 0) throw new Error("The required 'Snr' column is missing.");
  const rows = new Map();
  for (const line of lines.slice(1)) {
    const values = line.split(",").map(value => value.trim());
    if (values.length < headers.length) continue;
    const record = Object.fromEntries(headers.map((header, index) => [header, values[index]]));
    const serial = record.Snr.trim();
    for (const parameter of PARAMETERS) {
      const numericValue = Number.parseFloat(record[parameter.key]);
      if (!Number.isFinite(numericValue)) throw new Error(`${serial}: invalid ${parameter.label} value.`);
      record[parameter.key] = numericValue;
    }
    rows.set(serial, record);
  }
  if (!rows.size) throw new Error("No valid module measurement was found.");
  return { headers, rows };
}

// Match records strictly by serial number so input row order never affects the
// result. A module missing from either file is reported rather than silently lost.
function compareData(initial, final) {
  const missingFinal = [...initial.rows.keys()].filter(serial => !final.rows.has(serial));
  const missingInitial = [...final.rows.keys()].filter(serial => !initial.rows.has(serial));
  if (missingFinal.length || missingInitial.length) {
    throw new Error(`Serial mismatch. Missing from final: ${missingFinal.join(", ") || "none"}; missing from initial: ${missingInitial.join(", ") || "none"}.`);
  }
  const details = [];
  for (const [serial, initialRow] of initial.rows) {
    const finalRow = final.rows.get(serial);
    for (const parameter of PARAMETERS) {
      const initialValue = initialRow[parameter.key];
      const finalValue = finalRow[parameter.key];
      const variation = ((finalValue - initialValue) / initialValue) * 100;
      details.push({ serial, ...parameter, initial: initialValue, final: finalValue, variation, passed: variation >= LIMIT });
    }
  }
  return { initial, final, serials: [...initial.rows.keys()], details, passed: details.every(item => item.passed) };
}

async function refreshAnalysis() {
  if (!state.initialFile || !state.finalFile) return;
  try {
    const [initialText, finalText] = await Promise.all([state.initialFile.text(), state.finalFile.text()]);
    state.analysis = compareData(parseFlashData(initialText), parseFlashData(finalText));
    renderResults(state.analysis);
    $("#generateBtn").disabled = false;
    $("#exportHint").textContent = `${state.analysis.serials.length} module${state.analysis.serials.length === 1 ? "" : "s"} matched · Report ready`;
  } catch (error) {
    state.analysis = null;
    $("#results").classList.add("hidden");
    $("#generateBtn").disabled = true;
    showMessage(error.message, true);
  }
}

function renderResults(analysis) {
  $("#results").classList.remove("hidden");
  const badge = $("#overallBadge");
  badge.className = `status-badge ${analysis.passed ? "pass" : "fail"}`;
  badge.textContent = analysis.passed ? "✓ TEST PASSED" : "✕ TEST FAILED";
  $("#summaryCards").innerHTML = PARAMETERS.map(parameter => {
    const values = analysis.details.filter(item => item.key === parameter.key).map(item => item.variation);
    const worst = Math.min(...values);
    return `<div class="summary-card"><b>${parameter.label}</b><span>${worst.toFixed(2)}%</span><small>Worst variation</small></div>`;
  }).join("");
  $("#resultsBody").innerHTML = analysis.details.map(item => `<tr><td><strong>${escapeHtml(item.serial)}</strong></td><td>${item.label} (${item.unit})</td><td>${item.initial.toFixed(3)}</td><td>${item.final.toFixed(3)}</td><td>${item.variation.toFixed(2)}%</td><td><span class="${item.passed ? "result-pass" : "result-fail"}">${item.passed ? "PASS" : "FAIL"}</span></td></tr>`).join("");
  drawVariationChart($("#variationChart"), analysis);
}

// Draw a self-contained chart to canvas. The y-axis is fixed at +5% to -15% as
// required; the same raster is embedded into Excel because ExcelJS deliberately
// does not create native Excel chart objects.
function drawVariationChart(canvas, analysis) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width, height = canvas.height;
  const plot = { left: 72, top: 45, right: width - 25, bottom: height - 78 };
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#142d4c"; ctx.font = "bold 20px Arial"; ctx.fillText("Performance variation by module", plot.left, 25);
  for (let value = 5; value >= -15; value -= 5) {
    const y = plot.top + ((5 - value) / 20) * (plot.bottom - plot.top);
    ctx.strokeStyle = value === -5 ? "#c83c4a" : "#dce5ec"; ctx.lineWidth = value === -5 ? 2 : 1;
    ctx.beginPath(); ctx.moveTo(plot.left, y); ctx.lineTo(plot.right, y); ctx.stroke();
    ctx.fillStyle = "#6d7c8e"; ctx.font = "12px Arial"; ctx.textAlign = "right"; ctx.fillText(`${value}%`, plot.left - 10, y + 4);
  }
  const groupWidth = (plot.right - plot.left) / analysis.serials.length;
  const barWidth = Math.min(20, groupWidth / 8);
  analysis.serials.forEach((serial, serialIndex) => {
    const records = analysis.details.filter(item => item.serial === serial);
    records.forEach((item, parameterIndex) => {
      const x = plot.left + serialIndex * groupWidth + (groupWidth - records.length * barWidth) / 2 + parameterIndex * barWidth;
      const zeroY = plot.top + .25 * (plot.bottom - plot.top);
      const valueY = plot.top + ((5 - Math.max(-15, Math.min(5, item.variation))) / 20) * (plot.bottom - plot.top);
      ctx.fillStyle = ["#0877bd", "#14a7d8", "#b7cf34", "#142d4c", "#7093aa", "#6d7c8e"][parameterIndex];
      ctx.fillRect(x + 1, Math.min(zeroY, valueY), barWidth - 2, Math.max(2, Math.abs(zeroY - valueY)));
    });
    ctx.fillStyle = "#142d4c"; ctx.font = "bold 11px Arial"; ctx.textAlign = "center";
    ctx.fillText(serial, plot.left + serialIndex * groupWidth + groupWidth / 2, plot.bottom + 21);
  });
  PARAMETERS.forEach((parameter, index) => {
    const x = plot.left + index * 105;
    ctx.fillStyle = ["#0877bd", "#14a7d8", "#b7cf34", "#142d4c", "#7093aa", "#6d7c8e"][index]; ctx.fillRect(x, height - 27, 12, 12);
    ctx.fillStyle = "#52677a"; ctx.textAlign = "left"; ctx.font = "11px Arial"; ctx.fillText(parameter.label, x + 18, height - 17);
  });
}

async function createWorkbook(analysis) {
  if (!window.ExcelJS) throw new Error("The Excel library could not be loaded. Check the internet connection and retry.");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "3S PV Reliability Report Builder";
  workbook.created = new Date();
  createRawDataSheet(workbook, analysis);
  await createResultsSheet(workbook, analysis);
  await createImageSheet(workbook, analysis);
  return workbook;
}

function styleHeader(row) {
  row.height = 25;
  row.eachCell(cell => { cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } }; cell.font = { color: { argb: COLORS.white }, bold: true }; cell.alignment = { vertical: "middle" }; });
}

// Preserve every source column in a normalized audit worksheet and identify the
// measurement stage explicitly. This gives reviewers complete traceability.
function createRawDataSheet(workbook, analysis) {
  const sheet = workbook.addWorksheet("Raw Data", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Measurement Stage", ...analysis.initial.headers];
  sheet.addRow(headers); styleHeader(sheet.getRow(1));
  for (const [stage, dataset] of [["Initial", analysis.initial], ["Final", analysis.final]]) {
    for (const record of dataset.rows.values()) sheet.addRow([stage, ...dataset.headers.map(header => record[header])]);
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: sheet.rowCount, column: headers.length } };
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 20 : Math.min(28, Math.max(11, ...column.values.slice(1).map(value => String(value ?? "").length + 2))); });
  sheet.eachRow((row, rowNumber) => { if (rowNumber > 1 && rowNumber % 2) row.eachCell(cell => cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.pale } }); });
}

async function createResultsSheet(workbook, analysis) {
  const sheet = workbook.addWorksheet("Data Results DH1000", { properties: { defaultRowHeight: 19 }, views: [{ state: "frozen", ySplit: 5 }] });
  sheet.mergeCells("A1:F1"); const title = sheet.getCell("A1"); title.value = "DH1000 PERFORMANCE TEST REPORT"; title.font = { size: 20, bold: true, color: { argb: COLORS.white } }; title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } }; title.alignment = { vertical: "middle" }; sheet.getRow(1).height = 35;
  sheet.mergeCells("A2:F2"); sheet.getCell("A2").value = `Overall result: ${analysis.passed ? "PASS" : "FAIL"}  |  Acceptance criterion: every parameter variation ≥ -5.00%`;
  sheet.getCell("A2").font = { bold: true, color: { argb: analysis.passed ? "4E6811" : COLORS.red } }; sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: analysis.passed ? "EDF5CE" : "FBE8E9" } };
  sheet.addRow([]); const header = sheet.addRow(["Serial number", "Parameter", "Initial value", "Final value", "Variation", "Result"]); styleHeader(header);
  analysis.details.forEach(item => {
    const row = sheet.addRow([item.serial, `${item.label} (${item.unit})`, item.initial, item.final, item.variation / 100, item.passed ? "PASS" : "FAIL"]);
    row.getCell(5).numFmt = "0.00%"; row.getCell(6).font = { bold: true, color: { argb: item.passed ? "4E6811" : COLORS.red } };
    if (!item.passed) row.eachCell(cell => cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FBE8E9" } });
  });
  sheet.columns = [{ width: 22 }, { width: 19 }, { width: 16 }, { width: 16 }, { width: 15 }, { width: 12 }];
  const chartCanvas = $("#variationChart");
  const chartId = workbook.addImage({ base64: chartCanvas.toDataURL("image/png"), extension: "png" });
  const chartStart = sheet.rowCount + 3;
  sheet.addImage(chartId, { tl: { col: 0, row: chartStart - 1 }, ext: { width: 900, height: 323 } });
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
}

function normalize(value) { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }

// Images are paired by checking that a normalized filename contains the normalized
// serial number plus an initial/final marker. Unmatched cells remain labelled so
// missing evidence is visually explicit in the exported report.
async function createImageSheet(workbook, analysis) {
  const sheet = workbook.addWorksheet("El and Visual", { properties: { defaultRowHeight: 20 } });
  sheet.columns = [{ width: 24 }, { width: 55 }, { width: 55 }];
  sheet.addRow(["Serial number", "EL initial", "EL final"]); styleHeader(sheet.getRow(1));
  let row = 2;
  for (const serial of analysis.serials) {
    sheet.getRow(row).height = 210; sheet.getCell(row, 1).value = serial; sheet.getCell(row, 1).font = { bold: true, color: { argb: COLORS.navy } }; sheet.getCell(row, 1).alignment = { vertical: "middle", horizontal: "center" };
    for (const [column, marker] of [[2, "initial"], [3, "final"]]) {
      const aliases = marker === "initial" ? ["initial", "init", "before"] : ["final", "after"];
      const image = state.images.find(file => normalize(file.name).includes(normalize(serial)) && aliases.some(alias => normalize(file.name).includes(alias)));
      if (image) {
        const dataUrl = await fileToDataUrl(image); const extension = image.type.includes("png") ? "png" : "jpeg";
        const imageId = workbook.addImage({ base64: dataUrl, extension });
        sheet.addImage(imageId, { tl: { col: column - 1 + .05, row: row - 1 + .08 }, ext: { width: 360, height: 260 }, editAs: "oneCell" });
      } else {
        sheet.getCell(row, column).value = `No ${marker} image provided`; sheet.getCell(row, column).alignment = { vertical: "middle", horizontal: "center" }; sheet.getCell(row, column).font = { italic: true, color: { argb: "6D7C8E" } };
      }
    }
    row++;
  }
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

function fileToDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
function escapeHtml(value) { const node = document.createElement("div"); node.textContent = value; return node.innerHTML; }
function showMessage(text, error = false) { const message = $("#message"); message.textContent = text; message.className = `message${error ? " error" : ""}`; clearTimeout(showMessage.timer); showMessage.timer = setTimeout(() => message.classList.add("hidden"), 5000); }

function setFile(kind, file) {
  state[`${kind}File`] = file || null;
  $(`#${kind}Name`).textContent = file ? file.name : "No file selected";
  $(`#${kind}Drop`).classList.toggle("selected", Boolean(file));
  refreshAnalysis();
}

async function fetchAsFile(path, type = "text/plain") {
  const response = await fetch(path); if (!response.ok) throw new Error(`Could not load ${path}.`);
  return new File([await response.blob()], path, { type });
}

$("#initialFile").addEventListener("change", event => setFile("initial", event.target.files[0]));
$("#finalFile").addEventListener("change", event => setFile("final", event.target.files[0]));
for (const kind of ["initial", "final"]) {
  const zone = $(`#${kind}Drop`);
  zone.addEventListener("dragover", event => { event.preventDefault(); zone.classList.add("drag"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag"));
  zone.addEventListener("drop", event => { event.preventDefault(); zone.classList.remove("drag"); setFile(kind, event.dataTransfer.files[0]); });
}
$("#imageFiles").addEventListener("change", event => { state.images = [...event.target.files]; renderImageList(); });
function renderImageList() { $("#imageList").innerHTML = state.images.length ? state.images.map(file => `<span>${escapeHtml(file.name)}</span>`).join("") : "<span>No images attached</span>"; }

$("#loadDemo").addEventListener("click", async () => {
  try { const files = await Promise.all([fetchAsFile("2025-04-24 Flashdata.txt"), fetchAsFile("2025-10-02 Flashdata.txt")]); setFile("initial", files[0]); setFile("final", files[1]); } catch (error) { showMessage("Run this app through a local web server to load examples.", true); }
});
$("#loadDemoImages").addEventListener("click", async () => {
  try { state.images = await Promise.all(["FuE 1008 final.jpg", "FuE 1008 init.jpg", "FuE 1016 final.jpg", "FuE 1016 init.jpg", "FuE 1017 final.jpg", "FuE 1017 init.jpg"].map(path => fetchAsFile(path, "image/jpeg"))); renderImageList(); } catch (error) { showMessage("Run this app through a local web server to load examples.", true); }
});
$("#generateBtn").addEventListener("click", async () => {
  const button = $("#generateBtn"); button.disabled = true; button.querySelector("span").textContent = "Building report…";
  try {
    const workbook = await createWorkbook(state.analysis); const buffer = await workbook.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const link = document.createElement("a"); link.href = url; link.download = `PV_Reliability_Report_${new Date().toISOString().slice(0, 10)}.xlsx`; link.click(); URL.revokeObjectURL(url);
    showMessage("Excel report generated successfully.");
  } catch (error) { showMessage(error.message, true); }
  finally { button.disabled = false; button.querySelector("span").textContent = "Generate Excel report"; }
});
