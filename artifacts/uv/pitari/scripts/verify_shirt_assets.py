"""シャツのGLB・SVG・Blenderの座標とUV、および生成テンプレートを照合する。"""

import json
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

from verify_trousers_assets import verify_glb

ROOT = Path(__file__).resolve().parents[1]


def main():
    source = ROOT / "inputs/shirt"
    data = json.loads((ROOT / "shirt/data/mesh_export.json").read_text(encoding="utf-8"))
    info = json.loads((source / "mesh_info.json").read_text(encoding="utf-8"))
    vertices, uv = np.array(data["vertices"]), np.array(data["uv"]["pitari"])
    faces = [face["vertices"] for face in data["faces"]]
    loops = [face["loops"] for face in data["faces"]]
    assert (len(vertices), len(faces)) == (info["verts"], info["faces"])
    svg = ET.parse(source / "uv_layout_pitari.svg").getroot()
    polygons = svg.findall("{http://www.w3.org/2000/svg}polygon")
    assert len(polygons) == len(faces)
    error = 0.0
    for polygon, indices in zip(polygons, loops):
        actual = np.array([[float(v) for v in pair.split(",")] for pair in polygon.attrib["points"].split()])
        expected = uv[indices] * [float(svg.attrib["width"]), -float(svg.attrib["height"])] + [0, float(svg.attrib["height"])]
        error = max(error, float(np.abs(actual - expected).max()))
    assert error < 0.001, "SVGとモデルのUVが一致しません"
    template = json.loads((ROOT / "shirt/uv_template.json").read_text(encoding="utf-8"))
    assert template["category"] == "shirt"
    assert template["checks"]["parts_cover_uv"]
    report = {
        "svg_max_error_px": error,
        "glb": verify_glb(source / "shirt_male.glb", vertices, uv, faces, loops, shape_key_count=15),
        "triangles_cover_uv": template["checks"]["triangles_cover_uv"],
    }
    (ROOT / "shirt/data/asset_validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
