import { createEgovLawRepository } from "@/core/egov";
import { createLawNumberResolver } from "@/core/jump";
import type { LawNumberResolver } from "@/core/jump";
import { createSearchIndexRepository } from "@/core/search";

// app 既定の法令番号解決器。解決結果は検索と同じ lawCatalog ストアへキャッシュする。
export const defaultLawNumberResolver: LawNumberResolver = createLawNumberResolver({
  lawRepository: createEgovLawRepository(),
  indexRepository: createSearchIndexRepository(),
});
