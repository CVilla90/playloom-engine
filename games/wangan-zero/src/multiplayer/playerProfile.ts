export const PLAYER_NAME_MAX_LENGTH = 18;
export const WANGAN_SESSION_CAPACITY = 12;

export const CAR_COLOR_OPTIONS = [
  { id: "red", label: "Red", hex: "#d83b3b" },
  { id: "yellow", label: "Yellow", hex: "#e5b83f" },
  { id: "blue", label: "Blue", hex: "#3267a7" },
  { id: "green", label: "Green", hex: "#3f955d" },
  { id: "black", label: "Black", hex: "#20242b" },
  { id: "white", label: "White", hex: "#e9edf2" }
] as const;

export type CarColorId = (typeof CAR_COLOR_OPTIONS)[number]["id"];

export interface PlayerProfile {
  readonly name: string;
  readonly mainColor: CarColorId;
  readonly accentColor: CarColorId;
}

export interface ProfileValidation {
  readonly ok: boolean;
  readonly profile: PlayerProfile | null;
  readonly normalizedName: string;
  readonly reason: string | null;
}

const COLOR_IDS = new Set<string>(CAR_COLOR_OPTIONS.map((option) => option.id));

export function isCarColorId(value: unknown): value is CarColorId {
  return typeof value === "string" && COLOR_IDS.has(value);
}

export function carColorHex(color: CarColorId): string {
  return CAR_COLOR_OPTIONS.find((option) => option.id === color)?.hex ?? CAR_COLOR_OPTIONS[2].hex;
}

export function normalizePlayerName(name: string): string {
  return name.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

export function validatePlayerProfile(input: {
  readonly name?: unknown;
  readonly mainColor?: unknown;
  readonly accentColor?: unknown;
}): ProfileValidation {
  const name = typeof input.name === "string" ? input.name.trim().normalize("NFKC") : "";
  const normalizedName = normalizePlayerName(name);
  if (name.length === 0) {
    return { ok: false, profile: null, normalizedName, reason: "Enter a player name." };
  }
  if (name.length > PLAYER_NAME_MAX_LENGTH) {
    return {
      ok: false,
      profile: null,
      normalizedName,
      reason: `Player names may use at most ${PLAYER_NAME_MAX_LENGTH} characters.`
    };
  }
  if (!isCarColorId(input.mainColor) || !isCarColorId(input.accentColor)) {
    return { ok: false, profile: null, normalizedName, reason: "Choose valid car colors." };
  }

  return {
    ok: true,
    normalizedName,
    reason: null,
    profile: {
      name,
      mainColor: input.mainColor,
      accentColor: input.accentColor
    }
  };
}
