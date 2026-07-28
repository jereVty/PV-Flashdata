diff --git a/README.md b/README.md
index f5296cc29a3ccc5c18eb6b4a2750bef72fc604e6..d0d80b07f3c41bb5296afe9897ded47ecd516b46 100644
--- a/README.md
+++ b/README.md
@@ -1,2 +1,17 @@
-# 3S
-Work related projects
+# PV Report Studio
+
+Local web application that compares two photovoltaic Flashdata exports, applies a −5% degradation threshold to Pmax, Vmpp, Impp, Voc, Isc and FF, and generates an illustrated Excel report.
+
+## Usage
+
+```bash
+npm start
+```
+
+Then open `http://localhost:4173`, upload both `.txt` files and, if needed, EL images named with the serial number and `init` or `final`. The export button creates the **Raw Data**, **Data Results…** and **EL and Visual** worksheets entirely in the browser.
+
+## Tests
+
+```bash
+npm test
+```
