const TEAM_LOGO_MAP: Record<string, string> = {
  "Red Bull Racing":
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/red-bull-racing-logo.png.transform/3col/image.png",
  Mercedes:
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/mercedes-logo.png.transform/3col/image.png",
  Ferrari:
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/ferrari-logo.png.transform/3col/image.png",
  McLaren:
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/mclaren-logo.png.transform/3col/image.png",
  "Aston Martin":
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/aston-martin-logo.png.transform/3col/image.png",
  Alpine:
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/alpine-logo.png.transform/3col/image.png",
  Williams:
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/williams-logo.png.transform/3col/image.png",
  "Haas F1 Team":
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2024/haas-logo.png.transform/3col/image.png",
  "Kick Sauber":
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2025/kick-sauber-logo.png.transform/3col/image.png",
  "Visa Cash App Racing Bulls":
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2024/rb-logo.png.transform/3col/image.png",
  RB: "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2024/rb-logo.png.transform/3col/image.png",
  "Stake F1 Team Kick Sauber":
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2024/stake-f1-team-kick-sauber-logo.png.transform/3col/image.png",
  "Alfa Romeo":
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2023/alfa-romeo-logo.png.transform/3col/image.png",
  AlphaTauri:
    "https://media.formula1.com/d_team_logo_fallback_image.png/content/dam/fom-website/teams/2023/alphatauri-logo.png.transform/3col/image.png",
};

const NORMALIZED_TEAM_OVERRIDES: Record<string, string> = {
  "oracle red bull": "Red Bull Racing",
  "oracle red bull racing": "Red Bull Racing",
  "visa cash app red bull racing": "Red Bull Racing",
  "red bull": "Red Bull Racing",
  "red bull racing": "Red Bull Racing",
  "red bull racing honda": "Red Bull Racing",
  "red bull racing honda rbpt": "Red Bull Racing",
  "red bull racing rbpt": "Red Bull Racing",
  "mercedes amg": "Mercedes",
  mercedesamg: "Mercedes",
  "mercedesamg petronas": "Mercedes",
  "mercedes amg petronas": "Mercedes",
  "mercedes amg petronas f1 team": "Mercedes",
  "mercedes amg petronas formula one team": "Mercedes",
  ferrari: "Ferrari",
  "scuderia ferrari": "Ferrari",
  "scuderia ferrari hp": "Ferrari",
  "ferrari hp": "Ferrari",
  mclaren: "McLaren",
  "mclaren f1 team": "McLaren",
  "mclaren mercedes": "McLaren",
  "aston martin": "Aston Martin",
  "aston martin aramco": "Aston Martin",
  "aston martin aramco cognizant": "Aston Martin",
  "aston martin aramco mercedes": "Aston Martin",
  "aston martin f1 team": "Aston Martin",
  alpine: "Alpine",
  "bwt alpine": "Alpine",
  "bwt alpine f1 team": "Alpine",
  williams: "Williams",
  "williams racing": "Williams",
  "williams f1 team": "Williams",
  haas: "Haas F1 Team",
  hass: "Haas F1 Team",
  "hass f1": "Haas F1 Team",
  "hass f1 team": "Haas F1 Team",
  "haas f1": "Haas F1 Team",
  "haas f1 team": "Haas F1 Team",
  "alfa romeo": "Alfa Romeo",
  "alfa romeo f1 team": "Alfa Romeo",
  alphatauri: "AlphaTauri",
  "alpha tauri": "AlphaTauri",
  "scuderia alphatauri": "AlphaTauri",
  rb: "RB",
  "rb f1 team": "RB",
  "visa cash app": "RB",
  "visa cash app rb": "RB",
  "visa cash app rb f1 team": "RB",
  "visa cash app rb f1": "RB",
  "racing bulls": "Visa Cash App Racing Bulls",
  "visa cash app racing bulls": "Visa Cash App Racing Bulls",
  "visa cash app racing bulls f1 team": "Visa Cash App Racing Bulls",
  "stake f1 team kick sauber": "Stake F1 Team Kick Sauber",
  "stake f1 team kick sauber team": "Stake F1 Team Kick Sauber",
  "stake f1 team kick sauber f1 team": "Stake F1 Team Kick Sauber",
  "stake f1 team": "Stake F1 Team Kick Sauber",
  "stake sauber": "Stake F1 Team Kick Sauber",
  stake: "Stake F1 Team Kick Sauber",
  "kick sauber": "Kick Sauber",
  "sauber f1 team": "Kick Sauber",
  sauber: "Kick Sauber",
};

const normalizeTeamName = (teamName: string) =>
  teamName
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

export const getTeamDisplayName = (teamName: string) => {
  const normalized = normalizeTeamName(teamName);
  const canonical = NORMALIZED_TEAM_OVERRIDES[normalized];
  if (canonical) {
    return canonical;
  }
  if (normalized.includes("visa cash app red bull")) return "Red Bull Racing";
  if (normalized.includes("red bull")) return "Red Bull Racing";
  if (normalized.includes("mercedes")) return "Mercedes";
  if (normalized.includes("ferrari")) return "Ferrari";
  if (normalized.includes("mclaren")) return "McLaren";
  if (normalized.includes("aston martin")) return "Aston Martin";
  if (normalized.includes("alpine")) return "Alpine";
  if (normalized.includes("williams")) return "Williams";
  if (normalized.includes("haas") || normalized.includes("hass")) return "Haas F1 Team";
  if (normalized.includes("alfa romeo")) return "Alfa Romeo";
  if (normalized.includes("alphatauri") || normalized.includes("alpha tauri")) return "AlphaTauri";
  if (normalized.includes("racing bulls")) return "Visa Cash App Racing Bulls";
  if (normalized.split(" ").includes("rb") || normalized.includes("visa cash app rb")) return "RB";
  if (normalized.includes("stake")) return "Stake F1 Team Kick Sauber";
  if (normalized.includes("kick sauber")) return "Kick Sauber";
  if (normalized.includes("sauber")) return "Kick Sauber";
  return teamName;
};

export const getTeamLogoUrl = (teamName: string) => {
  const displayName = getTeamDisplayName(teamName);
  return TEAM_LOGO_MAP[displayName] ?? null;
};

export const getTeamInitials = (teamName: string) => {
  const words = teamName
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[1][0]}`.toUpperCase();
};
