/**
 * The minimal subset of JSON Schema we use for structured outputs.
 * Hand-written; matches what OpenAI's strict mode accepts.
 */
export type JsonSchema = {
  readonly type?: string | readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: boolean;
  readonly enum?: readonly (string | null)[];
  readonly const?: string | number | boolean | null;
  readonly oneOf?: readonly JsonSchema[];
  readonly items?: JsonSchema;
  readonly maxItems?: number;
  readonly minimum?: number;
  readonly maximum?: number;
};

export interface LanguageModelRequest {
  readonly system: string;
  readonly user: string;
  readonly schema: JsonSchema;
  readonly schemaName: string;
}

export interface LanguageModelResponse {
  readonly raw: string;
  readonly parsed: unknown;
}

export interface LanguageModelTextRequest {
  readonly system: string;
  readonly user: string;
}

export interface LanguageModel {
  complete(req: LanguageModelRequest): Promise<LanguageModelResponse>;
  completeText(req: LanguageModelTextRequest): Promise<string>;
}
