import unittest

import numpy as np

from pitari.texture import photo_to_texture

try:
    import pitari_fast
except ImportError:
    pitari_fast = None


def square_part(size=8):
    """左上がpart 1、右下がpart 2の正方形を、対角線で2つの三角形に分ける。"""
    part_id = np.ones((size, size), np.uint8)
    part_id[np.triu_indices(size, 1)] = 2
    corners = np.array([[0, 0], [size, 0], [size, size], [0, size]], dtype=float)
    sources = np.array([corners[[0, 2, 3]], corners[[0, 1, 2]]])
    return part_id, sources


class WarpMapsTests(unittest.TestCase):
    def test_same_triangles_map_each_texel_to_the_same_pixel(self):
        part_id, sources = square_part()
        map_x, map_y, written, low = photo_to_texture.warp_maps(part_id, [1, 2], sources, sources, [False, True])
        self.assertTrue(written.all())
        rows, columns = np.indices(part_id.shape)
        # 写真側はOpenCVの座標（整数が画素中心）なので、テクセルの番号と同じになる。
        np.testing.assert_allclose(map_x, columns, atol=1e-5)
        np.testing.assert_allclose(map_y, rows, atol=1e-5)
        np.testing.assert_array_equal(low, part_id == 2)

    def test_texels_of_another_part_are_not_written(self):
        part_id, sources = square_part()
        _, _, written, _ = photo_to_texture.warp_maps(part_id, [2, 2], sources, sources, [False, False])
        np.testing.assert_array_equal(written, part_id == 2)

    @unittest.skipIf(pitari_fast is None, "Rust拡張をビルドしていない（apps/inference/nativeのREADME）")
    def test_rust_matches_python(self):
        random = np.random.default_rng(7)
        part_id = random.integers(1, 4, size=(90, 120), dtype=np.uint8)
        part_id[20:70, 30:100] = 1
        count = 60
        # はみ出す三角形・重なる三角形・面積0の三角形・画素中心を通る辺を含める。
        sources = random.uniform(-20, 140, size=(count, 3, 2))
        sources[:10] = np.round(sources[:10]) + 0.5
        sources[10] = [[5, 5], [10, 10], [15, 15]]
        targets = sources * 1.7 + random.normal(0, 3, size=sources.shape) + [40, 10]
        parts = [int(v) for v in random.integers(1, 4, size=count)]
        low = [bool(v) for v in random.integers(0, 2, size=count)]
        expected = photo_to_texture.warp_maps(part_id, parts, sources, targets, low)
        actual = pitari_fast.warp_maps(part_id, parts, sources, targets, low)
        for name, want, got in zip(["map_x", "map_y", "written", "low"], expected, actual):
            self.assertEqual(got.dtype, want.dtype, name)
            np.testing.assert_allclose(got, want, atol=1e-3, err_msg=name)
        self.assertGreater(expected[2].mean(), 0.3)
