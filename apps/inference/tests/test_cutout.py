import unittest

import cv2
import numpy as np

from pitari.cutout import TROUSERS_OUTLINE, garment_alpha, landmark_outline


class CutoutTests(unittest.TestCase):
    def setUp(self):
        # 明るい床に濃いズボン。服の範囲が写真の縁まであり、脚の間の床は縁に見える床と色が違う。
        # 実写と同じく、点がなければ脚の間の床の色を背景として学べない。
        self.image = np.full((600, 500, 3), (150, 190, 220), dtype=np.uint8)
        cv2.fillPoly(self.image, [np.array([[210, 600], [250, 250], [290, 600]], np.int32)], (80, 110, 150))
        noise = np.random.default_rng(0).integers(-25, 25, self.image.shape)
        self.image = np.clip(self.image.astype(int) + noise, 0, 255).astype(np.uint8)
        legs = np.array([[100, 60], [400, 60], [440, 560], [290, 560], [250, 250], [210, 560], [60, 560]], np.int32)
        cv2.fillPoly(self.image, [legs], (90, 40, 20))
        self.bbox = [0, 0, 499, 599]
        corners = {1: (100, 60), 2: (250, 60), 3: (400, 60), 14: (420, 300), 13: (430, 430), 12: (440, 560), 11: (290, 560), 10: (270, 400), 9: (250, 250), 8: (230, 400), 7: (210, 560), 6: (60, 560), 5: (70, 430), 4: (80, 300)}
        self.points = [{"id": number, "x": x, "y": y, "score": 0.9} for number, (x, y) in corners.items()]

    def test_outline_needs_all_trousers_points(self):
        self.assertEqual(len(landmark_outline(self.points, "trousers")), len(TROUSERS_OUTLINE))
        self.assertIsNone(landmark_outline(self.points, "short_sleeve_top"))
        self.assertIsNone(landmark_outline(self.points[:-1], "trousers"))

    def test_floor_between_the_legs_becomes_background(self):
        alpha = garment_alpha(self.image, self.bbox, [], self.points, "trousers")
        self.assertEqual(alpha[500, 250], 0)
        self.assertEqual(alpha[300, 150], 255)
        self.assertEqual(alpha[300, 350], 255)
        self.assertEqual(alpha[30, 30], 0)
