export function allOptionsSelected(options: string[], values: string[]): boolean {
  const available = options.filter((option) => option !== '__none__');
  return available.length > 0 && available.every((option) => values.includes(option));
}

export function toggleAllOptions(options: string[], values: string[]): string[] {
  return allOptionsSelected(options, values)
    ? []
    : options.filter((option) => option !== '__none__');
}
