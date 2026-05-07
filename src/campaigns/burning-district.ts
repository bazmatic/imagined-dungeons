import type { Campaign } from '@core/domain/campaign';
import { asAgentId, asWorldId } from '@core/domain/ids';
import { BURNING_DISTRICT } from '@infra/seed/burning-district';

/**
 * The Burning District campaign — the project's first playable world.
 * Adding a second campaign is a sibling file in this directory plus a
 * one-line change in `app/server/world.ts`.
 */
export const BURNING_DISTRICT_CAMPAIGN: Campaign = {
  worldId: asWorldId('w_burning_district'),
  worldLabel: 'The Burning District',
  displayName: 'Imagined Dungeons — The Burning District',
  playerId: asAgentId('char_39322'), // Paff Pinkerton
  seed: BURNING_DISTRICT,
};
