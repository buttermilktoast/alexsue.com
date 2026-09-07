#!/usr/bin/env python3
"""Build signed iOS dashboard shortcuts from the verified iOS export schema.

Steps are an approximation: max(phone today, watch today), not Apple's merged
HealthKit total. --preview reads Health and shows the payload without sending.
Use --from-shortcut to reuse the endpoint/token without printing credentials.
"""

import argparse
import copy
import hashlib
import json
import os
import plistlib
import shlex
import subprocess
import uuid
from pathlib import Path

from read_shortcut import read_shortcut

# The Function URL lives in .env beside the token rather than in the repo.
# It is not a credential -- the bearer token gates the endpoint -- but this
# repo is public, and there is no reason to hand out the address.
ENDPOINT_PLACEHOLDER = "{ENDPOINT}"
PHONE_SOURCE = "Alex iPhone 17"
WATCH_SOURCE = "alex’s Apple Watch"
OBJ = "\ufffc"
ROOT = Path(__file__).resolve().parent


def dotenv_value(path, name):
    """Read one setting literally; never execute shell code or expand variables."""
    if not path.exists():
        return None
    result = None
    for line in path.read_text().splitlines():
        line = line.strip()
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        if separator and key.strip() == name:
            try:
                parts = shlex.split(value, comments=True)
            except ValueError:
                raise ValueError(f"Invalid {name} quoting in .env") from None
            if len(parts) > 1:
                raise ValueError(f"{name} must be a single value")
            result = parts[0] if parts else ""
    return result


def from_template(path, token, endpoint):
    require_token(token)
    require_endpoint(endpoint)
    workflow = json.loads(path.read_text())
    tokens, endpoints = 0, 0
    for item in workflow["WFWorkflowActions"]:
        params = item["WFWorkflowActionParameters"]
        headers = params.get("WFHTTPHeaders", {}).get("Value", {}).get("WFDictionaryFieldValueItems", [])
        for header in headers:
            if (header["WFKey"]["Value"]["string"].lower() == "authorization"
                    and header["WFValue"]["Value"]["string"] == "Bearer {TOKEN}"):
                header["WFValue"]["Value"]["string"] = "Bearer " + token.strip()
                tokens += 1
        if params.get("WFURL") == ENDPOINT_PLACEHOLDER:
            params["WFURL"] = endpoint.strip()
            endpoints += 1
    if tokens != 1:
        raise ValueError("Template must contain exactly one Authorization: Bearer {TOKEN}")
    if endpoints != 1:
        raise ValueError("Template must contain exactly one {ENDPOINT} URL")
    return workflow


def require_token(token):
    if not token or not token.strip() or token.strip() == "{TOKEN}":
        raise ValueError("Set PUSH_TOKEN in .env or the environment before building")


def require_endpoint(endpoint):
    if not endpoint or not endpoint.strip() or endpoint.strip() == ENDPOINT_PLACEHOLDER:
        raise ValueError("Set PUSH_ENDPOINT in .env or the environment before building")


def uuid_for(name):
    h = hashlib.sha256(name.encode()).hexdigest()[:32].upper()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:]}"


def output(name, label):
    return {"Value": {"Type": "ActionOutput", "OutputUUID": uuid_for(name),
                      "OutputName": label},
            "WFSerializationType": "WFTextTokenAttachment"}


def action(identifier, name, **params):
    return {"WFWorkflowActionIdentifier": "is.workflow.actions." + identifier,
            "WFWorkflowActionParameters": {"UUID": uuid_for(name), **params}}


def text_token(template, variables):
    if template.count(OBJ) != len(variables):
        raise ValueError("placeholder count does not match variable count")
    attachments = {}
    index = 0
    for variable in variables:
        index = template.index(OBJ, index)
        # NSRange uses UTF-16 code units, not Python Unicode character indices.
        offset = len(template[:index].encode("utf-16-le")) // 2
        attachments[f"{{{offset}, 1}}"] = variable
        index += 1
    return {"Value": {"string": template, "attachmentsByRange": attachments},
            "WFSerializationType": "WFTextTokenString"}


def named(name):
    return {"Type": "Variable", "VariableName": name}


