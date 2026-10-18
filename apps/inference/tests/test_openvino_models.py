import importlib.util
import unittest

from pitari import openvino_models
from pitari.models import DETECTOR

HAS_TRANSFORMERS = all(importlib.util.find_spec(name) for name in ("torch", "transformers"))


@unittest.skipUnless(HAS_TRANSFORMERS, "torchとtransformersがない（CIでは入れていない）")
class OpenVinoModelTests(unittest.TestCase):
    def test_text_masks_match_transformers(self):
        import torch
        from transformers.models.grounding_dino.modeling_grounding_dino import generate_masks_with_special_tokens_and_transfer_map

        captions = [
            [101, 2460, 10353, 1056, 1011, 3797, 1012, 2146, 10353, 2327, 1012, 15292, 1012, 102],
            [101, 15292, 1012, 102],
            # [CLS]がない文、?で区切る文、区切りのない文
            [2000, 2001, 1012, 2002],
            [101, 1029, 1029, 102],
            [2000, 2001, 2002],
        ]
        for caption in captions:
            for pad in (0, 5):
                ids = torch.tensor([caption + [0] * pad])
                expected = generate_masks_with_special_tokens_and_transfer_map(ids)
                actual = openvino_models.text_masks(ids)
                self.assertTrue(torch.equal(expected[0], actual[0]), (caption, pad))
                self.assertTrue(torch.equal(expected[1], actual[1]), (caption, pad))

    @unittest.skipUnless((DETECTOR / "config.json").is_file(), "服の検出モデルが未配置")
    def test_detector_inputs_have_a_fixed_shape_and_mask_the_margin(self):
        from PIL import Image
        from transformers import AutoProcessor

        processor = AutoProcessor.from_pretrained(DETECTOR, local_files_only=True)
        # 縦長の9:16は長辺を1066に収める。
        for size, shape, valid in (((1200, 1600), "portrait", (1066, 800)), ((1600, 1200), "landscape", (800, 1066)),
                                   ((300, 400), "portrait", (1066, 800)), ((900, 1600), "portrait", (1066, 600))):
            feed, ids = openvino_models.detector_inputs(processor, Image.new("RGB", size), "trousers.")
            self.assertEqual(feed["pixel_values"].shape, (1, 3, *openvino_models.DETECTOR_SHAPES[shape]))
            self.assertEqual(feed["input_ids"].shape, (1, openvino_models.TEXT_LENGTH))
            mask = feed["pixel_mask"][0]
            self.assertEqual((int(mask[:, 0].sum()), int(mask[0].sum())), valid)
            self.assertEqual(ids.tolist(), [[101, 15292, 1012, 102]])
            self.assertEqual(feed["attention_mask"][0].tolist(), [1] * 4 + [0] * (openvino_models.TEXT_LENGTH - 4))
