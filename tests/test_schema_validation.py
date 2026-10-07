import json
import unittest
from copy import deepcopy
from pathlib import Path

from tools.validate_schema import validate_schema


ROOT = Path(__file__).resolve().parents[1]


class SchemaValidationTests(unittest.TestCase):
    def test_canonical_datasets_satisfy_the_json_schema(self):
        for path in sorted((ROOT / "atlases").glob("*/atlas.json")):
            with self.subTest(atlas=path.parent.name):
                document = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual(validate_schema(document), [])

    def test_schema_rejects_unrecognized_properties(self):
        path = ROOT / "atlases" / "hippopotamus" / "atlas.json"
        document = deepcopy(json.loads(path.read_text(encoding="utf-8")))
        document["unrecognized_release_fact"] = True
        errors = validate_schema(document)
        self.assertTrue(errors)
        self.assertIn("Additional properties are not allowed", errors[0].message)

    def test_schema_requires_japanese_and_russian_coverage(self):
        path = ROOT / "atlases" / "hippopotamus" / "atlas.json"
        document = deepcopy(json.loads(path.read_text(encoding="utf-8")))
        del document["coverage"]["translations"]["ru"]
        errors = validate_schema(document)
        self.assertTrue(any("'ru' is a required property" in error.message for error in errors))


if __name__ == "__main__":
    unittest.main()
