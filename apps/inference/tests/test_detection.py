import base64
import io
import json
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import UploadFile

from pitari.app import detect


class DetectionTests(unittest.TestCase):
    def setUp(self):
        self.image = np.full((500, 700, 3), 180, dtype=np.uint8)
        cv2.rectangle(self.image, (30, 60), (240, 357), (255, 255, 255), -1)
        cv2.rectangle(self.image, (310, 70), (610, 410), (90, 30, 20), -1)
        self.raw = cv2.imencode(".jpg", self.image)[1].tobytes()
        self.corners = [[30, 60], [240, 60], [240, 357], [30, 357]]
        self.box = [290, 50, 630, 430]

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
