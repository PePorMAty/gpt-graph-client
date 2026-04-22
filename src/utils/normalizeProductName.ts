// src/utils/normalizeProductName.ts

export function normalizeProductName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е");
}

/**
 * Find an existing product node whose label fuzzy-matches `productName`.
 * Returns the node id or null.
 */
export function findExistingProductNode(
  productName: string,
  nodes: ReadonlyArray<{
    id: string;
    type?: string;
    data: { label: string };
  }>,
): string | null {
  const normalized = normalizeProductName(productName);
  for (const node of nodes) {
    if (node.type !== "product") continue;
    if (normalizeProductName(node.data.label) === normalized) {
      return node.id;
    }
  }
  return null;
}
