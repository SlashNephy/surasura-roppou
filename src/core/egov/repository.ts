import type { Law, LawNode, LawRevision } from "@/core/domain";

import { type EgovLawTextNode, normalizeEgovLawText } from "./lawText";

export const defaultEgovApiBaseUrl = "https://laws.e-gov.go.jp/api/2";

type Fetcher = typeof fetch;

type NowProvider = () => Date;

export interface EgovLawRepositoryOptions {
  baseUrl?: string;
  fetcher?: Fetcher;
  now?: NowProvider;
}

export interface LawListQuery {
  lawId?: string;
  lawNumber?: string;
  title?: string;
  lawTypes?: string[];
  asOf?: string;
  offset?: number;
  limit?: number;
}

export interface LawDataQuery {
  asOf?: string;
  article?: string;
}

export interface LawMetadataQuery {
  asOf?: string;
}

export interface LawSummary {
  law: Law;
  revision: LawRevision;
  currentRevision?: LawRevision;
}

export interface LawListResult {
  totalCount: number;
  count: number;
  nextOffset?: number;
  laws: LawSummary[];
}

export interface LawDocument {
  law: Law;
  revision: LawRevision;
  nodes: LawNode[];
  raw: unknown;
}

export interface LawMetadata {
  law: Law;
  revisions: LawRevision[];
}

export interface LawRepository {
  listLaws(query?: LawListQuery): Promise<LawListResult>;
  getLaw(lawIdOrNumOrRevisionId: string, query?: LawDataQuery): Promise<LawDocument>;
  getLawMetadata(lawIdOrNum: string, query?: LawMetadataQuery): Promise<LawMetadata>;
}

export class EgovApiError extends Error {
  public readonly url?: string;
  public readonly payload?: unknown;

  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    details: EgovApiErrorDetails = {},
  ) {
    super(message);
    this.name = "EgovApiError";

    if (details.url !== undefined) {
      this.url = details.url;
    }

    if (details.payload !== undefined) {
      this.payload = details.payload;
    }
  }
}

interface EgovApiErrorDetails {
  url?: string;
  payload?: unknown;
}

interface EgovLawInfo {
  lawId: string;
  lawNumber?: string;
  lawType?: string;
}

interface EgovRevisionInfo {
  revisionId: string;
  title: string;
  lawType?: string;
  aliases: string[];
  updatedAt?: string;
  effectiveDate?: string;
}

export const createEgovLawRepository = (options: EgovLawRepositoryOptions = {}): LawRepository => {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? defaultEgovApiBaseUrl);
  const fetcher = options.fetcher ?? ((...args) => globalThis.fetch(...args));
  const now = options.now ?? (() => new Date());

  const requestJson = async (path: string, query: Record<string, QueryValue>): Promise<unknown> => {
    const url = buildUrl(baseUrl, path, { ...query, response_format: "json" });
    const response = await fetcher(url, { headers: { accept: "application/json" } });
    const payload = await parseJsonResponse(response, url);

    if (!response.ok) {
      throw buildApiError(response.status, payload, url);
    }

    return payload;
  };

  return {
    async listLaws(query = {}) {
      const payload = await requestJson("/laws", {
        law_id: query.lawId,
        law_num: query.lawNumber,
        law_title: query.title,
        law_type: query.lawTypes,
        asof: query.asOf,
        offset: query.offset,
        limit: query.limit,
      });
      const response = parseLawsResponse(payload);

      return {
        totalCount: response.totalCount,
        count: response.count,
        ...(response.nextOffset === undefined ? {} : { nextOffset: response.nextOffset }),
        laws: response.laws.map((item) => {
          const law = toLaw(item.lawInfo, item.revisionInfo);

          return {
            law,
            revision: toRevision(item.lawInfo, item.revisionInfo, now, baseUrl),
            ...(item.currentRevisionInfo === undefined
              ? {}
              : {
                  currentRevision: toRevision(item.lawInfo, item.currentRevisionInfo, now, baseUrl),
                }),
          };
        }),
      };
    },

    async getLaw(lawIdOrNumOrRevisionId, query = {}) {
      const payload = await requestJson(`/law_data/${encodeURIComponent(lawIdOrNumOrRevisionId)}`, {
        law_full_text_format: "json",
        asof: query.asOf,
        elm: query.article === undefined ? undefined : `Article=${query.article}`,
      });
      const response = parseLawDataResponse(payload);
      const law = toLaw(response.lawInfo, response.revisionInfo);
      const revision = toRevision(response.lawInfo, response.revisionInfo, now, baseUrl);

      return {
        law,
        revision,
        nodes: normalizeEgovLawText(response.lawFullText, law.lawId, revision.revisionId),
        raw: payload,
      };
    },

    async getLawMetadata(lawIdOrNum, query = {}) {
      const payload = await requestJson(`/law_revisions/${encodeURIComponent(lawIdOrNum)}`, {
        asof: query.asOf,
      });
      const response = parseLawRevisionsResponse(payload);

      return {
        law: toLawFromRevisionHistory(response.lawInfo, response.revisions),
        revisions: response.revisions.map((revision) =>
          toRevision(response.lawInfo, revision, now, baseUrl, revision.revisionId),
        ),
      };
    },
  };
};

