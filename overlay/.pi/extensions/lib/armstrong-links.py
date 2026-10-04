import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
from urllib.parse import parse_qs, urlparse


def read_links(xml, include_external=False):
    root = ET.fromstring(xml)
    links = []
    section = ""
    for page in root.findall("page"):
        rows = sorted(page.findall("text"), key=lambda row: (int(row.get("top", "0")), int(row.get("left", "0"))))
        for row in rows:
            text = " ".join("".join(row.itertext()).split())
            if re.match(r"^(Lesson\s+\d|Quiz\s+\d|Unit\s+\d.*(?:Exam|Review))", text, re.I):
                section = text
            for anchor in row.iter("a"):
                url = anchor.get("href", "")
                parsed = urlparse(url)
                if parsed.hostname in ("www.google.com", "google.com") and parsed.path == "/url":
                    url = parse_qs(parsed.query).get("q", parse_qs(parsed.query).get("url", [""]))[0]
                if not (include_external and url.startswith("https://")) and not re.match(r"^https://(?:docs\.google\.com/document/d/|drive\.google\.com/file/d/)[A-Za-z0-9_-]+(?:[/?#]|$)", url):
                    continue
                label = " ".join("".join(anchor.itertext()).split())
                links.append({"url": url, "label": label, "context": section, "page": int(page.get("number"))})
    return links


if __name__ == "__main__":
    result = subprocess.run(["pdftohtml", "-xml", "-stdout", "-i", sys.argv[1]], capture_output=True, timeout=30, check=True)
    if len(result.stdout) > 4 * 1024 * 1024:
        raise ValueError("Link index exceeded the extraction limit")
    print(json.dumps(read_links(result.stdout, "--all" in sys.argv[2:]), ensure_ascii=False))
