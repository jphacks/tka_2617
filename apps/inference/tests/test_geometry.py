import unittest

import cv2
import numpy as np

from pitari.geometry import paper_scale, crop_transform, decode_heatmaps, paper_candidate
from pitari.cutout import garment_cutout


class GeometryTests(unittest.TestCase):
    def test_scale_is_independent_of_paper_rotation_and_start_corner(self):
        corners = np.array([[0, 0], [210, 0], [210, 297], [0, 297]], dtype=np.float32)
        angle = np.deg2rad(35)
        rotation = np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
        rotated = corners @ rotation.T + [400, 200]
        for start in range(4):
            self.assertAlmostEqual(paper_scale(np.roll(rotated, start, axis=0), 1000, 1000), 10, places=5)

    def test_invalid_corners(self):
        for points in [[[0, 0]] * 4, [[0, 0], [500, 500], [500, 0], [0, 500]], [[0, 0], [900, 0], [900, 500], [0, 500]]]:
            with self.assertRaises(ValueError):
                paper_scale(points, 800, 800)

    def test_perspective_does_not_silently_produce_dimensions(self):
        with self.assertRaises(ValueError):
            paper_scale([[50, 50], [260, 50], [180, 347], [100, 347]], 800, 800)

    def test_landscape_paper(self):
        corners = [[100, 100], [694, 100], [694, 520], [100, 520]]
        self.assertAlmostEqual(paper_scale(corners, 900, 600), 20, places=5)

    def test_cutout_preserves_color_and_removes_leg_gap_and_paper(self):
        image = np.full((500, 700, 3), 180, dtype=np.uint8)
        color = (90, 30, 20)
        cv2.rectangle(image, (280, 50), (550, 180), color, -1)
        cv2.rectangle(image, (280, 180), (370, 450), color, -1)
        cv2.rectangle(image, (460, 180), (550, 450), color, -1)
        cv2.rectangle(image, (30, 60), (240, 357), (255, 255, 255), -1)
        cutout = garment_cutout(image, [20, 30, 580, 480], [[30, 60], [240, 60], [240, 357], [30, 357]])
        self.assertEqual(cutout.shape[2], 4)
        self.assertLess(cutout.shape[1], 300)
        self.assertEqual(cutout[-20, cutout.shape[1] // 2, 3], 0)
        self.assertTrue(np.all(cutout[:, :, :3][cutout[:, :, 3] == 255] == color))
        self.assertEqual(cutout[0, 0, 3], 0)

    def test_blank_image_cannot_be_used_as_cutout(self):
        with self.assertRaises(ValueError):
            garment_cutout(np.full((300, 300, 3), 180, dtype=np.uint8), [30, 30, 270, 270], [])

    def test_decode_category_offset_and_crop_coordinates(self):
        matrix, inverse = crop_transform([200, 100, 500, 700])
        heatmaps = np.zeros((294, 96, 72), dtype=np.float32)
        heatmaps[168, 48, 36] = 0.9
        points = decode_heatmaps(heatmaps, inverse, "trousers", 1000, 1000)
        self.assertEqual(len(points), 1)
        self.assertEqual(points[0]["id"], 1)
        self.assertAlmostEqual(points[0]["x"], 350)
        self.assertAlmostEqual(points[0]["y"], 400)
        self.assertEqual(decode_heatmaps(heatmaps, inverse, "short_sleeve_top", 1000, 1000), [])

    def test_candidate_is_only_a_rectangle_proposal(self):
        image = np.zeros((800, 1000, 3), dtype=np.uint8)
        cv2.rectangle(image, (50, 100), (260, 397), (255, 255, 255), -1)
        self.assertEqual(len(paper_candidate(image)), 4)


if __name__ == "__main__":
    unittest.main()
