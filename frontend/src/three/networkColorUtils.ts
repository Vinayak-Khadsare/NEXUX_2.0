export interface EdgeColorConfig {
  line: string;
  labelColor: string;
  category: "COMMUNICATION" | "EMPLOYMENT" | "VEHICLE" | "LOCATION" | "ASSOCIATION" | "FINANCIAL" | "OWNERSHIP" | "MOVEMENT";
  categoryLabel: string;
  style: "solid" | "dashed" | "double";
  isDirectional: boolean;
}

export function formatEdgeLabel(label: string): string {
  if (!label) return "LINKED";
  return label
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Normalizes any backend relationship name and maps it to one of the 8 fixed categories:
 * 
 * 1. COMMUNICATES_WITH -> Cyan #22D3EE (Solid line, non-directional)
 * 2. WORKS_FOR / CONTRACTED_BY -> Purple #A78BFA (Solid line, directional)
 * 3. DRIVES / USES_VEHICLE -> Amber/Yellow #FBBF24 (Dashed line, directional)
 * 4. VISITED / LOCATED_AT -> Green #34D399 (Solid line, directional)
 * 5. ASSOCIATED_WITH -> Blue #60A5FA (Dashed line, non-directional)
 * 6. FINANCIAL / TRANSFERRED_MONEY -> Orange #FB923C (Double / thicker solid line, directional)
 * 7. OWNS -> Magenta/Pink #F472B6 (Dashed line, directional)
 * 8. DEPARTED_FROM / MOVED_TO -> Teal #2DD4BF (Solid line with directional arrow)
 */
export function getEdgeColorByType(rawType: string, _theme: string = "dark"): EdgeColorConfig {
  const norm = (rawType || "").trim().toUpperCase().replace(/[\s_-]+/g, "_");
  const isLight = _theme === "light";

  // 1. FINANCIAL / TRANSFERRED_MONEY (Payments, Paid, Wire, Funds, Escrow, Transact)
  if (
    norm.includes("MONEY") ||
    norm.includes("FINANC") ||
    norm.includes("TRANSFER") ||
    norm.includes("PAY") ||
    norm.includes("WIRE") ||
    norm.includes("TRANSACT") ||
    norm.includes("ESCROW") ||
    norm.includes("FUND") ||
    norm.includes("SENT_TO") ||
    norm.includes("INVOICE")
  ) {
    return {
      line: isLight ? "#EA580C" : "#FB923C",
      labelColor: isLight ? "#C2410C" : "#FDBA74",
      category: "FINANCIAL",
      categoryLabel: "Financial",
      style: "double",
      isDirectional: true,
    };
  }

  // 2. COMMUNICATES_WITH (Calls, Messages, Phone, Spoke, Text, Contact)
  if (
    norm.includes("COMMUNICAT") ||
    norm.includes("CALL") ||
    norm.includes("MESSAGE") ||
    norm.includes("PHONE") ||
    norm.includes("SPOKE") ||
    norm.includes("TEXT") ||
    norm.includes("CONTACT")
  ) {
    return {
      line: isLight ? "#0891B2" : "#22D3EE",
      labelColor: isLight ? "#0E7490" : "#67E8F9",
      category: "COMMUNICATION",
      categoryLabel: "Communication",
      style: "solid",
      isDirectional: false,
    };
  }

  // 3. WORKS_FOR / CONTRACTED_BY (Employed, Director, Staff, Consultant, Hired, Employer)
  if (
    norm.includes("WORK") ||
    norm.includes("CONTRACT") ||
    norm.includes("EMPLOY") ||
    norm.includes("DIRECTOR") ||
    norm.includes("STAFF") ||
    norm.includes("CONSULT") ||
    norm.includes("HIRED") ||
    norm.includes("MANAGER") ||
    norm.includes("CHAIRMAN")
  ) {
    return {
      line: isLight ? "#7C3AED" : "#A78BFA",
      labelColor: isLight ? "#6D28D9" : "#C4B5FD",
      category: "EMPLOYMENT",
      categoryLabel: "Employment",
      style: "solid",
      isDirectional: true,
    };
  }

  // 4. DRIVES / USES_VEHICLE (Operates, Transported, Ride, Fleet)
  if (
    norm.includes("DRIVE") ||
    norm.includes("VEHICLE") ||
    norm.includes("OPERAT") ||
    norm.includes("TRANSPORT") ||
    norm.includes("RIDE") ||
    norm.includes("RODE")
  ) {
    return {
      line: isLight ? "#D97706" : "#FBBF24",
      labelColor: isLight ? "#B45309" : "#FDE68A",
      category: "VEHICLE",
      categoryLabel: "Vehicle",
      style: "dashed",
      isDirectional: true,
    };
  }

  // 5. DEPARTED_FROM / MOVED_TO (Movement, Travel, Route, Fled)
  if (
    norm.includes("DEPART") ||
    norm.includes("MOVED") ||
    norm.includes("TRAVEL") ||
    norm.includes("ROUTE") ||
    norm.includes("FLED") ||
    norm.includes("ARRIV")
  ) {
    return {
      line: isLight ? "#0F766E" : "#2DD4BF",
      labelColor: isLight ? "#115E59" : "#5EEAD4",
      category: "MOVEMENT",
      categoryLabel: "Movement",
      style: "solid",
      isDirectional: true,
    };
  }

  // 6. VISITED / LOCATED_AT (Stationed, Stopped, Seen, Accessed, Entered, Headquartered, Based in, Address)
  if (
    norm.includes("VISIT") ||
    norm.includes("LOCAT") ||
    norm.includes("BASE") ||
    norm.includes("ACCESS") ||
    norm.includes("ENTER") ||
    norm.includes("STATION") ||
    norm.includes("STOP") ||
    norm.includes("SEEN") ||
    norm.includes("HEADQUARTER") ||
    norm.includes("PREMISES") ||
    norm.includes("RESID") ||
    norm.includes("ADDRESS")
  ) {
    return {
      line: isLight ? "#059669" : "#34D399",
      labelColor: isLight ? "#047857" : "#6EE7B7",
      category: "LOCATION",
      categoryLabel: "Location",
      style: "solid",
      isDirectional: true,
    };
  }

  // 7. OWNS (Controls, Signatory, Shareholder, Possesses, Manages)
  if (
    norm.includes("OWN") ||
    norm.includes("CONTROL") ||
    norm.includes("SIGNATOR") ||
    norm.includes("SHAREHOLD") ||
    norm.includes("POSSESS") ||
    norm.includes("HELD") ||
    norm.includes("HOLD")
  ) {
    return {
      line: isLight ? "#DB2777" : "#F472B6",
      labelColor: isLight ? "#BE185D" : "#FBCFE8",
      category: "OWNERSHIP",
      categoryLabel: "Ownership",
      style: "dashed",
      isDirectional: true,
    };
  }

  // 8. ASSOCIATED_WITH / Default / All other relationships
  return {
    line: isLight ? "#2563EB" : "#60A5FA",
    labelColor: isLight ? "#1D4ED8" : "#93C5FD",
    category: "ASSOCIATION",
    categoryLabel: "Association",
    style: "dashed",
    isDirectional: false,
  };
}

export const RELATIONSHIP_CATEGORIES = [
  { id: "ALL", label: "ALL", color: "#94A3B8" },
  { id: "COMMUNICATION", label: "COMMUNICATION", color: "#22D3EE" },
  { id: "EMPLOYMENT", label: "EMPLOYMENT", color: "#A78BFA" },
  { id: "VEHICLE", label: "VEHICLE", color: "#FBBF24" },
  { id: "LOCATION", label: "LOCATION", color: "#34D399" },
  { id: "ASSOCIATION", label: "ASSOCIATION", color: "#60A5FA" },
  { id: "FINANCIAL", label: "FINANCIAL", color: "#FB923C" },
  { id: "OWNERSHIP", label: "OWNERSHIP", color: "#F472B6" },
  { id: "MOVEMENT", label: "MOVEMENT", color: "#2DD4BF" },
] as const;
