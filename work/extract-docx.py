import sys
import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile(sys.argv[1]) as document:
    item = document.getinfo("word/document.xml")
    if item.file_size > 20_000_000:
        raise ValueError("Document XML exceeds the extraction limit")
    root = ET.fromstring(document.read(item))
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    for paragraph in root.findall(".//w:p", namespace):
        text = "".join(node.text or "" for node in paragraph.iter()
                       if node.tag.rsplit("}", 1)[-1] == "t")
        if text.strip():
            print(text)
