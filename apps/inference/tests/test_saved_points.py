import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from PIL import Image

from pitari import texture

photo_to_texture = texture.photo_to_texture
SAVED_POINTS = [{"id": 1, "x": 10.0, "y": 8.0, "score": None}]
SAVED_CORNERS = [[1.0, 2.0], [29.0, 2.0], [29.0, 38.0], [1.0, 38.0]]
MODEL_POINTS = [{"id": 1, "x": 3.0, "y": 3.0, "score": 0.5}, {"id": 2, "x": 4.0, "y": 4.0, "score": 0.5}]
MODEL_CORNERS = [[0.0, 0.0], [5.0, 0.0], [5.0, 5.0], [0.0, 5.0]]


class FakeModels:
    def __init__(self):
        self.calls = []

    def detect(self, image, category):
        self.calls.append("detect")
        return category, [2.0, 3.0, 28.0, 38.0]

    def landmarks(self, image, category, bbox):
        self.calls.append("landmarks")
        return MODEL_POINTS


class SavedPointsTests(unittest.TestCase):
    """採寸画面で確かめた点とA4の四隅を、テクスチャの作業で推論し直して上書きしない。"""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.out = Path(self.folder.name)
        self.photo = self.out / "front.jpg"
        cv2.imwrite(str(self.photo), np.full((40, 30, 3), 128, dtype=np.uint8))
        self.models = FakeModels()
        # テンプレートは生成物でGitに無いので、点を書き出すまでに読むところだけを用意する
        self.template = self.out / "template"
        self.template.mkdir()
        Image.new("L", (4, 4)).save(self.template / "blank.png")
        (self.template / "uv_template.json").write_text(json.dumps({
            "template_id": "test", "template_version": 1, "texture": {"width": 4}, "islands": {},
            "part_id_image": {"path": "blank.png", "values": {"0": "background"}},
            "coverage_spec": {"all_uv_mask": "blank.png"},
        }), encoding="utf-8")

    def tearDown(self):
        self.folder.cleanup()

    def points_record(self, **front):
        # 点を書き出したあとの工程は、この確認では使わないので止める
        with patch.dict(photo_to_texture.TEMPLATE_ROOTS, {"short_sleeve_top": self.template}), \
                patch("pitari.geometry.paper_candidate", return_value=MODEL_CORNERS) as self.paper, \
                patch.object(photo_to_texture, "save_mask", side_effect=SystemExit("ここまで")):
            with self.assertRaises(SystemExit):
                photo_to_texture.make_texture(self.out, {"front": {"photo": self.photo, **front}},
                                              photo_to_texture.Inference(self.models), category="short_sleeve_top")
        return json.loads((self.out / "points_front.json").read_text(encoding="utf-8"))

    def test_saved_points_and_corners_win_over_inference(self):
        saved = {"widthPx": 30, "heightPx": 40, "paperCorners": SAVED_CORNERS, "points": SAVED_POINTS}
        record = self.points_record(saved=saved)
        self.paper.assert_not_called()
        self.assertEqual(record["paperCorners"], SAVED_CORNERS)
        # 保存に無い番号は、推論の点で補う
        self.assertEqual([(p["id"], p["x"], p["y"]) for p in record["points"]], [(1, 10.0, 8.0), (2, 4.0, 4.0)])

    def test_saved_points_win_over_the_cached_cutout(self):
        mask = np.zeros((40, 30), np.uint8)
        mask[5:35, 5:25] = 255
        detection = {"widthPx": 30, "heightPx": 40, "bbox": [2.0, 3.0, 28.0, 38.0], "paperCorners": MODEL_CORNERS,
                     "points": MODEL_POINTS, "mask": mask, "modelVersion": "v1"}
        saved = {"widthPx": 30, "heightPx": 40, "paperCorners": [], "points": SAVED_POINTS}
        record = self.points_record(detection=detection, saved=saved)
        self.assertEqual(record["paperCorners"], MODEL_CORNERS)
        self.assertEqual([(p["id"], p["x"]) for p in record["points"]], [(1, 10.0), (2, 4.0)])
        self.assertEqual(self.models.calls, [])

    def test_partial_saved_corners_are_not_used(self):
        saved = {"widthPx": 30, "heightPx": 40, "paperCorners": SAVED_CORNERS[:3], "points": []}
        record = self.points_record(saved=saved)
        self.paper.assert_called_once()
        self.assertEqual(record["paperCorners"], MODEL_CORNERS)

    def test_saved_values_for_another_size_are_not_used(self):
        saved = {"widthPx": 60, "heightPx": 80, "paperCorners": SAVED_CORNERS, "points": SAVED_POINTS}
        record = self.points_record(saved=saved)
        self.assertEqual(record["paperCorners"], MODEL_CORNERS)
        self.assertEqual(record["points"][0]["x"], 3.0)
        self.assertEqual(self.models.calls, ["detect", "landmarks"])


if __name__ == "__main__":
    unittest.main()
