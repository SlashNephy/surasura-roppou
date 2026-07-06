import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import type { Law, LawNode, LawRevision } from "@/core/domain";
import { createMemoryStorageRepository } from "@/test/fixtures/storage";

import { createStorageRepository, deleteSurasuraDatabase } from "./repository";
import { createSavedLawUseCase } from "./saved-law-use-case";

const openedDatabaseNames: string[] = [];

afterEach(async () => {
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

describe("createSavedLawUseCase", () => {
  it("saves, lists, loads, and removes offline law documents through the storage contract", async () => {
    const repository = createStorageRepository({
      databaseName: createDatabaseName(),
      now: () => new Date("2026-07-06T00:00:00.000Z"),
    });
    const useCase = createSavedLawUseCase(repository);

    await useCase.save({ law, revision, nodes: [articleNode] });

    await expect(useCase.list()).resolves.toEqual([
      {
        law,
        revision,
        nodeCount: 1,
        savedAt: "2026-07-06T00:00:00.000Z",
        updatedAt: "2026-07-06T00:00:00.000Z",
      },
    ]);
    await expect(useCase.get(law.lawId)).resolves.toEqual({
      law,
      revision,
      nodes: [articleNode],
      savedAt: "2026-07-06T00:00:00.000Z",
    });

    await useCase.remove(law.lawId);

    await expect(useCase.get(law.lawId)).resolves.toBeUndefined();
    await repository.close();
  });

  it("propagates storage failures to callers", async () => {
    const error = new Error("Storage failed");
    const repository = {
      ...createMemoryStorageRepository().repository,
      saveLawDocument: () => Promise.reject(error),
    };
    const useCase = createSavedLawUseCase(repository);

    await expect(useCase.save({ law, revision, nodes: [articleNode] })).rejects.toBe(error);
  });
});

const createDatabaseName = (): string => {
  const name = `surasura-roppou-use-case-${crypto.randomUUID()}`;
  openedDatabaseNames.push(name);
  return name;
};

const law = {
  lawId: "129AC0000000089",
  title: "民法",
  lawNumber: "明治二十九年法律第八十九号",
  lawType: "Act",
  aliases: ["民法"],
  source: "egov",
} satisfies Law;

const revision = {
  lawId: law.lawId,
  revisionId: "129AC0000000089_20260624_508AC0000000045",
  effectiveDate: "2026-06-24",
  fetchedAt: "2026-07-06T00:00:00.000Z",
} satisfies LawRevision;

const articleNode = {
  id: "129AC0000000089:129AC0000000089_20260624_508AC0000000045:article:1",
  lawId: law.lawId,
  revisionId: revision.revisionId,
  type: "Article",
  path: "article:1",
  number: "1",
  title: "第一条",
  rawText: "第一条　私権は、公共の福祉に適合しなければならない。",
  plainText: "第一条 私権は、公共の福祉に適合しなければならない。",
  children: [],
} satisfies LawNode;
