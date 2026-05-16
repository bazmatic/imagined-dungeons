import type { AgentId } from '@core/domain/ids';
import { OwnerKind } from '@core/domain/kinds';
import { perceive } from '@core/engine/perception';
import type { Repository } from '@core/engine/repository';

export interface ForSaleItem {
  readonly id: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly priceTag: number;
}

export interface SurroundingsItem {
  readonly id: string;
  readonly label: string;
}

export interface SurroundingsExit {
  readonly id: string;
  readonly direction: string;
  readonly label: string | null;
  readonly locked: boolean;
}

export interface SurroundingsCharacter {
  readonly id: string;
  readonly label: string;
  readonly shortDescription: string;
  readonly mood: string | null;
  readonly hp: number;
  readonly wares: readonly ForSaleItem[];
}

export interface SurroundingsView {
  readonly items: readonly SurroundingsItem[];
  readonly exits: readonly SurroundingsExit[];
  readonly characters: readonly SurroundingsCharacter[];
}

export async function buildSurroundings(
  playerId: AgentId,
  repo: Repository,
): Promise<SurroundingsView> {
  const view = await perceive(playerId, repo);
  const characters = await Promise.all(
    view.agents.map(async (a) => {
      const owned = await repo.itemsOwnedBy({ kind: OwnerKind.Agent, id: a.id });
      const wares: ForSaleItem[] = owned
        .filter((i) => i.priceTag != null && i.priceTag > 0)
        .map((i) => ({
          id: i.id as string,
          label: i.label,
          shortDescription: i.shortDescription,
          priceTag: i.priceTag as number,
        }));
      return {
        id: a.id as string,
        label: a.label,
        shortDescription: a.shortDescription,
        mood: a.mood,
        hp: a.hp,
        wares,
      };
    }),
  );
  return {
    items: view.items.map((i) => ({ id: i.id as string, label: i.label })),
    exits: view.exits.map((e) => ({
      id: e.id as string,
      direction: e.direction,
      label: e.label && e.label !== e.direction ? e.label : null,
      locked: e.locked,
    })),
    characters,
  };
}
