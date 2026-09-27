import csv
import json
import pathlib
import sys
import types
import unittest
from unittest.mock import patch


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.modules.setdefault("scrapetube", types.SimpleNamespace(get_search=lambda *args, **kwargs: []))
from update_website import find_episode, reconcile_state_with_csv


class EpisodeStateTests(unittest.TestCase):
    def test_committed_csv_corrects_stale_state(self):
        with (ROOT / "data" / "episodes.csv").open(encoding="utf-8") as f:
            rows = list(csv.reader(f))
        with (ROOT / "data" / "state.json").open(encoding="utf-8") as f:
            state = json.load(f)

        self.assertEqual(reconcile_state_with_csv(state, rows), 4826)
        self.assertEqual(state["total_found"], 4820)

    def test_new_episode_search_rejects_precap_and_short(self):
        def video(title, duration):
            return {
                "title": {"runs": [{"text": title}]},
                "videoId": "abcdefghijk",
                "ownerText": {"runs": [{"text": "Sony SAB"}]},
                "lengthText": {"simpleText": duration},
            }

        candidates = [
            video("Ep 4827 - PRECAP!", "0:36"),
            video("Ep 4827 - Short", "11:04"),
        ]
        with patch("update_website.scrapetube.get_search", return_value=candidates):
            self.assertIsNone(find_episode(4827, require_full=True))


if __name__ == "__main__":
    unittest.main()
