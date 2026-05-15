export const SegmentKind = {
  LocationName:        'location-name',
  LocationDescription: 'location-description',
  ItemList:            'item-list',
  CharacterList:       'character-list',
  ExitList:            'exit-list',
  NoExits:             'no-exits',
  Feedback:            'feedback',
  Narration:           'narration',
  Error:               'error',
  Inventory:           'inventory',
  Hit:                 'hit',
  Miss:                'miss',
  Damage:              'damage',
  Death:               'death',
} as const;
export type SegmentKind = (typeof SegmentKind)[keyof typeof SegmentKind];

export interface Segment {
  readonly kind: SegmentKind;
  readonly text: string;
}