def find_health(kind, name, source=None):
    # Type/date/group/sort keys copied from Send Health Data's iOS export.
    # v5's Property='Sample Type' and Values={'Sample Type': ...} were invalid.
    rows = [
        {"Bounded": True, "Operator": 4, "Property": "Type", "Removable": False,
         "Values": {"Enumeration": {"Value": kind,
                    "WFSerializationType": "WFStringSubstitutableState"}}},
        {"Operator": 1002, "Property": "Start Date", "Removable": True,
         "Values": {}},
    ]
    if source:
        rows.append({"Operator": 4, "Property": "Source", "Removable": True,
                     # Captured from the user's on-device Source selection.
                     # A String field is ignored by this enumeration picker.
                     "Values": {"Enumeration": {
                         "Value": source,
                         "WFSerializationType": "WFStringSubstitutableState"
                     }, "Unit": 4}})
    params = {
        "WFContentItemFilter": {
            "Value": {"WFActionParameterFilterPrefix": 1,
                      "WFContentPredicateBoundedDate": False,
                      "WFActionParameterFilterTemplates": rows},
            "WFSerializationType": "WFContentPredicateTableTemplate"},
        "WFContentItemLimitEnabled": kind != "Steps",
        "WFContentItemSortProperty": "Start Date",
        "WFContentItemSortOrder": "Ascending" if kind == "Steps" else "Descending",
    }
    if kind == "Steps":
        params["WFHKSampleFilteringGroupBy"] = "Day"
    else:
        params["WFContentItemLimitNumber"] = 1
    return action("filter.health.quantity", name, **params)


def read_values(kind, name, source=None):
    return [
        # The Nothing action clears implicit input so Find queries the store
        # instead of filtering a preceding Health result.
        action("nothing", name + "-clear"),
        find_health(kind, name, source),
        action("properties.health.quantity", name + "-value",
               WFContentItemPropertyName="Value", WFInput=output(name, "Health Samples")),
        action("text.combine", name + "-text", WFTextSeparator="Custom",
               WFTextCustomSeparator=";", text=output(name + "-value", "Value")),
        action("setvariable", name + "-store", WFVariableName=name,
               WFInput=output(name + "-text", "Combined Text")),
    ]


def dictionary(values):
    return {"Value": {"WFDictionaryFieldValueItems": [
        {"WFItemType": 0,
         "WFKey": {"Value": {"string": key}, "WFSerializationType": "WFTextTokenString"},
         "WFValue": {"Value": {"string": value}, "WFSerializationType": "WFTextTokenString"}}
        for key, value in values.items()
    ]}, "WFSerializationType": "WFDictionaryFieldValue"}


def build(token, endpoint=ENDPOINT_PLACEHOLDER, *, phone=PHONE_SOURCE, watch=WATCH_SOURCE, preview=False):
    if not phone.strip() or not watch.strip() or phone == watch:
        raise ValueError("Provide two distinct, nonempty Health source names")
    body = '{"stepsBySource":{"phone":"' + OBJ + '","watch":"' + OBJ + '"},"heartRate":"' + OBJ + '"}'
    actions = [action("comment", "explanation", WFCommentActionText=(
        "Today's approximate steps = the larger phone/watch total. This does not "
        "reproduce Apple Health's merged count. Source names must match Health. "
        "Heart rate is today's latest reading. Empty data is sent as blank, not zero."
    ))]
    actions += read_values("Steps", "phoneToday", phone)
    actions += read_values("Steps", "watchToday", watch)
    actions += read_values("Heart Rate", "heart")
    actions.append(action("gettext", "body", WFTextActionText=text_token(
        body, [named("phoneToday"), named("watchToday"), named("heart")]
    )))
    if preview:
        # Show Result is a text field: a bare attachment imports as blank.
        actions.append(action("showresult", "preview", Text=text_token(
            "Nothing sent to the dashboard.\n\n"
            "Phone (" + phone + "): " + OBJ + "\n"
            "Watch (" + watch + "): " + OBJ + "\n"
            "Heart rate: " + OBJ + "\n\n"
            "Compare with Health. Semicolons separate values to add within one source; "
            "a trailing ;0 does not change the total. The push will use the larger source total.",
            [named("phoneToday"), named("watchToday"), named("heart")]
        )))
    else:
        require_token(token)
        require_endpoint(endpoint)
        actions.append(action("downloadurl", "post", WFURL=endpoint,
            WFHTTPMethod="POST", WFHTTPBodyType="File",
            WFRequestVariable=output("body", "Text"), ShowHeaders=True,
            WFHTTPHeaders=dictionary({"Authorization": f"Bearer {token}",
                                      "Content-Type": "application/json"})))
        # HTTP response is the shortcut output; no blocking popup in automations.
    return {
        "WFWorkflowClientVersion": "5037.109",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowIcon": {"WFWorkflowIconStartColor": 946986751,
                           "WFWorkflowIconGlyphNumber": 59754},
        "WFWorkflowImportQuestions": [], "WFWorkflowTypes": [],
        "WFWorkflowInputContentItemClasses": [], "WFWorkflowActions": actions,
    }


