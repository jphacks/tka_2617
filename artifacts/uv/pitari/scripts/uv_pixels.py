"""BlenderのUV座標と、画像の左上を原点とするピクセル座標の変換。

座標の約束（uv_template.jsonのcoordinate_systemsと同じ）：
- BlenderのUV：画像の左下の角が(0, 0)、右上の角が(1, 1)。uは右向き、vは上向き。
- テクスチャのピクセル座標：画像の左上の角が(0, 0)。xは右向き、yは下向き。
  画素(col, row)は[col, col+1)×[row, row+1)の正方形で、その中心は(col+0.5, row+0.5)。
- OpenCV流の座標（整数が画素の中心）とは0.5ずれる。x_opencv = x - 0.5。
"""

import numpy as np


def uv_to_pixel(uv, width, height):
    uv = np.asarray(uv, dtype=float)
    return np.stack([uv[..., 0] * width, (1.0 - uv[..., 1]) * height], axis=-1)


def pixel_to_uv(xy, width, height):
    xy = np.asarray(xy, dtype=float)
    return np.stack([xy[..., 0] / width, 1.0 - xy[..., 1] / height], axis=-1)


def texel_center_uv(col, row, width, height):
    return pixel_to_uv(np.stack([np.asarray(col) + 0.5, np.asarray(row) + 0.5], axis=-1), width, height)


def opencv_to_pixel(xy):
    """整数が画素中心の座標（OpenCV、既存の推論の点）を、このテンプレートのピクセル座標へ変換する。"""
    return np.asarray(xy, dtype=float) + 0.5


def pixel_to_opencv(xy):
    return np.asarray(xy, dtype=float) - 0.5
