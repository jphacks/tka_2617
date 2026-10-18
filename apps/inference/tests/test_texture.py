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

from pitari import detections, texture
from pitari.app import texture_image, texture_status, textures

GARMENT = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
BACK = "33333333-3333-4333-8333-333333333333"


class TextureTests(unittest.TestCase):
    def setUp(self):
        self.raw = cv2.imencode(".jpg", np.full((40, 30, 3), 128, dtype=np.uint8))[1].tobytes()
        texture.waiting.clear()
        texture.active.clear()

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
            textures(GARMENT, "shirt", self.upload(), self.upload(), None, BACK)
            self.assertEqual(submit.call_args.kwargs["back_image_id"], BACK)
            self.assertIsNone(submit.call_args.kwargs["front_saved"])
            saved = {"widthPx": 30, "heightPx": 40, "paperCorners": [[1, 2], [29, 2], [29, 38], [1, 38]],
                     "points": [{"id": 1, "x": 10, "y": 8, "score": None}], "bbox": [2, 3, 28, 38]}
            textures(GARMENT, "shirt", self.upload(), self.upload(), None, BACK, json.dumps(saved))
            self.assertEqual(json.loads(json.dumps(submit.call_args.kwargs["front_saved"])), saved)
            for bad in (("not-a-uuid", None), (BACK, "{}"), (BACK, json.dumps({**saved, "points": [{"id": 99, "x": 1, "y": 1}]})),
                        (BACK, json.dumps({**saved, "bbox": [28, 3, 2, 38]}))):
                with self.assertRaises(HTTPException) as caught:
                    textures(GARMENT, "shirt", self.upload(), self.upload(), None, *bad)
                self.assertEqual(caught.exception.status_code, 400)
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
            self.assertEqual(texture.waiting[GARMENT], ("trousers", b"new", b"back", None, None, None))
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
                    texture.make(GARMENT, "long_sleeve_top", self.raw, self.raw, None, None, registered, back_image_id=BACK)
                # 同じ秒の再生成でも前のフォルダと衝突しない。
                clock.now.return_value = created.replace(microsecond=123457)
                with patch.object(texture.photo_to_texture, "make_texture", side_effect=SystemExit("点が足りません")):
                    texture.make(GARMENT, "long_sleeve_top", self.raw, None, None, None, registered)
            runs = sorted(Path(folder).iterdir())
            self.assertEqual([run.name for run in runs], ["2026-10-18_00-30-10_長そで_11111111", "2026-10-18_00-30-10_長そで_11111111_2"])
            done, failed = [json.loads((run / "job.json").read_text(encoding="utf-8")) for run in runs]
            self.assertEqual(done["status"], "done")
            self.assertEqual(done["backImageId"], BACK)
            self.assertEqual(done["textureFile"], "2026-10-18_00-30-10_長そで_11111111.png")
            self.assertEqual((runs[0] / done["textureFile"]).read_bytes(), (runs[0] / "texture.png").read_bytes())
            self.assertEqual(done["garmentCreatedAt"], "2026-10-17T11:12:59+09:00")
            self.assertEqual(done["completedAt"], created.isoformat())
            self.assertEqual(failed["status"], "failed")
            self.assertEqual(failed["error"], "点が足りません")
            self.assertNotIn("textureFile", failed)
            self.assertTrue((runs[1] / "input_front.jpg").is_file())

    def test_photos_cut_out_before_skip_the_models(self):
        back = cv2.imencode(".jpg", np.full((40, 30, 3), 60, dtype=np.uint8))[1].tobytes()
        mask = np.zeros((40, 30), np.uint8)
        mask[5:35, 5:25] = 255
        points = [{"id": 1, "x": 10.0, "y": 8.0, "score": 0.9}]
        seen = {}

        def generate(out, views, inference, **kwargs):
            seen.update(views)
            (out / "texture.png").write_bytes(b"generated png")
            return {"coverage": {}}

        with tempfile.TemporaryDirectory() as folder, patch.object(texture, "OUTPUT", Path(folder) / "textures"), \
                patch.object(detections, "FOLDER", Path(folder) / "detections"):
            # シャツは長そでとして切り抜く。
            detections.remember(self.raw, 30, 40, "long_sleeve_top", [2, 3, 28, 38], [], points, mask, "v1")
            with patch.object(texture.photo_to_texture, "make_texture", side_effect=generate):
                texture.make(GARMENT, "shirt", self.raw, back, None, None)
        self.assertEqual(seen["front"]["detection"]["points"], points)
        self.assertTrue(np.array_equal(seen["front"]["detection"]["mask"], mask))
        self.assertIsNone(seen["back"]["detection"])

    def test_saved_front_is_handed_to_the_converter(self):
        saved = {"widthPx": 30, "heightPx": 40, "paperCorners": [], "points": [{"id": 1, "x": 10.0, "y": 8.0, "score": None}]}
        seen = {}

        def generate(out, views, inference, **kwargs):
            seen.update(views)
            (out / "texture.png").write_bytes(b"generated png")
            return {"coverage": {}}

        with tempfile.TemporaryDirectory() as folder, patch.object(texture, "OUTPUT", Path(folder)),                 patch.object(texture.photo_to_texture, "make_texture", side_effect=generate):
            texture.make(GARMENT, "shirt", self.raw, self.raw, None, None, front_saved=saved)
        self.assertEqual(seen["front"]["saved"], saved)
        self.assertNotIn("saved", seen["back"])

    def test_run_name_is_in_japan_time(self):
        name = texture.run_name(GARMENT, "trousers", datetime(2026, 10, 17, tzinfo=timezone.utc))
        self.assertEqual(name, "2026-10-17_09-00-00_パンツ_11111111")
        self.assertEqual(texture.run_name(GARMENT, "shirt", datetime(2026, 10, 17, tzinfo=timezone.utc)), "2026-10-17_09-00-00_シャツ_11111111")

    def write_job(self, folder, name, **job):
        (folder / name).mkdir()
        (folder / name / "job.json").write_text(json.dumps(job, ensure_ascii=False), encoding="utf-8")
        return folder / name

    def test_latest_job_is_the_newest_folder_of_the_garment(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(texture, "OUTPUT", Path(folder)):
            root = Path(folder)
            self.assertIsNone(texture.latest(GARMENT))
            self.write_job(root, "2026-10-17_10-00-00_Tシャツ_11111111", garmentId=GARMENT, status="done",
                           createdAt="2026-10-17T10:00:00+09:00", backImageId=BACK)
            newest = "2026-10-17_10-00-00_Tシャツ_11111111_2"
            self.write_job(root, newest, garmentId=GARMENT, status="failed", error="点が足りません",
                           createdAt="2026-10-17T10:00:00.5+09:00", backImageId=BACK)
            # 先頭8文字が同じ別の服は、job.jsonの服IDで外す
            self.write_job(root, "2026-10-17_11-00-00_Tシャツ_11111111", garmentId="11111111-0000-4000-8000-000000000000",
                           status="done", createdAt="2026-10-17T11:00:00+09:00")
            self.assertEqual(texture.latest(GARMENT),
                             {"status": "failed", "job": newest, "error": "点が足りません", "backImageId": BACK})
            # 待ちや作業中の服は、フォルダの前の作業ではなく、その状態を返す
            texture.active[GARMENT] = BACK
            self.assertEqual(texture.latest(GARMENT)["status"], "running")
            texture.waiting[GARMENT] = ("trousers", b"front", b"back", None, OTHER)
            self.assertEqual(texture.latest(GARMENT), {"status": "queued", "job": None, "error": None, "backImageId": OTHER})

    def test_texture_file_is_only_for_done_jobs_of_the_garment(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(texture, "OUTPUT", Path(folder)):
            root = Path(folder)
            done = self.write_job(root, "done_11111111", garmentId=GARMENT, status="done")
            (done / "texture.png").write_bytes(b"png")
            failed = self.write_job(root, "failed_11111111", garmentId=GARMENT, status="failed")
            (failed / "texture.png").write_bytes(b"png")
            self.assertEqual(texture.texture_file(GARMENT, "done_11111111"), done / "texture.png")
            for garment_id, name in ((OTHER, "done_11111111"), (GARMENT, "failed_11111111"), (GARMENT, "missing"),
                                     (GARMENT, "../done_11111111"), (GARMENT, ".."), (GARMENT, "")):
                self.assertIsNone(texture.texture_file(garment_id, name), name)

    def test_status_and_image_endpoints_return_404_without_jobs(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(texture, "OUTPUT", Path(folder)):
            for call in (lambda: texture_status(GARMENT), lambda: texture_image(GARMENT, "missing")):
                with self.assertRaises(HTTPException) as caught:
                    call()
                self.assertEqual(caught.exception.status_code, 404)
            with self.assertRaises(HTTPException) as caught:
                texture_status("not-a-uuid")
            self.assertEqual(caught.exception.status_code, 400)
