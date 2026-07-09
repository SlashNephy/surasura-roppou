import "fake-indexeddb/auto";

import { afterEach, describe, expect, it } from "vitest";

import { deleteSurasuraDatabase, openSurasuraDatabase } from "./repository";
import { surasuraDatabaseVersion } from "./schema";

const openedDatabaseNames: string[] = [];

const createDatabaseName = (): string => {
  const name = `surasura-search-${String(openedDatabaseNames.length)}-${String(surasuraDatabaseVersion)}`;
  openedDatabaseNames.push(name);
  return name;
};

afterEach(async () => {
  await Promise.all(openedDatabaseNames.splice(0).map((name) => deleteSurasuraDatabase(name)));
});

describe("search stores (version 2)", () => {
  it("version 2 で lawCatalog と searchPostings を作る", async () => {
    const database = await openSurasuraDatabase(createDatabaseName());

    expect(database.version).toBe(2);
    expect([...database.objectStoreNames]).toEqual(
      expect.arrayContaining(["lawCatalog", "searchPostings"]),
    );

    database.close();
  });

  it("searchPostings は [lawId, bigram] 複合キーと by-bigram / by-law-id インデックスを持つ", async () => {
    const database = await openSurasuraDatabase(createDatabaseName());

    await database.put("searchPostings", { lawId: "L1", bigram: "秘密", nodeIds: ["n1"] });
    await database.put("searchPostings", { lawId: "L2", bigram: "秘密", nodeIds: ["n2"] });

    await expect(
      database.getAllFromIndex("searchPostings", "by-bigram", "秘密"),
    ).resolves.toHaveLength(2);
    await expect(
      database.getAllFromIndex("searchPostings", "by-law-id", "L1"),
    ).resolves.toHaveLength(1);

    database.close();
  });
});
