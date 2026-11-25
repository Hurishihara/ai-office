// Lenient on purpose: anything but role=qa is writer, anything but freeOnly=false is freeOnly.
export function modelsQueryDto(query: { role?: unknown; freeOnly?: unknown }): { role: "writer" | "qa"; freeOnly: boolean } {
  return { role: query.role === "qa" ? "qa" : "writer", freeOnly: query.freeOnly !== "false" };
}
