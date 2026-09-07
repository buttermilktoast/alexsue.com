#!/usr/bin/env python3
"""Read exported shortcuts without running them; redact HTTP headers in reports.

Apple's signed AEA profile 0 is signed, not confidential. Its certificate
contains the public key needed to verify and unpack the enclosed workflow.
This does not access the protected Shortcuts library or execute any actions.
"""

import argparse
import copy
import json
import plistlib
import struct
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path


def read_shortcut(path):
    path = Path(path).resolve()
    data = path.read_bytes()
    if not data.startswith(b"AEA1"):
        return plistlib.loads(data)
    profile, auth_size = struct.unpack_from("<II", data, 4)
    if profile != 0:
        raise ValueError(f"Unsupported encrypted archive profile: {profile}")
    auth = plistlib.loads(data[12:12 + auth_size])
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        cert = root / "certificate.der"
        cert.write_bytes(auth["SigningCertificateChain"][0])
        public_key = subprocess.run(
            ["openssl", "x509", "-inform", "DER", "-in", str(cert),
             "-pubkey", "-noout"], check=True, capture_output=True,
        ).stdout
        key = root / "public.pem"
        key.write_bytes(public_key)
        archive = root / "workflow.aar"
        subprocess.run(
            ["aea", "decrypt", "-i", str(path), "-o", str(archive),
             "-sign-pub", str(key)], check=True, capture_output=True,
        )
        subprocess.run(
            ["aa", "extract", "-i", str(archive), "-d", str(root),
             "-include-path", "Shortcut.wflow"],
            check=True, capture_output=True,
        )
        workflow = root / "Shortcut.wflow"
        try:
            return plistlib.loads(workflow.read_bytes())
        except plistlib.InvalidFileException:
            # Time-only automation triggers can use year 0, outside Python's
            # date range. Preserve out-of-range dates as strings for inspection.
            xml = subprocess.run(
                ["plutil", "-convert", "xml1", "-o", "-", str(workflow)],
                check=True, capture_output=True,
            ).stdout
            tree = ET.fromstring(xml)
            for date in tree.iter("date"):
                try:
                    plistlib.loads(b"<plist>" + ET.tostring(date) + b"</plist>")
                except (ValueError, OverflowError):
                    date.tag = "string"
            return plistlib.loads(ET.tostring(tree))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("shortcut", type=Path)
    args = parser.parse_args()
    workflow = copy.deepcopy(read_shortcut(args.shortcut))
    for action in workflow.get("WFWorkflowActions", []):
        params = action.get("WFWorkflowActionParameters", {})
        if "WFHTTPHeaders" in params:
            params["WFHTTPHeaders"] = "[REDACTED]"
    print(json.dumps(workflow, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