type QueryValue = string | number | boolean | readonly string[] | undefined;

const buildUrl = (baseUrl: string, path: string, query: Record<string, QueryValue>): string => {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }

    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  const serialized = params.toString();

  return serialized === "" ? `${baseUrl}${path}` : `${baseUrl}${path}?${serialized}`;
};

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const parseJsonResponse = async (response: Response, url: string): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    throw new EgovApiError(
      response.status,
      String(response.status),
      `e-Gov API returned invalid JSON from ${url}`,
      { url },
    );
  }
};

const buildApiError = (status: number, payload: unknown, url: string): EgovApiError => {
  const payloadRecord = isRecord(payload) ? payload : {};
  const errorInfo = getOptionalRecord(payloadRecord, "error_info") ?? payloadRecord;
  const code = getOptionalString(errorInfo, "code") ?? String(status);
  const message =
    getOptionalString(errorInfo, "message") ??
    `e-Gov API request failed with status ${String(status)}`;

  return new EgovApiError(status, code, message, { payload, url });
};

const toLaw = (lawInfo: EgovLawInfo, revisionInfo: EgovRevisionInfo): Law => ({
  lawId: lawInfo.lawId,
  title: revisionInfo.title,
  ...(lawInfo.lawNumber === undefined ? {} : { lawNumber: lawInfo.lawNumber }),
  ...((revisionInfo.lawType ?? lawInfo.lawType) === undefined
    ? {}
    : { lawType: revisionInfo.lawType ?? lawInfo.lawType }),
  aliases: revisionInfo.aliases,
  source: "egov",
  ...(revisionInfo.updatedAt === undefined ? {} : { updatedAt: revisionInfo.updatedAt }),
});

const toLawFromRevisionHistory = (lawInfo: EgovLawInfo, revisions: EgovRevisionInfo[]): Law => {
  const firstRevision = revisions.at(0);

  if (firstRevision === undefined) {
    throw new Error(`No law revisions returned for ${lawInfo.lawId}`);
  }

  const revisionWithAliases = revisions.find((revision) => revision.aliases.length > 0);

  return {
    ...toLaw(lawInfo, firstRevision),
    aliases: revisionWithAliases?.aliases ?? [],
  };
};

const toRevision = (
  lawInfo: EgovLawInfo,
  revisionInfo: EgovRevisionInfo,
  now: NowProvider,
  baseUrl: string,
  sourceId = lawInfo.lawId,
): LawRevision => ({
  lawId: lawInfo.lawId,
  revisionId: revisionInfo.revisionId,
  ...(revisionInfo.effectiveDate === undefined
    ? {}
    : { effectiveDate: revisionInfo.effectiveDate }),
  fetchedAt: now().toISOString(),
  sourceUrl: `${baseUrl}/law_data/${encodeURIComponent(sourceId)}`,
});

const parseLawsResponse = (payload: unknown) => {
  const record = expectRecord(payload, "laws response");
  const rawLaws = expectArray(record, "laws");

  return {
    totalCount: expectNumber(record, "total_count"),
    count: expectNumber(record, "count"),
    nextOffset: getOptionalNumber(record, "next_offset"),
    laws: rawLaws.map((item) => {
      const itemRecord = expectRecord(item, "laws item");

      return {
        lawInfo: parseLawInfo(expectRecordProperty(itemRecord, "law_info")),
        revisionInfo: parseRevisionInfo(expectRecordProperty(itemRecord, "revision_info")),
        currentRevisionInfo:
          getOptionalRecord(itemRecord, "current_revision_info") === undefined
            ? undefined
            : parseRevisionInfo(expectRecordProperty(itemRecord, "current_revision_info")),
      };
    }),
  };
};

