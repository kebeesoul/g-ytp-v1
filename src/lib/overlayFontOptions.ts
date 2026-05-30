export const OVERLAY_FONT_OPTIONS = [
  {
    label: "Pretendard",
    family: "Pretendard",
    path: "/Users/issacbae/Library/Fonts/Pretendard-Regular.ttf",
  },
  {
    label: "Apple SD Gothic Neo",
    family: "AppleSDGothicNeo",
    path: "/System/Library/Fonts/AppleSDGothicNeo.ttc",
  },
  {
    label: "SF Pro",
    family: "SF Pro",
    path: "/System/Library/Fonts/SFNS.ttf",
  },
  {
    label: "Helvetica Neue",
    family: "Helvetica Neue",
    path: "/System/Library/Fonts/HelveticaNeue.ttc",
  },
  {
    label: "Avenir Next",
    family: "Avenir Next",
    path: "/System/Library/Fonts/Avenir Next.ttc",
  },
  {
    label: "Futura",
    family: "Futura",
    path: "/System/Library/Fonts/Supplemental/Futura.ttc",
  },
  {
    label: "DIN Condensed",
    family: "DIN Condensed",
    path: "/System/Library/Fonts/Supplemental/DIN Condensed Bold.ttf",
  },
  {
    label: "New York",
    family: "New York",
    path: "/System/Library/Fonts/NewYork.ttf",
  },
  {
    label: "Didot",
    family: "Didot",
    path: "/System/Library/Fonts/Supplemental/Didot.ttc",
  },
  {
    label: "Bodoni 72",
    family: "Bodoni 72",
    path: "/System/Library/Fonts/Supplemental/Bodoni 72.ttc",
  },
  {
    label: "Georgia",
    family: "Georgia",
    path: "/System/Library/Fonts/Supplemental/Georgia.ttf",
  },
  {
    label: "Times New Roman",
    family: "Times New Roman",
    path: "/System/Library/Fonts/Supplemental/Times New Roman.ttf",
  },
] as const;

export type OverlayFontFamily = (typeof OVERLAY_FONT_OPTIONS)[number]["family"];
