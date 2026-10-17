import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import HTTPException, UploadFile

from pitari import texture
from pitari.app import textures

GARMENT = "11111111-1111-4111-8111-111111111111"


class TextureTests(unittest.TestCase):
    def setUp(self):
        self.raw = cv2.imencode(".jpg", np.full((40, 30, 3), 128, dtype=np.uint8))[1].tobytes()
        texture.waiting.clear()

    def upload(self, raw=None):
        return UploadFile(io.BytesIO(raw or self.raw), filename="photo.jpg")

    def test_endpoint_accepts_jpegs_and_rejects_bad_input(self):
        with patch("pitari.app.texture.template_ready", return_value=True), patch("pitari.app.texture.submit") as submit:
            self.assertEqual(textures(GARMENT, "short_sleeve_top", self.upload(), self.upload()), {"accepted": True})
            self.assertEqual(submit.call_args.args[:4], (GARMENT, "short_sleeve_top", self.raw, self.raw))
            for garment_id, front in (("not-a-uuid", self.upload()), (GARMENT, self.upload(b"not a jpeg"))):
                with self.assertRaises(HTTPException) as caught:
                    textures(garment_id, "short_sleeve_top", front, None)
                self.assertEqual(caught.exception.status_code, 400)
        with patch("pitari.app.texture.template_ready", return_value=False) as ready:
            with self.assertRaises(HTTPException) as caught:
                textures(GARMENT, "trousers", self.upload(), None)
            self.assertEqual(caught.exception.status_code, 503)
            ready.assert_called_with("trousers")

    def test_waiting_jobs_are_replaced_and_limited(self):
        with patch.object(texture.worker, "submit") as start:
            texture.submit(GARMENT, "trousers", b"old", None, None, None)
            texture.submit(GARMENT, "trousers", b"new", b"back", None, None)
            self.assertEqual(start.call_count, 1)
            self.assertEqual(texture.waiting[GARMENT], ("trousers", b"new", b"back"))
            for number in range(texture.MAX_WAITING - 1):
                texture.submit(f"{number}", "trousers", b"x", None, None, None)
            with self.assertRaises(texture.QueueFull):
                texture.submit("one-too-many", "trousers", b"x", None, None, None)

    def test_results_are_kept_per_run_and_failures_are_recorded(self):
        created = datetime(2026, 10, 17, 11, 0, 0, tzinfo=timezone(timedelta(hours=9)))

        def generate(out, views, inference, **kwargs):
            self.assertEqual(sorted(views), ["back", "front"])
            self.assertEqual(kwargs["category"], "short_sleeve_top")
            (out / "texture.png").write_bytes(b"generated png")
            return {"coverage": {"observed": 0.9}}

        with tempfile.TemporaryDirectory() as folder, patch.object(texture, "OUTPUT", Path(folder)):
            with patch.object(texture, "datetime") as clock:
                clock.now.return_value = created
                with patch.object(texture.photo_to_texture, "make_texture", side_effect=generate):
                    texture.make(GARMENT, "short_sleeve_top", self.raw, self.raw, None, None)
                clock.now.return_value = created + timedelta(seconds=1)
                with patch.object(texture.photo_to_texture, "make_texture", side_effect=SystemExit("点が足りません")):
                    texture.make(GARMENT, "short_sleeve_top", self.raw, None, None, None)
            runs = sorted((Path(folder) / GARMENT).iterdir())
            expected = [(created + timedelta(seconds=s)).astimezone().strftime("%Y%m%d-%H%M%S") for s in (0, 1)]
            self.assertEqual([run.name for run in runs], expected)
            done, failed = [json.loads((run / "job.json").read_text(encoding="utf-8")) for run in runs]
            self.assertEqual(done["status"], "done")
            self.assertEqual(done["coverage"], {"observed": 0.9})
            self.assertTrue((runs[0] / "texture.png").is_file())
            self.assertEqual(failed["status"], "failed")
            self.assertEqual(failed["error"], "点が足りません")
            self.assertTrue((runs[1] / "input_front.jpg").is_file())
