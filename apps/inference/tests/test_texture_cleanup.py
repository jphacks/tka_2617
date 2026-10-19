import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np
from fastapi import HTTPException

from pitari import detections, texture
from pitari.app import delete_textures

GARMENT = "11111111-1111-4111-8111-111111111111"
OTHER = "11111111-2222-4222-8222-222222222222"


class TextureCleanupTests(unittest.TestCase):
    """服を消したら、待ち・作業中・作業後のどれでも、PCに残る写真とテクスチャを片付ける。"""

    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        root = Path(self.folder.name)
        self.output = root / "textures"
        self.output.mkdir()
        self.patches = [patch.object(texture, "OUTPUT", self.output), patch.object(detections, "FOLDER", root / "detections")]
        for started in self.patches:
            started.start()
        self.raw = cv2.imencode(".jpg", np.full((40, 30, 3), 128, dtype=np.uint8))[1].tobytes()
        texture.waiting.clear()
        texture.active.clear()
        texture.deleted.clear()

    def tearDown(self):
        for started in self.patches:
            started.stop()
        self.folder.cleanup()

    def job_folder(self, garment_id, created_at, name=None):
        folder = self.output / (name or f"{created_at.replace(':', '-')}_Tシャツ_{garment_id[:8]}")
        folder.mkdir()
        (folder / "job.json").write_text(json.dumps({"garmentId": garment_id, "createdAt": created_at, "status": "done"}), encoding="utf-8")
        (folder / "input_front.jpg").write_bytes(self.raw)
        return folder

    def test_deleting_removes_the_folders_and_the_cutout_records_of_the_garment_only(self):
        mine = [self.job_folder(GARMENT, "2026-10-18T10:00"), self.job_folder(GARMENT, "2026-10-18T11:00")]
        # 先頭8文字が同じほかの服のフォルダは残す
        other = self.job_folder(OTHER, "2026-10-18T12:00", name=f"2026-10-18_12-00-00_Tシャツ_{OTHER[:8]}")
        detections.remember(self.raw, 30, 40, "short_sleeve_top", [1, 1, 29, 39], [], [], np.zeros((40, 30), np.uint8), "v1")
        self.assertEqual(delete_textures(GARMENT), {"removed": 2, "running": False})
        self.assertFalse(any(folder.exists() for folder in mine))
        self.assertTrue(other.exists())
        self.assertIsNone(detections.recall(self.raw, 30, 40, "short_sleeve_top"))
        self.assertIsNone(texture.latest(GARMENT))

    def test_deleting_a_waiting_job_cancels_it(self):
        with patch.object(texture.worker, "submit") as submit:
            texture.submit(GARMENT, "short_sleeve_top", self.raw, self.raw, None, None)
        self.assertEqual(delete_textures(GARMENT), {"removed": 0, "running": False})
        with patch.object(texture, "make") as make:
            texture.run(*submit.call_args.args[1:])
        make.assert_not_called()
        self.assertEqual(texture.waiting, {})

    def test_a_job_deleted_while_running_is_removed_after_it_finishes(self):
        def make(garment_id, *args, **kwargs):
            self.job_folder(garment_id, "2026-10-18T10:00")
            # 作っている最中に服が消されても、書きかけのフォルダは消さない
            self.assertEqual(delete_textures(garment_id), {"removed": 0, "running": True})
            self.assertTrue(any(self.output.iterdir()))

        texture.waiting[GARMENT] = ("short_sleeve_top", self.raw, self.raw, None, None, None)
        with patch.object(texture, "make", side_effect=make):
            texture.run(GARMENT, None, None)
        self.assertEqual(list(self.output.iterdir()), [])
        self.assertIsNone(texture.latest(GARMENT))
        self.assertEqual(texture.deleted, set())

    def test_only_the_newest_jobs_of_each_garment_are_kept(self):
        for hour in range(10, 15):
            self.job_folder(GARMENT, f"2026-10-18T{hour}:00")
        texture.waiting[GARMENT] = ("short_sleeve_top", self.raw, self.raw, None, None, None)
        with patch.object(texture, "make"):
            texture.run(GARMENT, None, None)
        kept = sorted(json.loads((folder / "job.json").read_text(encoding="utf-8"))["createdAt"] for folder in self.output.iterdir())
        self.assertEqual(kept, ["2026-10-18T12:00", "2026-10-18T13:00", "2026-10-18T14:00"])

    def test_bad_garment_id_is_rejected(self):
        with self.assertRaises(HTTPException) as caught:
            delete_textures("not-a-uuid")
        self.assertEqual(caught.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
