# 3S PV Reliability Report Builder

A browser-based tool that compares initial and final photovoltaic flash-test exports and creates an Excel reliability report. Processing is entirely client-side.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`, select the two `.txt` exports, optionally attach EL images, review the results, and generate the workbook.

## Report rules

The app compares modules by serial number across Pmax, Vmpp, Impp, Voc, Isc, and FF. Variation is calculated as `(final - initial) / initial × 100`. Every value must be at least −5.00% for the test to pass.

The generated workbook contains:

- **Raw Data** — both original datasets with their full source columns.
- **Data Results DH1000** — initial/final values, variations, decisions, and a chart fixed to a −15% to +5% scale.
- **El and Visual** — initial and final images matched from filenames by serial number.

The Excel export uses ExcelJS from jsDelivr, so an internet connection is required when the page is first loaded.
