export { normalizeForSearch } from "./normalize";
export type { NormalizedText } from "./normalize";
export { toBigrams } from "./bigram";
export { buildSnippet } from "./snippet";
export type { SearchSnippet } from "./snippet";
export { buildSearchableText, isSearchableNode } from "./searchable-node";
export { createSearchIndexRepository } from "./index-repository";
export type {
  SearchIndexRepository,
  SearchIndexRepositoryOptions,
  StoredPostings,
} from "./index-repository";
export { createSearchIndexer } from "./indexer";
export type { SearchIndexer, SearchIndexerOptions } from "./indexer";
export { createFullTextSearchService } from "./full-text";
export type { FullTextSearchService, SavedTextHit } from "./full-text";
export { createCatalogSearchService } from "./catalog";
export type {
  CatalogSearchDependencies,
  CatalogSearchResult,
  CatalogSearchService,
  LawCatalogHit,
  MatchedField,
} from "./catalog";
