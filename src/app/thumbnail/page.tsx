import { FONTS } from "@/lib/thumbnail/constants";
import { rowToThumbnailPreset } from "@/lib/thumbnail/schema";
import { supabaseServer } from "@/lib/supabase/server";
import { ThumbnailMaker } from "@/components/thumbnail/ThumbnailMaker";

const googleFontsUrl = `https://fonts.googleapis.com/css2?${FONTS
  .flatMap((font) => (font.googleKey ? [`family=${font.googleKey}`] : []))
  .join("&")}&display=swap`;

export const dynamic = "force-dynamic";

export default async function ThumbnailPage() {
  const { data } = await supabaseServer
    .from("thumbnail_presets")
    .select("*")
    .order("slot_index", { ascending: true });
  const presets = (data ?? []).map(rowToThumbnailPreset);

  return (
    <>
      <link rel="stylesheet" href={googleFontsUrl} />
      <ThumbnailMaker initialPresets={presets} />
    </>
  );
}
