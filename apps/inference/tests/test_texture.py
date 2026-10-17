import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
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
            self.assertEqual(textures(GARMENT, "long_sleeve_top", self.upload(), self.upload()), {"accepted": True})
            self.assertEqual(submit.call_args.args[:4], (GARMENT, "long_sleeve_top", self.raw, self.raw))
            registered_at = datetime(2026, 10, 17, 2, 12, 59, tzinfo=timezone.utc)
            textures(GARMENT, "long_sleeve_top", self.upload(), self.upload(), registered_at)
            self.assertEqual(submit.call_args.kwargs["garment_created_at"], registered_at)
            textures(GARMENT, "shirt", self.upload(), self.upload())
            self.assertEqual(submit.call_args.args[1], "shirt")
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
            self.assertEqual(texture.waiting[GARMENT], ("trousers", b"new", b"back", None))
            for number in range(texture.MAX_WAITING - 1):
                texture.submit(f"{number}", "trousers", b"x", None, None, None)
            with self.assertRaises(texture.QueueFull):
                texture.submit("one-too-many", "trousers", b"x", None, None, None)

    def test_results_have_registration_and_generation_dates_and_failures_have_no_texture(self):
        registered = datetime(2026, 10, 17, 2, 12, 59, tzinfo=timezone.utc)
        created = datetime(2026, 10, 18, 0, 30, 10, 123456, tzinfo=texture.JST)

        def generate(out, views, inference, **kwargs):
            self.assertEqual(sorted(views), ["back", "front"])
            self.assertEqual(kwargs["category"], "long_sleeve_top")
            (out / "texture.png").write_bytes(b"generated png")
            return {"coverage": {"observed": 0.9}}

        with tempfile.TemporaryDirectory() as folder, patch.object(texture, "OUTPUT", Path(folder)):
            with patch.object(texture, "datetime") as clock:
                clock.now.return_value = created
                with patch.object(texture.photo_to_texture, "make_texture", side_effect=generate):
                    texture.make(GARMENT, "long_sleeve_top", self.raw, self.raw, None, None, registered)
                # 同じ秒の再生成でも前のフォルダと衝突しない。
                clock.now.return_value = created.replace(microsecond=123457)
                with patch.object(texture.photo_to_texture, "make_texture", side_effect=SystemExit("点が足りません")):
                    texture.make(GARMENT, "long_sleeve_top", self.raw, None, None, None, registered)
            runs = sorted(Path(folder).iterdir())
            self.assertEqual([run.name for run in runs], ["2026-10-18_00-30-10_長そで_11111111", "2026-10-18_00-30-10_長そで_11111111_2"])
            done, failed = [json.loads((run / "job.json").read_text(encoding="utf-8")) for run in runs]
            self.assertEqual(done["status"], "done")
            self.assertEqual(done["textureFile"], "2026-10-18_00-30-10_長そで_11111111.png")
            self.assertEqual((runs[0] / done["textureFile"]).read_bytes(), (runs[0] / "texture.png").read_bytes())
            self.assertEqual(done["garmentCreatedAt"], "2026-10-17T11:12:59+09:00")
            self.assertEqual(done["completedAt"], created.isoformat())
            self.assertEqual(failed["status"], "failed")
            self.assertEqual(failed["error"], "点が足りません")
            self.assertNotIn("textureFile", failed)
            self.assertTrue((runs[1] / "input_front.jpg").is_file())

    def test_run_name_is_in_japan_time(self):
        name = texture.run_name(GARMENT, "trousers", datetime(2026, 10, 17, tzinfo=timezone.utc))
        self.assertEqual(name, "2026-10-17_09-00-00_パンツ_11111111")
        self.assertEqual(texture.run_name(GARMENT, "shirt", datetime(2026, 10, 17, tzinfo=timezone.utc)), "2026-10-17_09-00-00_シャツ_11111111")
