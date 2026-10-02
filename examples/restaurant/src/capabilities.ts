import type { CapabilityContract } from "@brivya/core";

const moneySchema = {
  type: "object",
  additionalProperties: false,
  required: ["amount", "currency"],
  properties: {
    amount: { type: "string", pattern: "^(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$" },
    currency: { type: "string", pattern: "^[A-Z]{3}$" },
  },
} as const;

const zonedTimeSchema = {
  type: "object",
  additionalProperties: false,
  required: ["dateTime", "timeZone"],
  properties: {
    dateTime: {
      type: "string",
      pattern:
        "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:\\d{2})$",
    },
    timeZone: { type: "string", minLength: 1 },
  },
} as const;

export const restaurantCapabilities: readonly CapabilityContract[] = [
  {
    id: "menu.search",
    version: "0.1.0",
    description: "Search the typed restaurant menu.",
    resource: "menu-item",
    mode: "query",
    execution: "sync",
    risk: "low",
    approval: "none",
    permissions: [],
    idempotency: { required: false },
    timeoutMs: 5_000,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        available_only: { type: "boolean" },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "name", "vegetarian", "available", "price", "version"],
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              vegetarian: { type: "boolean" },
              available: { type: "boolean" },
              price: moneySchema,
              version: { type: "string" },
            },
          },
        },
      },
    },
  },
  {
    id: "availability.check",
    version: "0.1.0",
    description: "Check typed reservation availability.",
    resource: "reservation-slot",
    mode: "query",
    execution: "sync",
    risk: "low",
    approval: "none",
    permissions: [],
    idempotency: { required: false },
    timeoutMs: 5_000,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["date", "guests"],
      properties: {
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        guests: { type: "integer", minimum: 1, maximum: 20 },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["date", "guests", "slots"],
      properties: {
        date: { type: "string" },
        guests: { type: "integer" },
        slots: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["dateTime", "timeZone", "available"],
            properties: {
              dateTime: { type: "string" },
              timeZone: { type: "string" },
              available: { type: "boolean" },
            },
          },
        },
      },
    },
  },
  {
    id: "reservation.create",
    version: "0.1.0",
    description: "Create a restaurant reservation.",
    resource: "reservation",
    mode: "mutation",
    execution: "sync",
    risk: "medium",
    approval: "none",
    permissions: ["reservation:create"],
    idempotency: { required: true },
    timeoutMs: 5_000,
    events: ["reservation.created"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["guests", "scheduledTime"],
      properties: {
        guests: { type: "integer", minimum: 1, maximum: 20 },
        scheduledTime: zonedTimeSchema,
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["reservationId", "guests", "scheduledTime", "status"],
      properties: {
        reservationId: { type: "string" },
        guests: { type: "integer" },
        scheduledTime: zonedTimeSchema,
        status: { const: "confirmed" },
      },
    },
  },
  {
    id: "order.create",
    version: "0.1.0",
    description: "Create an order from versioned menu snapshots.",
    resource: "order",
    mode: "mutation",
    execution: "sync",
    risk: "medium",
    approval: "conditional",
    permissions: ["order:create"],
    idempotency: { required: true },
    timeoutMs: 5_000,
    events: ["order.created"],
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["itemId", "quantity", "unitPrice", "version"],
            properties: {
              itemId: { type: "string" },
              quantity: { type: "integer", minimum: 1, maximum: 20 },
              unitPrice: moneySchema,
              version: { type: "string" },
            },
          },
        },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["orderId", "status", "total"],
      properties: {
        orderId: { type: "string" },
        status: { const: "created" },
        total: moneySchema,
      },
    },
  },
  {
    id: "payment.request",
    version: "0.1.0",
    description: "Request provider-neutral payment authorization.",
    resource: "payment",
    mode: "mutation",
    execution: "sync",
    risk: "high",
    approval: "required",
    permissions: ["payment:request"],
    idempotency: { required: true },
    timeoutMs: 5_000,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["orderId", "amount"],
      properties: {
        orderId: { type: "string" },
        amount: moneySchema,
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["paymentId", "status", "amount"],
      properties: {
        paymentId: { type: "string" },
        status: { const: "authorized" },
        amount: moneySchema,
      },
    },
  },
];

export function registerRestaurantCapabilities(registry: {
  register(capability: CapabilityContract): void;
}): void {
  for (const capability of restaurantCapabilities) {
    registry.register(capability);
  }
}
