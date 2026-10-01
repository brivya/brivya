import * as Ajv2020Module from "ajv/dist/2020.js";

import type { JsonSchema } from "@brivya/core";

export interface SchemaValidationIssue {
  path: string;
  message: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  issues: SchemaValidationIssue[];
}

export interface SchemaValidator {
  validate(schema: JsonSchema, value: unknown): SchemaValidationResult;
}

interface AjvErrorLike {
  instancePath: string;
  message?: string;
}

interface ValidateFunctionLike {
  (input: unknown): boolean;
  errors?: AjvErrorLike[] | null;
}

interface AjvLike {
  compile(schema: unknown): ValidateFunctionLike;
}

type AjvConstructor = new (options?: Record<string, unknown>) => AjvLike;

const Ajv2020 = (
  ("default" in Ajv2020Module ? Ajv2020Module.default : Ajv2020Module) as unknown
) as AjvConstructor;

export class AjvSchemaValidator implements SchemaValidator {
  readonly #ajv = new Ajv2020({
    allErrors: true,
    strict: false,
  });
  readonly #cache = new WeakMap<object, ValidateFunctionLike>();

  validate(schema: JsonSchema, value: unknown): SchemaValidationResult {
    let validate = this.#cache.get(schema);
    if (!validate) {
      validate = this.#ajv.compile(schema);
      this.#cache.set(schema, validate);
    }

    const valid = validate(value);
    return {
      valid,
      issues: valid
        ? []
        : (validate.errors ?? []).map((error) => ({
            path: error.instancePath || "$",
            message: error.message ?? "Schema validation failed.",
          })),
    };
  }
}
