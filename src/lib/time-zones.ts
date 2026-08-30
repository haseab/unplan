export type TimeZoneGroup = {
  label: string;
  zones: string[];
};

const timeZoneRegion = (zone: string) => {
  const separator = zone.indexOf("/");
  return separator > 0 ? zone.slice(0, separator) : "Universal";
};

export const timeZoneDisplayName = (zone: string) =>
  zone.replaceAll("_", " ");

const browserTimeZones = () => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
};

export const buildTimeZoneGroups = (
  currentZone: string,
  supportedZones: readonly string[] = browserTimeZones(),
): TimeZoneGroup[] => {
  const zones = new Set(
    [...supportedZones, "UTC", currentZone]
      .map((zone) => zone.trim())
      .filter(Boolean),
  );
  const collator = new Intl.Collator("en", { sensitivity: "base" });
  const grouped = new Map<string, string[]>();

  [...zones]
    .sort(collator.compare)
    .forEach((zone) => {
      const region = timeZoneRegion(zone);
      const regionZones = grouped.get(region) ?? [];
      regionZones.push(zone);
      grouped.set(region, regionZones);
    });

  return [...grouped]
    .sort(([left], [right]) => {
      if (left === "Universal") return -1;
      if (right === "Universal") return 1;
      return collator.compare(left, right);
    })
    .map(([label, regionZones]) => ({ label, zones: regionZones }));
};
