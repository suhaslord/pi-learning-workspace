import datetime
import json
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
with zipfile.ZipFile(sys.argv[1]) as archive:
    def xml(name):
        item = archive.getinfo(name)
        if item.file_size > 20_000_000:
            raise ValueError("Schedule XML exceeds the extraction limit")
        return ET.fromstring(archive.read(item))

    shared = []
    if "xl/sharedStrings.xml" in archive.namelist():
        shared = ["".join(node.itertext()) for node in xml("xl/sharedStrings.xml").findall("s:si", ns)]
    styles = xml("xl/styles.xml")
    custom = {int(node.get("numFmtId")): node.get("formatCode", "")
              for node in styles.findall("s:numFmts/s:numFmt", ns)}
    formats = [int(node.get("numFmtId", "0")) for node in styles.findall("s:cellXfs/s:xf", ns)]
    workbook = xml("xl/workbook.xml")
    properties = workbook.find("s:workbookPr", ns)
    epoch = datetime.datetime(1904, 1, 1) if properties is not None and properties.get("date1904") in ("1", "true") else datetime.datetime(1899, 12, 30)
    relationships = {node.get("Id"): node.get("Target") for node in xml("xl/_rels/workbook.xml.rels")}
    output = []
    for sheet in workbook.findall("s:sheets/s:sheet", ns):
        rid = sheet.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        target = relationships[rid]
        filename = target.lstrip("/") if target.startswith("/") else posixpath.normpath("xl/" + target)
        if not filename.startswith("xl/"):
            raise ValueError("Invalid worksheet path")
        rows = []
        for row in xml(filename).findall("s:sheetData/s:row", ns):
            values = {}
            for cell in row.findall("s:c", ns):
                value = cell.findtext("s:v", default="", namespaces=ns)
                kind = cell.get("t")
                if kind == "s":
                    value = shared[int(value)]
                elif kind == "inlineStr":
                    value = "".join(cell.find("s:is", ns).itertext())
                elif value and kind not in ("str", "e", "b"):
                    style = int(cell.get("s", "0"))
                    fmt = formats[style] if style < len(formats) else 0
                    pattern = re.sub(r'"[^"]*"|\\.', "", custom.get(fmt, ""))
                    if 14 <= fmt <= 22 or re.search(r"[dy]", pattern, re.I):
                        value = (epoch + datetime.timedelta(days=float(value))).date().isoformat()
                if value:
                    column = re.sub(r"\d", "", cell.get("r", "A1"))
                    index = 0
                    for char in column:
                        index = index * 26 + ord(char) - 64
                    values[index - 1] = value
            if values:
                rows.append({"row": int(row.get("r")), "values": [values.get(i, "") for i in range(max(values) + 1)]})
        output.append({"name": sheet.get("name"), "rows": rows})
    print(json.dumps({"sheets": output}, ensure_ascii=False))
