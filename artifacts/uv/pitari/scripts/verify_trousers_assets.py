"""受領したUV展開図・ランドマーク・GLBと、Blenderから書き出したメッシュの対応を確認する。"""

import json
import struct
import xml.etree.ElementTree as ET
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "inputs/trousers"


def glb_arrays(path):
    raw = path.read_bytes()
    magic, version, length = struct.unpack_from("<4sII", raw)
    assert (magic, version, length) == (b"glTF", 2, len(raw)), "GLBヘッダーが不正です"
    size, kind = struct.unpack_from("<II", raw, 12)
    assert kind == 0x4E4F534A
    document = json.loads(raw[20:20 + size])
    binary_size, kind = struct.unpack_from("<II", raw, 20 + size)
    assert kind == 0x004E4942
    binary = raw[28 + size:28 + size + binary_size]

    def read_view(spec, count, dimensions, component_type):
        view = document["bufferViews"][spec["bufferView"]]
        dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}[component_type]
        itemsize = np.dtype(dtype).itemsize
        return np.ndarray(
            (count, dimensions), dtype=dtype, buffer=binary,
            offset=view.get("byteOffset", 0) + spec.get("byteOffset", 0),
            strides=(view.get("byteStride", dimensions * itemsize), itemsize),
        )

    def read(index):
        accessor = document["accessors"][index]
        dimensions = {"VEC3": 3, "VEC2": 2, "SCALAR": 1}[accessor["type"]]
        result = (read_view(accessor, accessor["count"], dimensions, accessor["componentType"]).copy()
                  if "bufferView" in accessor else np.zeros((accessor["count"], dimensions), dtype=np.float32))
        if "sparse" in accessor:
            sparse = accessor["sparse"]
            indices = read_view(sparse["indices"], sparse["count"], 1, sparse["indices"]["componentType"]).ravel()
            result[indices] = read_view(sparse["values"], sparse["count"], dimensions, accessor["componentType"])
        return result

    return document, read


def verify_glb(path, vertices, uv, faces, face_loops, shape_key_count=11):
    document, read = glb_arrays(path)
    assert len(document["meshes"]) == 1, "服単体のGLBが必要です"
    mesh = document["meshes"][0]
    assert len(mesh["primitives"]) == 1
    primitive = mesh["primitives"][0]
    positions = read(primitive["attributes"]["POSITION"])
    texcoords = read(primitive["attributes"]["TEXCOORD_0"])
    # glTFはYが上で、画像のVもBlenderとは上下が逆。
    expected = np.array([
        [*vertices[v][[0, 2, 1]] * [1, 1, -1], uv[l][0], 1 - uv[l][1]]
        for face, loops in zip(faces, face_loops) for v, l in zip(face, loops)
    ])
    actual = np.column_stack([positions, texcoords])
    expected = np.unique(expected, axis=0)
    # 丸めの境界で誤判定しないよう、座標とUVの組を許容誤差付きで両方向に照合する。
    for a, b in ((actual, expected), (expected, actual)):
        for chunk in np.array_split(a, 16):
            error = np.abs(chunk[:, None] - b[None, :]).max(axis=2).min(axis=1)
            assert np.all(error < 1e-6), f"{path.name}の頂点とUVが元モデルと一致しません"
    triangles = len(read(primitive["indices"])) // 3
    assert triangles == sum(len(f) - 2 for f in faces)
    names = mesh.get("extras", {}).get("targetNames", [])
    assert len(names) == len(primitive.get("targets", [])) == shape_key_count
    return {"file": path.name, "vertices_with_uv_seams": len(positions), "triangles": triangles, "shape_keys": names}


