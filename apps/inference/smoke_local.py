"""起動済みのローカル環境で採寸・保存を確認し、このテストが作った服だけ削除する。"""

import base64
import io
import json
import uuid
import math
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from PIL import Image, ImageDraw

BASE = "http://127.0.0.1:3000"


def request(path, method="GET", payload=None, content_type="application/json"):
    data = json.dumps(payload).encode() if isinstance(payload, dict) else payload
    try:
        with urlopen(Request(BASE + path, data=data, method=method, headers={"Content-Type": content_type}), timeout=130) as response:
            raw = response.read()
            return response.status, json.loads(raw) if raw else None
    except HTTPError as error:
        return error.code, json.loads(error.read())


def multipart(fields, files):
    boundary = uuid.uuid4().hex
    parts = []
    for name, value in fields.items():
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    for name, value in files.items():
        extension, mime = ("png", "image/png") if name == "cutoutImage" else ("jpg", "image/jpeg")
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"; filename="fixture.{extension}"\r\nContent-Type: {mime}\r\n\r\n'.encode() + value + b"\r\n")
    return b"".join(parts) + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"


def main():
    assert request("/api/health")[0] == 200
    assert request("/api/measurements")[0] == 200
    inference_status, model_status = request("/api/inference-status")
    assert inference_status == 200
    for url in ["http://127.0.0.1:8001/status", "http://127.0.0.1:3001/v1/garments"]:
        try:
            urlopen(url, timeout=10)
            raise AssertionError("Bearer token required")
        except HTTPError as error:
            assert error.code == 401
    fixture = Image.new("RGB", (800, 800), "gray")
    ImageDraw.Draw(fixture).rectangle((50, 50, 260, 347), fill="white")
    ImageDraw.Draw(fixture).polygon([(350, 120), (680, 120), (710, 700), (590, 700), (520, 330), (460, 700), (340, 700)], fill=(20, 50, 100))
    buffer = io.BytesIO()
    fixture.save(buffer, format="JPEG")
    jpeg = buffer.getvalue()
    corners = [[50, 50], [260, 50], [260, 347], [50, 347]]
    options = {"category": "trousers", "paperCorners": corners, "bbox": [300, 100, 750, 750], "stage": "paper"}
    payload, content_type = multipart({"options": json.dumps(options)}, {"image": jpeg})
    status, detected = request("/api/detections", "POST", payload, content_type)
    assert status == 200, (status, detected)
    assert math.isclose(detected["pixelsPerCm"], 10)
    assert detected["widthPx"] == 800 and detected["heightPx"] == 800
    assert base64.b64decode(detected["imageBase64"]) == jpeg
    assert detected["bbox"] == options["bbox"]
    assert all(value is None for value in detected["measurements"].values())
    payload, content_type = multipart({"options": json.dumps({**options, "paperCorners": []})}, {"image": jpeg})
    status, uncalibrated = request("/api/detections", "POST", payload, content_type)
    assert status == 200 and abs(uncalibrated["pixelsPerCm"] - 10) < 0.2
    assert len(uncalibrated["paperCorners"]) == 4
    payload, content_type = multipart({"options": json.dumps({**options, "stage": "cutout"})}, {"image": jpeg})
    status, cutout = request("/api/detections", "POST", payload, content_type)
    assert status == 200 and cutout["cutoutBase64"], (status, cutout.get("warnings"))
    png = base64.b64decode(cutout["cutoutBase64"])
    with Image.open(io.BytesIO(png)) as transparent:
        assert transparent.mode == "RGBA"
        assert transparent.getchannel("A").getextrema() == (0, 255)
        assert transparent.width < 800 and transparent.height < 800
    payload, content_type = multipart({"options": json.dumps(options)}, {"image": b"invalid jpeg"})
    assert request("/api/detections", "POST", payload, content_type)[0] == 400
    if not model_status["weightsPresent"]:
        payload, content_type = multipart({"options": json.dumps({**options, "stage": "landmarks"})}, {"image": jpeg})
        status, missing_model = request("/api/detections", "POST", payload, content_type)
        assert status == 200 and missing_model["points"] == [] and missing_model["warnings"]
    detected["points"] = [{"id": 1, "x": 100, "y": 100, "score": None}, {"id": 3, "x": 700, "y": 100, "score": None}]
    status, calculated = request("/api/measurements", "POST", detected)
    assert status == 200 and calculated["measurements"]["waistCm"] == 120
    metadata = {**detected, "name": "local-smoke-" + uuid.uuid4().hex, "measurements": {**calculated["measurements"], "waistCm": 79}}
    del metadata["imageBase64"]
    payload, content_type = multipart({"metadata": json.dumps(metadata)}, {"image": jpeg, "cutoutImage": png})
    status, saved = request("/api/garments", "POST", payload, content_type)
    assert status == 201, (status, saved)
    garment_path = "/api/garments/" + saved["id"]
    try:
        status, detail = request(garment_path)
        assert status == 200 and detail["measurements"]["waistCm"] == 79
        display = next(image for image in detail["images"] if image["role"] == "cutout")
        measurement = next(image for image in detail["images"] if image["role"] == "measurement")
        assert display["paperCorners"] == [] and display["points"] == [] and display["pixelsPerCm"] is None
        assert measurement["points"] == detected["points"] and measurement["paperCorners"] == corners
        assert measurement["id"] == detected["imageId"]
        with urlopen(measurement["url"], timeout=20) as response:
            assert response.status == 200
        with urlopen(display["url"], timeout=20) as response:
            assert response.headers["Content-Type"].startswith("image/png") and response.read() == png
        with urlopen(BASE + garment_path + "/images/" + display["id"], timeout=20) as response:
            assert response.headers["Content-Type"].startswith("image/png") and response.read() == png
        with urlopen(BASE + garment_path + "/images/" + measurement["id"], timeout=20) as response:
            assert response.headers["Content-Type"].startswith("image/jpeg") and response.read() == jpeg
        assert request("/api/garments/" + str(uuid.uuid4()) + "/images/" + display["id"])[0] == 404
        assert request(garment_path + "/images/" + str(uuid.uuid4()))[0] == 404
        assert request(garment_path, "PATCH", {"measurements": {**detail["measurements"], "waistCm": 78}})[0] == 200
        assert request(garment_path)[1]["measurements"]["waistCm"] == 78
        assert any(item["id"] == saved["id"] for item in request("/api/garments?category=trousers")[1]["garments"])
    finally:
        assert request(garment_path, "DELETE")[0] == 204
    assert request(garment_path)[0] == 404
    print("PASS: BFF -> API -> inference, unchanged JPEG, automatic A4 scale, cutout alpha, measurements, PNG save, signed images, update, list, delete")


if __name__ == "__main__":
    main()
