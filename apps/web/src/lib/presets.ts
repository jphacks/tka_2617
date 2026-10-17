import { z } from "zod";

const PresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  source: z.string(),
  thumbs: z.object({ front: z.string(), angle: z.string() }),
});

const HexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

/** Blenderの build_presets.py が書き出す public/presets/presets.json */
export const PresetsSchema = z.object({
  avatar: z.object({ path: z.string() }),
  hair: z.array(PresetSchema),
  shoes: z.array(PresetSchema),
  face: z.object({ path: z.string() }),
  hairColors: z.array(HexColorSchema),
  skinColors: z.array(HexColorSchema),
  sockColors: z.array(HexColorSchema),
});

export type Preset = z.infer<typeof PresetSchema>;
export type Presets = z.infer<typeof PresetsSchema>;