def connection_from(path):
    workflow = read_shortcut(path)
    for item in workflow["WFWorkflowActions"]:
        if item["WFWorkflowActionIdentifier"] != "is.workflow.actions.downloadurl":
            continue
        params = item["WFWorkflowActionParameters"]
        if params.get("WFHTTPMethod") != "POST":
            continue
        headers = params.get("WFHTTPHeaders", {}).get("Value", {}).get("WFDictionaryFieldValueItems", [])
        for header in headers:
            key = header["WFKey"]["Value"]["string"]
            value = header["WFValue"]["Value"]["string"]
            if key.lower() == "authorization" and value.startswith("Bearer "):
                return params["WFURL"], value.removeprefix("Bearer ").strip()
    raise ValueError("No POST with a Bearer token found in the supplied shortcut")


def push_from_preview(preview, token, endpoint):
    """Preserve the on-device-tested reads and wiring; replace only the display."""
    workflow = copy.deepcopy(preview)
    actions = workflow["WFWorkflowActions"]
    if len(actions) < 2 or actions[-1]["WFWorkflowActionIdentifier"] != "is.workflow.actions.showresult":
        raise ValueError("Expected a preview ending in Show Result")
    if actions[-2]["WFWorkflowActionIdentifier"] != "is.workflow.actions.gettext":
        raise ValueError("Expected the request body Text immediately before Show Result")
    if any(a["WFWorkflowActionIdentifier"] == "is.workflow.actions.downloadurl" for a in actions):
        raise ValueError("The preview already contains a network request")
    post = build(token, endpoint)["WFWorkflowActions"][-1]
    post["WFWorkflowActionParameters"]["WFRequestVariable"]["Value"]["OutputUUID"] = actions[-2]["WFWorkflowActionParameters"]["UUID"]
    actions[-1] = post
    return workflow


def hourly_triggers():
    """Twenty-four daily, on-the-hour triggers in Pacific/Honolulu.

    Time-only triggers use a year-zero NSDate. plistlib cannot represent year
    zero, so the writer turns these marker strings into plist <date> elements.
    Year-zero Honolulu uses historical local mean time (UTC-10:31:26),
    not modern HST (UTC-10:00). Using modern HST makes local times :28:34.
    Verified with Foundation Calendar and the IANA Pacific/Honolulu history.
    """
    triggers = []
    for local_hour in range(24):
        utc_hour = (local_hour + 10) % 24
        utc_day = 30 if local_hour < 14 else 31
        date = f"0000-12-{utc_day:02d}T{utc_hour:02d}:31:26Z"
        triggers.append({
            "WFTriggerIdentifier": "WFTimeOfDayTrigger",
            "WFTriggerSerializedParameters": {
                "WFTime": f"__WF_DATE_{date}__",
                "WFTimeEvent": "time",
            },
            "WFTriggerUUID": str(uuid.uuid5(uuid.NAMESPACE_URL,
                                             f"alexsue-dashboard-hour-{local_hour}" )).upper(),
        })
    return triggers


