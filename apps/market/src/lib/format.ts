export function formatPriceTier(tier: number): string {
  const clamp = Math.max(1, Math.min(4, Math.floor(tier)));
  return '$'.repeat(clamp);
}

export function formatCuisines(cuisines: string[]): string {
  if (!Array.isArray(cuisines) || cuisines.length === 0) {
    return 'Cuisine coming soon';
  }
  return cuisines.join(' | ');
}