def main():
    data = json.loads((ROOT / "trousers/data/mesh_export.json").read_text(encoding="utf-8"))
    info = json.loads((SOURCE / "mesh_info.json").read_text(encoding="utf-8"))
    landmarks = json.loads((SOURCE / "trousers_landmarks.json").read_text(encoding="utf-8"))
    vertices, uv = np.array(data["vertices"]), np.array(data["uv"])
    faces, face_loops = data["faces"], data["face_loops"]
    assert (len(vertices), len(faces), len(uv)) == (info["verts"], info["faces"], info["loops"])
    assert data["object"] == info["object"] and data["uv_map"] in info["uv_maps"]
    svg = ET.parse(SOURCE / "uv_layout_UVMap.svg").getroot()
    polygons = svg.findall("{http://www.w3.org/2000/svg}polygon")
    assert len(polygons) == len(faces)
    maximum_error = 0.0
    for polygon, loops in zip(polygons, face_loops):
        actual = np.array([[float(v) for v in pair.split(",")] for pair in polygon.attrib["points"].split()])
        expected = uv[loops] * [float(svg.attrib["width"]), -float(svg.attrib["height"])] + [0, float(svg.attrib["height"])]
        assert actual.shape == expected.shape
        maximum_error = max(maximum_error, float(np.abs(actual - expected).max()))
    assert maximum_error < 0.001, "SVGとモデルのUVが一致しません"

    edges = {tuple(sorted((a, b))) for face in faces for a, b in zip(face, face[1:] + face[:1])}
    path = landmarks["front_path"]
    assert path[0] in landmarks["waist"] and path[-1] == landmarks["crotch"]
    assert all(tuple(sorted(edge)) in edges for edge in zip(path, path[1:]))
    for side, indices in landmarks["leg_verts"].items():
        assert all(0 <= i < len(vertices) for i in indices)
        assert (vertices[indices, 0].mean() > 0) == (side == "left")
        assert landmarks["legs"][side]["hem_inner"] in landmarks["legs"][side]["hem"]

    # 採寸ランドマークとUVの切れ目は別物なので、差を記録する。
    from build_trousers_template import boundary_loop, classify, leg_paths

    by_side, kinds = classify(vertices, uv, faces, face_loops)
    seam_anchors = {}
    for side, members in by_side.items():
        loop = boundary_loop(members, faces, face_loops, uv)
        paths = leg_paths(loop, kinds, vertices, side, members, faces, face_loops, uv)
        front = paths["front"]
        crotch = int(np.linalg.norm(vertices - front["center"][0][-1], axis=1).argmin())
        hem = int(np.linalg.norm(vertices - front["inseam"][0][-1], axis=1).argmin())
        assert hem in landmarks["legs"][side]["hem"]
        assert np.allclose(front["center"][0][:len(path)], vertices[path])
        seam_anchors[side] = {
            "crotch_vertex": crotch, "hem_inner_vertex": hem,
            "crotch_landmark_distance_cm": float(np.linalg.norm(vertices[crotch] - vertices[landmarks["crotch"]]) * 100),
            "hem_landmark_distance_cm": float(np.linalg.norm(vertices[hem] - vertices[landmarks["legs"][side]["hem_inner"]]) * 100),
        }

    report = {
        "svg_faces": len(polygons), "svg_max_error_px": maximum_error,
        "landmarks_match": True,
        "uv_seam_anchors": seam_anchors,
        "source_glb": verify_glb(SOURCE / "trousers_male.glb", vertices, uv, faces, face_loops),
    }
    textured = ROOT / "trials/jeans_new_uv/trousers_textured.glb"
    if textured.exists():
        report["textured_glb"] = verify_glb(textured, vertices, uv, faces, face_loops)
        original, read_original = glb_arrays(SOURCE / "trousers_male.glb")
        result, read_result = glb_arrays(textured)
        before, after = original["meshes"][0], result["meshes"][0]
        assert before["extras"]["targetNames"] == after["extras"]["targetNames"]
        for a, b in zip(before["primitives"][0]["targets"], after["primitives"][0]["targets"]):
            assert np.allclose(read_original(a["POSITION"]), read_result(b["POSITION"])), "体型・寸法の変形量が変わっています"
        assert result.get("images"), "テクスチャがGLBに含まれていません"
    (ROOT / "trousers/data/asset_validation.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
