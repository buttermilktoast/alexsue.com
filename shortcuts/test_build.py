import json
import re
import unittest

from build import OBJ, ROOT, build, dotenv_value, from_template, hourly_triggers, text_token, push_from_preview, write_workflow


TEST_ENDPOINT = "https://example.com/push"


def walk(value):
    yield value
    if isinstance(value, dict):
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def render(token, values):
    text = token["Value"]["string"].encode("utf-16-le")
    ranges = token["Value"]["attachmentsByRange"]
    for span, variable in sorted(ranges.items(), key=lambda item: int(re.findall(r"\d+", item[0])[0]), reverse=True):
        start, length = map(int, re.findall(r"\d+", span))
        text = text[:start * 2] + values[variable["VariableName"]].encode("utf-16-le") + text[(start + length) * 2:]
    return text.decode("utf-16-le")


class ShortcutTests(unittest.TestCase):
    def test_template_changes_only_the_credential_and_endpoint(self):
        path = ROOT / "dashboard.template.json"
        original = json.loads(path.read_text())
        hydrated = from_template(path, "test-secret", "https://example.com/push")
        serialized = json.dumps(hydrated)
        self.assertEqual(serialized.count("test-secret"), 1)
        self.assertEqual(serialized.count("https://example.com/push"), 1)
        restored = serialized.replace("test-secret", "{TOKEN}").replace(
            "https://example.com/push", "{ENDPOINT}")
        self.assertEqual(json.loads(restored), original)
        self.assertEqual(hydrated["WFWorkflowTriggers"], hourly_triggers())
        for token in [None, "", "  ", "{TOKEN}"]:
            with self.assertRaises(ValueError):
                from_template(path, token, "https://example.com/push")
        for endpoint in [None, "", "  ", "{ENDPOINT}"]:
            with self.assertRaises(ValueError):
                from_template(path, "test-secret", endpoint)

    def test_no_committed_file_carries_the_real_endpoint(self):
        # The repo is public. The token has always been a placeholder; the
        # Function URL is now one too, and must stay that way.
        for name in ["dashboard.template.json", "build.py", "README.md"]:
            text = (ROOT / name).read_text()
            self.assertNotIn(".lambda-url.", text, f"{name} carries a real endpoint")
            self.assertNotRegex(text, r"Bearer [A-Za-z0-9_-]{16,}")

    def test_dotenv_is_literal_and_ignores_other_settings(self):
        import tempfile
        from pathlib import Path
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            self.assertIsNone(dotenv_value(path, "PUSH_TOKEN"))
            path.write_text('OTHER=value\nexport PUSH_TOKEN="literal-$(echo unsafe)-$HOME" # comment\n'
                            'PUSH_ENDPOINT=https://example.com/push\n')
            self.assertEqual(dotenv_value(path, "PUSH_TOKEN"), "literal-$(echo unsafe)-$HOME")
            self.assertEqual(dotenv_value(path, "PUSH_ENDPOINT"), "https://example.com/push")
            self.assertIsNone(dotenv_value(path, "ABSENT"))
            path.write_text('PUSH_TOKEN="unclosed\n')
            with self.assertRaisesRegex(ValueError, "Invalid PUSH_TOKEN quoting"):
                dotenv_value(path, "PUSH_TOKEN")

    def test_health_queries_are_today_and_sources_are_separate(self):
        queries = [a["WFWorkflowActionParameters"] for a in build("test", TEST_ENDPOINT)["WFWorkflowActions"]
                   if a["WFWorkflowActionIdentifier"].endswith("filter.health.quantity")]
        self.assertEqual(len(queries), 3)
        sources = []
        for query in queries:
            predicate = query["WFContentItemFilter"]["Value"]
            self.assertEqual(predicate["WFActionParameterFilterPrefix"], 1)
            rows = {r["Property"]: r for r in predicate["WFActionParameterFilterTemplates"]}
            self.assertEqual(rows["Start Date"]["Operator"], 1002)
            kind = rows["Type"]["Values"]["Enumeration"]["Value"]
            if kind == "Steps":
                self.assertFalse(query["WFContentItemLimitEnabled"])
                self.assertEqual(query["WFHKSampleFilteringGroupBy"], "Day")
                source_values = rows["Source"]["Values"]
                self.assertNotIn("String", source_values)
                self.assertEqual(source_values["Enumeration"]["WFSerializationType"], "WFStringSubstitutableState")
                sources.append(source_values["Enumeration"]["Value"])
            else:
                self.assertEqual(kind, "Heart Rate")
                self.assertNotIn("Source", rows)
                self.assertNotIn("Value", rows)  # Original had two empty Value filters.
                self.assertEqual(query["WFContentItemLimitNumber"], 1)
                self.assertEqual(query["WFContentItemSortOrder"], "Descending")
        self.assertEqual(len(set(sources)), 2)

    def test_every_variable_is_bound_to_an_earlier_action(self):
        for preview in [False, True]:
            outputs, variables = set(), set()
            for action in build("test", TEST_ENDPOINT, preview=preview)["WFWorkflowActions"]:
                params = action["WFWorkflowActionParameters"]
                for item in walk(params):
                    if not isinstance(item, dict):
                        continue
                    if item.get("Type") == "ActionOutput":
                        self.assertIn(item["OutputUUID"], outputs)
                    if item.get("Type") == "Variable":
                        self.assertIn(item["VariableName"], variables)
                outputs.add(params["UUID"])
                if action["WFWorkflowActionIdentifier"].endswith("setvariable"):
                    variables.add(params["WFVariableName"])

    def test_payload_keeps_heart_and_step_values_separate(self):
        actions = build("test", TEST_ENDPOINT)["WFWorkflowActions"]
        token = next(a["WFWorkflowActionParameters"]["WFTextActionText"] for a in actions
                     if a["WFWorkflowActionIdentifier"].endswith("gettext"))
        for phone, watch, heart in [("318;294", "401;259", "71"), ("", "11200", ""), ("9800", "", "62")]:
            payload = json.loads(render(token, {"phoneToday": phone, "watchToday": watch, "heart": heart}))
            self.assertEqual(payload, {"stepsBySource": {"phone": phone, "watch": watch}, "heartRate": heart})

    def test_preview_contains_no_network_or_token(self):
        workflow = build("DO-NOT-INCLUDE", preview=True)
        identifiers = [a["WFWorkflowActionIdentifier"] for a in workflow["WFWorkflowActions"]]
        self.assertNotIn("is.workflow.actions.downloadurl", identifiers)
        self.assertNotIn("DO-NOT-INCLUDE", json.dumps(workflow))
        self.assertEqual(identifiers[-1], "is.workflow.actions.showresult")
        text = workflow["WFWorkflowActions"][-1]["WFWorkflowActionParameters"]["Text"]
        self.assertEqual(text["WFSerializationType"], "WFTextTokenString")
        self.assertEqual(text["Value"]["string"].count(OBJ), 3)
        displayed = render(text, {"phoneToday": "1692;0", "watchToday": "1924;0", "heart": "67"})
        self.assertIn("Phone (Alex iPhone 17): 1692;0", displayed)
        self.assertIn("Watch (alex’s Apple Watch): 1924;0", displayed)

    def test_push_from_preview_preserves_tested_source_and_wiring(self):
        preview = build(None, preview=True)
        preview["WFWorkflowActions"][-2]["WFWorkflowActionParameters"]["UUID"] = "EXPORTED-BODY-ID"
        query = next(a["WFWorkflowActionParameters"] for a in preview["WFWorkflowActions"]
                     if a["WFWorkflowActionIdentifier"].endswith("filter.health.quantity"))
        query["WFHKSampleFilteringFillMissing"] = False
        push = push_from_preview(preview, "test", "https://example.com/push")
        self.assertEqual(push["WFWorkflowActions"][:-1], preview["WFWorkflowActions"][:-1])
        post = push["WFWorkflowActions"][-1]["WFWorkflowActionParameters"]
        self.assertEqual(post["WFRequestVariable"]["Value"]["OutputUUID"], "EXPORTED-BODY-ID")
        self.assertEqual(post["WFURL"], "https://example.com/push")
        self.assertEqual(preview["WFWorkflowActions"][-1]["WFWorkflowActionIdentifier"], "is.workflow.actions.showresult")

    def test_push_uses_the_body_output_and_has_no_blocking_popup(self):
        actions = build("test", TEST_ENDPOINT)["WFWorkflowActions"]
        self.assertEqual(actions[-1]["WFWorkflowActionIdentifier"], "is.workflow.actions.downloadurl")
        params = actions[-1]["WFWorkflowActionParameters"]
        self.assertEqual(params["WFRequestVariable"]["Value"]["OutputUUID"], actions[-2]["WFWorkflowActionParameters"]["UUID"])
        self.assertEqual(params["WFHTTPBodyType"], "File")
        self.assertEqual(params["WFHTTPMethod"], "POST")

    def test_text_ranges_use_utf16(self):
        token = text_token("🚶 " + OBJ, [{"Type": "Variable", "VariableName": "steps"}])
        self.assertEqual(render(token, {"steps": "612"}), "🚶 612")

    def test_invalid_configuration_fails_before_signing(self):
        for kwargs in [{"phone": ""}, {"phone": "same", "watch": "same"}]:
            with self.assertRaises(ValueError):
                build("test", TEST_ENDPOINT, **kwargs)
        with self.assertRaises(ValueError):
            build("")

    def test_hourly_triggers_cover_each_honolulu_hour_at_minute_zero(self):
        triggers = hourly_triggers()
        self.assertEqual(len(triggers), 24)
        self.assertEqual(len({t["WFTriggerUUID"] for t in triggers}), 24)
        dates = [t["WFTriggerSerializedParameters"]["WFTime"] for t in triggers]
        self.assertEqual(dates[0], "__WF_DATE_0000-12-30T10:31:26Z__")
        self.assertEqual(dates[13], "__WF_DATE_0000-12-30T23:31:26Z__")
        self.assertEqual(dates[14], "__WF_DATE_0000-12-31T00:31:26Z__")
        self.assertEqual(dates[23], "__WF_DATE_0000-12-31T09:31:26Z__")
        self.assertTrue(all(t["WFTriggerSerializedParameters"]["WFTimeEvent"] == "time"
                            for t in triggers))

    def test_hourly_times_convert_to_local_whole_hours(self):
        from datetime import datetime
        from zoneinfo import ZoneInfo
        for hour, trigger in enumerate(hourly_triggers()):
            encoded = trigger["WFTriggerSerializedParameters"]["WFTime"]
            # Python cannot represent year zero; year one has the same LMT
            # offset. A separate Foundation check covers the actual year zero.
            iso = encoded.removeprefix("__WF_DATE_").removesuffix("__")
            instant = datetime.fromisoformat("0001" + iso[4:])
            local = instant.astimezone(ZoneInfo("Pacific/Honolulu"))
            self.assertEqual((local.hour, local.minute, local.second), (hour, 0, 0))

    def test_writer_serializes_time_only_markers_as_dates(self):
        import tempfile
        from pathlib import Path
        workflow = {"WFWorkflowTriggers": hourly_triggers()}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.shortcut"
            write_workflow(path, workflow)
            data = path.read_text()
        self.assertEqual(data.count("<date>0000-12-"), 24)
        self.assertNotIn("__WF_DATE_", data)


if __name__ == "__main__":
    unittest.main()
