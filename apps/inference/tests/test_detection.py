import base64
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import UploadFile

from pitari import detections
from pitari.app import detect


class DetectionTests(unittest.TestCase):
    def setUp(self):
        self.image = np.full((500, 700, 3), 180, dtype=np.uint8)
        cv2.rectangle(self.image, (30, 60), (240, 357), (255, 255, 255), -1)
        cv2.rectangle(self.image, (310, 70), (610, 410), (90, 30, 20), -1)
        self.raw = cv2.imencode(".jpg", self.image)[1].tobytes()
        self.corners = [[30, 60], [240, 60], [240, 357], [30, 357]]
        self.box = [290, 50, 630, 430]
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.cache = Path(folder.name)
        cache = patch.object(detections, "FOLDER", self.cache)
        cache.start()
        self.addCleanup(cache.stop)

    def request(self, stage, **options):
        return detect(UploadFile(io.BytesIO(self.raw), filename="test.jpg"), json.dumps({"category": "auto", "stage": stage, **options}))

    def test_stages_keep_the_original_frame_and_do_not_repeat_models(self):
        with patch("pitari.app.models") as models:
            models.detect.return_value = ("short_sleeve_top", self.box)
            models.landmarks.return_value = [{"id": 7, "x": 320, "y": 90, "score": 0.9}]
            paper = self.request("paper")
            self.assertAlmostEqual(paper["pixelsPerCm"], 10, delta=0.1)
            models.detect.assert_not_called()
            garment = self.request("garment", paperCorners=self.corners)
            self.assertEqual(garment["bbox"], self.box)
            models.landmarks.assert_not_called()
            landmarks = self.request("landmarks", category="short_sleeve_top", bbox=self.box, paperCorners=self.corners)
            self.assertEqual(landmarks["points"][0]["x"], 320)
            self.assertEqual(models.landmarks.call_args.args[0].shape, self.image.shape)
            cutout = self.request("cutout", category="short_sleeve_top", bbox=self.box, paperCorners=self.corners)
            self.assertTrue(cutout["cutoutBase64"])
            self.assertEqual(models.detect.call_count, 1)
            self.assertEqual(models.landmarks.call_count, 1)
            for response in [paper, garment, landmarks, cutout]:
                self.assertEqual(base64.b64decode(response["imageBase64"]), self.raw)
                self.assertEqual((response["widthPx"], response["heightPx"]), (700, 500))

    def test_failed_model_returns_editable_geometry_without_fake_points(self):
        with patch("pitari.app.models") as models:
            models.landmarks.side_effect = FileNotFoundError("missing weights")
            result = self.request("landmarks", category="trousers", bbox=self.box, paperCorners=self.corners)
            self.assertEqual(result["points"], [])
            self.assertEqual(result["bbox"], self.box)
            self.assertAlmostEqual(result["pixelsPerCm"], 10)
            self.assertTrue(result["warnings"])

    def test_no_paper_never_produces_a_scale(self):
        with patch("pitari.app.paper_candidate", return_value=[]):
            result = self.request("paper")
            self.assertIsNone(result["pixelsPerCm"])
            self.assertEqual(result["paperCorners"], [])

    def test_long_sleeve_keeps_category_and_33_points_through_cutout(self):
        points = [{"id": i, "x": 320, "y": 90, "score": 0.9} for i in range(1, 34)]
        with patch("pitari.app.models") as models, patch("pitari.app.garment_cutout", return_value=(np.full((20, 20, 4), 255, dtype=np.uint8), np.full((500, 700), 255, dtype=np.uint8))) as cutout:
            models.detect.return_value = ("long_sleeve_top", self.box)
            models.landmarks.return_value = points
            result = self.request("all", paperCorners=self.corners)
            self.assertEqual(result["category"], "long_sleeve_top")
            self.assertEqual(len(result["points"]), 33)
            self.assertTrue(result["cutoutBase64"])
            self.assertEqual(cutout.call_args.args[-2:], (points, "long_sleeve_top"))
            staged = self.request("cutout", category="long_sleeve_top", bbox=self.box, points=points)
            self.assertTrue(staged["cutoutBase64"])

    def test_cutout_with_points_is_remembered_for_the_texture(self):
        points = [{"id": 7, "x": 320, "y": 90, "score": 0.9}]
        self.request("cutout", category="short_sleeve_top", bbox=self.box, paperCorners=self.corners)
        self.assertIsNone(detections.recall(self.raw, 700, 500, "short_sleeve_top"))
        self.request("cutout", category="short_sleeve_top", bbox=self.box, paperCorners=self.corners, points=points)
        record = detections.recall(self.raw, 700, 500, "short_sleeve_top")
        self.assertEqual((record["bbox"], record["paperCorners"], record["points"]), (self.box, self.corners, points))
        self.assertEqual(record["mask"].shape, (500, 700))
        self.assertGreater(record["mask"][240, 460], 0)
        for other in [(self.raw + b"x", 700, 500, "short_sleeve_top"), (self.raw, 700, 500, "trousers"), (self.raw, 350, 250, "short_sleeve_top")]:
            self.assertIsNone(detections.recall(*other))

    def test_mask_rewritten_for_other_points_is_not_paired_with_the_old_record(self):
        points = [{"id": 7, "x": 320, "y": 90, "score": 0.9}]
        self.request("cutout", category="short_sleeve_top", bbox=self.box, paperCorners=self.corners, points=points)
        key = detections.photo_key(self.raw)
        # 別の点で切り抜き直して.pngだけが先に新しくなった状態
        other = np.zeros((500, 700), dtype=np.uint8)
        cv2.rectangle(other, (300, 60), (620, 420), 255, -1)
        (self.cache / f"{key}.png").write_bytes(cv2.imencode(".png", other)[1].tobytes())
        self.assertIsNone(detections.recall(self.raw, 700, 500, "short_sleeve_top"))

    def test_cutout_is_returned_even_if_the_record_cannot_be_written(self):
        points = [{"id": 7, "x": 320, "y": 90, "score": 0.9}]
        with patch.object(detections.os, "replace", side_effect=OSError("disk full")), self.assertLogs("pitari", "WARNING"):
            result = self.request("cutout", category="short_sleeve_top", bbox=self.box, paperCorners=self.corners, points=points)
        self.assertTrue(result["cutoutBase64"])
        self.assertIsNone(detections.recall(self.raw, 700, 500, "short_sleeve_top"))
