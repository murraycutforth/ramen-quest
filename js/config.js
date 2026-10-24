// Defaults for the app. Repo owner/name can be overridden per device in Settings.

export const DEFAULT_REPO = {
  owner: 'murraycutforth',
  repo: 'ramen-quest',
  branch: 'main',
};

export const PEOPLE = [
  { id: 'murray', name: 'Murray', initial: 'M' },
  { id: 'liat', name: 'Liat', initial: 'L' },
];

export const SUB_SCORES = [
  { id: 'broth', label: 'Broth' },
  { id: 'noodles', label: 'Noodles' },
  { id: 'toppings', label: 'Toppings' },
  { id: 'vibe', label: 'Vibe' },
  { id: 'value', label: 'Value' },
];

export const DATA_FILES = {
  restaurants: 'data/restaurants.json',
  visits: 'data/visits.json',
};

export const OXFORD_CENTRE = [51.752, -1.2577];

export const personName = (id) => PEOPLE.find((p) => p.id === id)?.name ?? id;
export const otherPerson = (id) => PEOPLE.find((p) => p.id !== id)?.id;