const parseLawDataResponse = (payload: unknown) => {
  const record = expectRecord(payload, "law data response");

  return {
    lawInfo: parseLawInfo(expectRecordProperty(record, "law_info")),
    revisionInfo: parseRevisionInfo(expectRecordProperty(record, "revision_info")),
    lawFullText: parseLawTextNode(expectRecordProperty(record, "law_full_text")),
  };
};

const parseLawRevisionsResponse = (payload: unknown) => {
  const record = expectRecord(payload, "law revisions response");

  return {
    lawInfo: parseLawInfo(expectRecordProperty(record, "law_info")),
    revisions: expectArray(record, "revisions").map((revision) =>
      parseRevisionInfo(expectRecord(revision, "revision item")),
    ),
  };
};

const parseLawInfo = (record: Record<string, unknown>): EgovLawInfo => ({
  lawId: expectString(record, "law_id"),
  lawNumber: getOptionalString(record, "law_num"),
  lawType: getOptionalString(record, "law_type"),
});

const parseRevisionInfo = (record: Record<string, unknown>): EgovRevisionInfo => ({
  revisionId: expectString(record, "law_revision_id"),
  title: expectString(record, "law_title"),
  lawType: getOptionalString(record, "law_type"),
  aliases: splitAliases(getOptionalString(record, "abbrev")),
  updatedAt: getOptionalString(record, "updated"),
  effectiveDate: getOptionalString(record, "amendment_enforcement_date"),
});

const parseLawTextNode = (record: Record<string, unknown>): EgovLawTextNode => {
  const rawChildren = expectArray(record, "children");

  return {
    tag: expectString(record, "tag"),
    attr: parseAttributes(getOptionalRecord(record, "attr")),
    children: rawChildren.map((child) =>
      typeof child === "string" ? child : parseLawTextNode(expectRecord(child, "law text child")),
    ),
  };
};

const parseAttributes = (record: Record<string, unknown> | undefined): Record<string, string> => {
  if (record === undefined) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => {
      const attributeValue = stringifyAttributeValue(value);

      return attributeValue === undefined ? [] : [[key, attributeValue] as const];
    }),
  );
};

const stringifyAttributeValue = (value: unknown): string | undefined => {
  switch (typeof value) {
    case "boolean":
    case "number":
    case "string":
      return String(value);
    default:
      return undefined;
  }
};

const splitAliases = (value: string | undefined): string[] => {
  if (value === undefined || value.trim() === "") {
    return [];
  }

  return value
    .split(",")
    .map((alias) => alias.trim())
    .filter((alias) => alias !== "");
};

const expectRecordProperty = (
  record: Record<string, unknown>,
  key: string,
): Record<string, unknown> => expectRecord(record[key], key);

const expectRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} to be an object`);
  }

  return value;
};

const getOptionalRecord = (record: unknown, key: string): Record<string, unknown> | undefined => {
  if (!isRecord(record)) {
    return undefined;
  }

  const value = record[key];

  return isRecord(value) ? value : undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const expectArray = (record: Record<string, unknown>, key: string): unknown[] => {
  const value = record[key];

  if (!Array.isArray(value)) {
    throw new Error(`Expected ${key} to be an array`);
  }

  return value;
};

const expectString = (record: Record<string, unknown>, key: string): string => {
  const value = record[key];

  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be a string`);
  }

  return value;
};

const getOptionalString = (record: Record<string, unknown>, key: string): string | undefined => {
  const value = record[key];

  return typeof value === "string" ? value : undefined;
};

const expectNumber = (record: Record<string, unknown>, key: string): number => {
  const value = record[key];

  if (typeof value !== "number") {
    throw new Error(`Expected ${key} to be a number`);
  }

  return value;
};

const getOptionalNumber = (record: Record<string, unknown>, key: string): number | undefined => {
  const value = record[key];

  return typeof value === "number" ? value : undefined;
};
