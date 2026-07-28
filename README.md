# 3S PV Reliability Report Builder

A browser-based tool that compares initial and final photovoltaic flash-test exports and creates an Excel reliability report. Processing is entirely client-side.

## Run locally

From any terminal, run the launcher by using its full path:

```bash
python3 /workspace/PV-Flashdata/server.py
```

The launcher always serves the directory containing the application, opens the correct
`index.html` page automatically, and prints its address. This avoids the **Directory
listing for /** page that appears when a generic web server is started from the wrong
folder.

If a browser cannot be opened automatically, visit:

```text
http://127.0.0.1:8000/index.html
```

To start it without opening a browser, or to choose another port, use:

```bash
python3 /workspace/PV-Flashdata/server.py --no-browser
python3 /workspace/PV-Flashdata/server.py --port 8080
```

Alternatively, the standard Python server works when the application directory is
provided explicitly:

```bash
python3 -m http.server 8000 --directory /workspace/PV-Flashdata
```

Select the two `.txt` exports, optionally attach EL images, review the results, and
generate the workbook. Press `Ctrl+C` in the terminal to stop the server.

## Report rules

The app compares modules by serial number across Pmax, Vmpp, Impp, Voc, Isc, and FF. Variation is calculated as `(final - initial) / initial × 100`. Every value must be at least −5.00% for the test to pass.

The generated workbook contains:

- **Raw Data** — both original datasets with their full source columns.
- **Data Results DH1000** — initial/final values, variations, decisions, and a chart fixed to a −15% to +5% scale.
- **El and Visual** — initial and final images matched from filenames by serial number.

The Excel export uses ExcelJS from jsDelivr, so an internet connection is required when the page is first loaded.
