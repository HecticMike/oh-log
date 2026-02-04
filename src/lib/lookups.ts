export const OTHER_KEY = 'other';

export type Option = {
  key: string;
  label: string;
};

export type TimeframeKey = 'all' | 'year' | 'm6' | 'month' | 'week';

export const TIMEFRAME_OPTIONS: Option[] = [
  { key: 'all', label: 'All time' },
  { key: 'year', label: 'Last year' },
  { key: 'm6', label: 'Last 6 months' },
  { key: 'month', label: 'Last month' },
  { key: 'week', label: 'Last week' }
];

export const REGION_OPTIONS: Option[] = [
  { key: 'hands', label: 'Hands' },
  { key: 'knees', label: 'Knees' },
  { key: 'spine', label: 'Spine' },
  { key: 'feet', label: 'Feet' },
  { key: 'neck', label: 'Neck' },
  { key: 'hips', label: 'Hips' }
];

export const JOINT_OPTIONS_BY_REGION: Record<string, Option[]> = {
  hands: [
    { key: 'fingers', label: 'Fingers' },
    { key: 'wrists', label: 'Wrists' },
    { key: OTHER_KEY, label: 'Other (hands)' }
  ],
  knees: [
    { key: 'left-knee', label: 'Left knee' },
    { key: 'right-knee', label: 'Right knee' },
    { key: OTHER_KEY, label: 'Other (knee)' }
  ],
  spine: [
    { key: 'lumbar', label: 'Lower back (lumbar)' },
    { key: 'thoracic', label: 'Mid-back (thoracic)' },
    { key: OTHER_KEY, label: 'Other (spine)' }
  ],
  feet: [
    { key: 'ankles', label: 'Ankles' },
    { key: 'toes', label: 'Toes' },
    { key: OTHER_KEY, label: 'Other (feet)' }
  ],
  neck: [
    { key: 'cervical', label: 'Cervical region' },
    { key: OTHER_KEY, label: 'Other (neck)' }
  ],
  hips: [{ key: 'hips', label: 'Hips' }]
};

export const SYMPTOM_OPTIONS: Option[] = [
  { key: 'pain', label: 'Pain' },
  { key: 'stiffness', label: 'Stiffness' },
  { key: 'swelling', label: 'Swelling' },
  { key: OTHER_KEY, label: 'Other symptom' }
];

export const TRIGGER_OPTIONS: Option[] = [
  { key: 'stress', label: 'Stress' },
  { key: 'activity', label: 'Activity' },
  { key: 'weather', label: 'Weather' },
  { key: OTHER_KEY, label: 'Other trigger' }
];

export const ACTION_OPTIONS: Option[] = [
  { key: 'medication', label: 'Medication' },
  { key: 'rest', label: 'Rest' },
  { key: 'exercise', label: 'Exercise/stretch' },
  { key: OTHER_KEY, label: 'Other action' }
];

export function labelForKey(list: Option[], key?: string): string {
  if (!key) return 'Unspecified';
  const match = list.find((item) => item.key === key);
  return match ? match.label : key;
}

export function jointsForRegion(regionKey?: string): Option[] | undefined {
  if (!regionKey) return undefined;
  return JOINT_OPTIONS_BY_REGION[regionKey];
}

export function hasOtherSelected(key?: string): boolean {
  return key === OTHER_KEY;
}

// Add more entries above and restart Vite; the selectors and exports will
// automatically pick up any new Option items. Keep keys stable to preserve
// previously saved records.
