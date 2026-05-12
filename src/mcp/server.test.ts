import { MemoryBuilderRepository } from '@infra/builder-memory-repository';
import { describe, expect, it } from 'vitest';
import { TOOL_BY_NAME } from './tools';

describe('MCP tool surface', () => {
  it('list_worlds returns []', async () => {
    const repo = new MemoryBuilderRepository();
    const tool = TOOL_BY_NAME.list_worlds;
    if (!tool) throw new Error('tool missing');
    const r = await tool.run(repo, {});
    expect(r).toEqual([]);
  });

  it('create_draft + get_world round-trips through tools', async () => {
    const repo = new MemoryBuilderRepository();
    const create = TOOL_BY_NAME.create_draft;
    const get = TOOL_BY_NAME.get_world;
    if (!create || !get) throw new Error('tool missing');
    const created = (await create.run(repo, {
      displayName: 'X',
      label: 'L',
    })) as { ok: boolean; value?: string };
    expect(created.ok).toBe(true);
    const got = await get.run(repo, { id: created.value });
    expect((got as { ok: boolean }).ok).toBe(true);
  });

  it('every TOOL_BY_NAME entry has a description and a runnable handler', () => {
    for (const t of Object.values(TOOL_BY_NAME)) {
      expect(t.description.length).toBeGreaterThan(0);
      expect(typeof t.run).toBe('function');
    }
  });

  it('does not expose reset_live_to_draft', () => {
    expect(TOOL_BY_NAME.reset_live_to_draft).toBeUndefined();
  });

  it('exposes lore tools (get/update world lore + tag lore CRUD)', () => {
    const names = Object.keys(TOOL_BY_NAME);
    expect(names).toEqual(
      expect.arrayContaining([
        'get_world_lore',
        'update_world_lore',
        'list_tag_lore',
        'upsert_tag_lore',
        'delete_tag_lore',
      ]),
    );
  });

  it('round-trips world lore and tag lore through MCP tools', async () => {
    const repo = new MemoryBuilderRepository();
    const createDraftTool = TOOL_BY_NAME.create_draft;
    const updateLoreTool = TOOL_BY_NAME.update_world_lore;
    const getLoreTool = TOOL_BY_NAME.get_world_lore;
    const upsertTagTool = TOOL_BY_NAME.upsert_tag_lore;
    const listTagTool = TOOL_BY_NAME.list_tag_lore;
    const deleteTagTool = TOOL_BY_NAME.delete_tag_lore;
    if (
      !createDraftTool ||
      !updateLoreTool ||
      !getLoreTool ||
      !upsertTagTool ||
      !listTagTool ||
      !deleteTagTool
    ) {
      throw new Error('tool missing');
    }

    const created = (await createDraftTool.run(repo, {
      displayName: 'Lore World',
      label: 'lore',
    })) as { ok: boolean; value?: string };
    expect(created.ok).toBe(true);
    const worldId = created.value as string;

    const upd = (await updateLoreTool.run(repo, {
      id: worldId,
      worldOverview: 'Overview text',
      storySoFar: 'Story text',
    })) as { ok: boolean };
    expect(upd.ok).toBe(true);

    const got = (await getLoreTool.run(repo, { id: worldId })) as {
      ok: boolean;
      value?: { worldOverview: string; storySoFar: string };
    };
    expect(got.ok).toBe(true);
    expect(got.value).toEqual(
      expect.objectContaining({ worldOverview: 'Overview text', storySoFar: 'Story text' }),
    );

    const upserted = (await upsertTagTool.run(repo, {
      worldId,
      payload: {
        id: 'tl_1',
        tag: 'city:varos',
        title: 'Varos',
        description: 'A coastal city.',
      },
    })) as { ok: boolean };
    expect(upserted.ok).toBe(true);

    const list = (await listTagTool.run(repo, { worldId })) as Array<{ id: string; tag: string }>;
    expect(list).toContainEqual(expect.objectContaining({ id: 'tl_1', tag: 'city:varos' }));

    const del = (await deleteTagTool.run(repo, { worldId, id: 'tl_1' })) as { ok: boolean };
    expect(del.ok).toBe(true);
    const list2 = (await listTagTool.run(repo, { worldId })) as Array<{ id: string }>;
    expect(list2.find((r) => r.id === 'tl_1')).toBeUndefined();
  });

  it('template and trigger tools work end-to-end', async () => {
    const repo = new MemoryBuilderRepository();
    const createDraftTool = TOOL_BY_NAME.create_draft;
    const upsertLocationTool = TOOL_BY_NAME.upsert_location;
    const upsertTemplateTool = TOOL_BY_NAME.upsert_monster_template;
    const upsertTriggerTool = TOOL_BY_NAME.upsert_location_spawn_trigger;
    const listTemplatesTool = TOOL_BY_NAME.list_monster_templates;

    if (
      !createDraftTool ||
      !upsertLocationTool ||
      !upsertTemplateTool ||
      !upsertTriggerTool ||
      !listTemplatesTool
    ) {
      throw new Error('tool missing');
    }

    // Create a draft
    const created = (await createDraftTool.run(repo, {
      displayName: 'Test World',
      label: 'test',
    })) as { ok: boolean; value?: string };
    expect(created.ok).toBe(true);
    const worldId = created.value;

    // Create a location for the trigger
    const locResult = (await upsertLocationTool.run(repo, {
      worldId,
      id: 'loc_1',
      label: 'Test Location',
      shortDescription: 'A test location',
      longDescription: 'A longer description',
    })) as { ok: boolean };
    expect(locResult.ok).toBe(true);

    // Upsert a template
    const templateResult = (await upsertTemplateTool.run(repo, {
      worldId,
      id: 'tpl_goblin',
      templateKey: 'goblin',
      label: 'Goblin',
      shortDescription: 'A small green creature',
      longDescription: 'A goblin warrior',
      hp: 10,
      mood: null,
      startingItems: [],
    })) as { ok: boolean };
    expect(templateResult.ok).toBe(true);

    // Upsert a trigger
    const triggerResult = (await upsertTriggerTool.run(repo, {
      worldId,
      id: 'trg_1',
      locationId: 'loc_1',
      templateId: 'tpl_goblin',
      params: { kind: 'clock', interval: 5000 },
      count: 2,
      oneShot: false,
      fireOnInitialPublish: true,
    })) as { ok: boolean };
    expect(triggerResult.ok).toBe(true);

    // List templates and verify the template is there
    const templates = (await listTemplatesTool.run(repo, { worldId })) as Array<{
      id: string;
      label: string;
    }>;
    expect(templates).toContainEqual(
      expect.objectContaining({ id: 'tpl_goblin', label: 'Goblin' }),
    );
  });

  it('upsert tools persist tags on location/item/agent/monster_template', async () => {
    const repo = new MemoryBuilderRepository();
    const createDraftTool = TOOL_BY_NAME.create_draft;
    const upsertLocationTool = TOOL_BY_NAME.upsert_location;
    const upsertItemTool = TOOL_BY_NAME.upsert_item;
    const upsertAgentTool = TOOL_BY_NAME.upsert_agent;
    const upsertTemplateTool = TOOL_BY_NAME.upsert_monster_template;
    const getWorldTool = TOOL_BY_NAME.get_world;
    const listTemplatesTool = TOOL_BY_NAME.list_monster_templates;
    if (
      !createDraftTool ||
      !upsertLocationTool ||
      !upsertItemTool ||
      !upsertAgentTool ||
      !upsertTemplateTool ||
      !getWorldTool ||
      !listTemplatesTool
    ) {
      throw new Error('tool missing');
    }

    const created = (await createDraftTool.run(repo, {
      displayName: 'Tags World',
      label: 'tags',
    })) as { ok: boolean; value?: string };
    expect(created.ok).toBe(true);
    const worldId = created.value as string;

    await upsertLocationTool.run(repo, {
      worldId,
      id: 'loc_1',
      label: 'Spot',
      shortDescription: 's',
      longDescription: 'l',
      tags: ['sewer', 'cult'],
    });
    await upsertItemTool.run(repo, {
      worldId,
      id: 'itm_1',
      label: 'Locket',
      shortDescription: 's',
      longDescription: 'l',
      ownerKind: 'location',
      ownerId: 'loc_1',
      weight: 0,
      hidden: false,
      tags: ['heirloom'],
    });
    await upsertAgentTool.run(repo, {
      worldId,
      id: 'agt_1',
      label: 'Rat',
      shortDescription: 's',
      longDescription: 'l',
      locationId: 'loc_1',
      hp: 1,
      damage: 1,
      defense: 0,
      capacity: 0,
      autonomous: false,
      tags: ['vermin'],
    });
    await upsertTemplateTool.run(repo, {
      worldId,
      id: 'tpl_goblin',
      templateKey: 'goblin',
      label: 'Goblin',
      shortDescription: 's',
      longDescription: 'l',
      hp: 5,
      mood: null,
      startingItems: [],
      tags: ['humanoid'],
    });

    const tree = (await getWorldTool.run(repo, { id: worldId })) as {
      ok: boolean;
      value?: {
        locations: ReadonlyArray<{ id: string; tags: readonly string[] }>;
        items: ReadonlyArray<{ id: string; tags: readonly string[] }>;
        agents: ReadonlyArray<{ id: string; tags: readonly string[] }>;
      };
    };
    expect(tree.ok).toBe(true);
    const v = tree.value;
    if (!v) throw new Error('tree.value missing');
    expect(v.locations.find((l) => l.id === 'loc_1')?.tags).toEqual(['sewer', 'cult']);
    expect(v.items.find((i) => i.id === 'itm_1')?.tags).toEqual(['heirloom']);
    expect(v.agents.find((a) => a.id === 'agt_1')?.tags).toEqual(['vermin']);

    const templates = (await listTemplatesTool.run(repo, { worldId })) as ReadonlyArray<{
      id: string;
      tags: readonly string[];
    }>;
    expect(templates.find((t) => t.id === 'tpl_goblin')?.tags).toEqual(['humanoid']);
  });
});
