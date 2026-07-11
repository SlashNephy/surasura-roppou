export type { AliasDictionaryEntry } from "./alias-dictionary";
export { initialAliasDictionary } from "./alias-dictionary";
export { createAliasResolver } from "./alias-resolver";
export type {
  AliasCandidate,
  AliasMatchKind,
  AliasResolver,
  AliasResolverOptions,
} from "./alias-resolver";
export { parseReference } from "./reference-parser";
export type {
  ParsedReference,
  ParseReferenceOptions,
  ReferenceKind,
  ReferenceSentence,
} from "./reference-parser";
export { resolveReferenceCandidates, resolveReferenceInput } from "./candidate-resolver";
export type {
  ReferenceResolution,
  ResolveReferenceOptions,
  UnresolvedReason,
} from "./candidate-resolver";
export { createQuickSearch } from "./quick-search";
export type {
  QuickSearch,
  QuickSearchCandidate,
  QuickSearchCandidateKind,
  QuickSearchDependencies,
  QuickSearchOptions,
  QuickSearchOutcome,
} from "./quick-search";
