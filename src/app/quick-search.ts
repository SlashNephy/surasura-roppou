import { createEgovLawRepository } from "@/core/egov";
import { createQuickSearch } from "@/core/jump";
import type { QuickSearch } from "@/core/jump";
import { createCatalogSearchService, createSearchIndexRepository } from "@/core/search";

// app 既定の QuickSearch。カタログはオンライン優先で e-Gov に委譲し、結果を索引へキャッシュする。
export const defaultQuickSearch: QuickSearch = createQuickSearch({
  catalog: createCatalogSearchService({
    lawRepository: createEgovLawRepository(),
    indexRepository: createSearchIndexRepository(),
  }),
});
