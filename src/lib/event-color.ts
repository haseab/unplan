import tinycolor from "tinycolor2";

const LIGHT_EVENT_TEXT = "#ffffff";
const DARK_EVENT_TEXT = "#171714";

export const getEventTextColor = (backgroundColor: string) => {
  const background = tinycolor(backgroundColor);
  if (!background.isValid()) return LIGHT_EVENT_TEXT;
  return background.isDark() ? LIGHT_EVENT_TEXT : DARK_EVENT_TEXT;
};