def write_workflow(path, workflow):
    data = plistlib.dumps(workflow, fmt=plistlib.FMT_XML)
    for trigger in workflow.get("WFWorkflowTriggers", []):
        marker = trigger["WFTriggerSerializedParameters"].get("WFTime", "")
        if marker.startswith("__WF_DATE_") and marker.endswith("__"):
            date = marker.removeprefix("__WF_DATE_").removesuffix("__")
            data = data.replace(
                f"<string>{marker}</string>".encode(),
                f"<date>{date}</date>".encode(),
            )
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "wb") as file:
        file.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--token")
    parser.add_argument("--env-file", type=Path, default=ROOT.parent / ".env")
    parser.add_argument("--from-template", type=Path,
                        help="Token-free JSON template (default: dashboard.template.json)")
    parser.add_argument("--from-shortcut", type=Path)
    parser.add_argument("--from-push", type=Path,
                        help="Preserve an existing working push exactly when adding a schedule")
    parser.add_argument("--from-preview", type=Path,
                        help="Preserve a tested preview's actions and replace its final display with POST")
    parser.add_argument("--endpoint")
    parser.add_argument("--phone", default=PHONE_SOURCE)
    parser.add_argument("--watch", default=WATCH_SOURCE)
    parser.add_argument("--preview", action="store_true")
    parser.add_argument("--hourly", action="store_true",
                        help="attach 24 daily Time of Day triggers at :00 Honolulu time")
    parser.add_argument("--name")
    args = parser.parse_args()
    use_template = args.from_template or not (args.from_push or args.from_shortcut or args.from_preview or args.preview)
    if args.from_template and (args.from_push or args.from_shortcut or args.from_preview or args.preview):
        parser.error("--from-template cannot be combined with other source options")
    if use_template and (args.phone != PHONE_SOURCE or args.watch != WATCH_SOURCE):
        parser.error("Edit the template to change the Health sources")
    if args.from_push and (args.from_preview or args.preview or args.from_shortcut
                           or args.endpoint or args.token):
        parser.error("--from-push cannot be combined with preview or connection overrides")
    endpoint, token = args.endpoint, args.token
    if not (args.from_push or args.from_shortcut or args.preview):
        token = token if token is not None else os.environ.get("PUSH_TOKEN")
        if token is None:
            token = dotenv_value(args.env_file, "PUSH_TOKEN")
        endpoint = endpoint or os.environ.get("PUSH_ENDPOINT")
        if endpoint is None:
            endpoint = dotenv_value(args.env_file, "PUSH_ENDPOINT")
    if args.from_push:
        endpoint, token = connection_from(args.from_push)
    if args.from_shortcut:
        endpoint, token = connection_from(args.from_shortcut)
    workflow = (from_template(args.from_template or ROOT / "dashboard.template.json", token, endpoint)
                if use_template else build(token, args.endpoint or endpoint, phone=args.phone,
                                           watch=args.watch, preview=args.preview))
    if args.from_push:
        workflow = read_shortcut(args.from_push)
    if args.from_preview:
        if args.preview:
            parser.error("--from-preview builds a push; it cannot be combined with --preview")
        workflow = push_from_preview(read_shortcut(args.from_preview), token, args.endpoint or endpoint)
    if args.hourly:
        if args.preview:
            parser.error("--hourly cannot be combined with --preview")
        workflow["WFWorkflowTriggers"] = hourly_triggers()
    name = args.name or ("Dashboard Preview v9" if args.preview else
                         "alexsue.com Dashboard" if args.hourly or use_template else "Dashboard Push v9")
    if Path(name).name != name:
        parser.error("--name must be a filename, not a path")
    out = Path(__file__).resolve().parent
    unsigned, signed = out / f"{name}.unsigned.shortcut", out / f"{name}.shortcut"
    # Keep readable source alongside the signature. Both contain the token
    # for push builds and are ignored by git.
    write_workflow(unsigned, workflow)
    subprocess.run(["shortcuts", "sign", "--mode", "anyone", "--input", str(unsigned),
                    "--output", str(signed)], check=True)
    signed.chmod(0o600)
    # Signing normalizes the client version and adds metadata defaults.
    # The actions, wiring, filters and credentials must survive unchanged.
    verified = read_shortcut(signed)
    if verified["WFWorkflowActions"] != workflow["WFWorkflowActions"]:
        raise ValueError("Signed actions differ from generated source")
    if workflow.get("WFWorkflowTriggers"):
        expected = copy.deepcopy(workflow["WFWorkflowTriggers"])
        for trigger in expected:
            params = trigger["WFTriggerSerializedParameters"]
            params["WFTime"] = params["WFTime"].removeprefix("__WF_DATE_").removesuffix("__")
        if verified.get("WFWorkflowTriggers", []) != expected:
            raise ValueError("Signed hourly triggers differ from generated schedule")
    print(f"Signed and verified: {signed}")


if __name__ == "__main__":
    main()
