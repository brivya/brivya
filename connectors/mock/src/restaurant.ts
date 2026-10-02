import { BrivyaError } from "@brivya/core";
import type {
  ConnectorExecutionContext,
  ConnectorExecutor,
} from "@brivya/runtime";

export interface RestaurantMenuItem {
  id: string;
  name: string;
  vegetarian: boolean;
  available: boolean;
  price: { amount: string; currency: string };
  version: string;
}

export interface RestaurantMockState {
  menu: RestaurantMenuItem[];
  reservations: Map<string, unknown>;
  orders: Map<string, unknown>;
}

export class RestaurantMockConnector implements ConnectorExecutor {
  readonly state: RestaurantMockState;
  #reservationSequence = 0;
  #orderSequence = 0;

  constructor(state: Partial<RestaurantMockState> = {}) {
    this.state = {
      menu:
        state.menu ??
        [
          {
            id: "coffee-1",
            name: "Oat Flat White",
            vegetarian: true,
            available: true,
            price: { amount: "6.80", currency: "USD" },
            version: "menu-v1",
          },
          {
            id: "sandwich-1",
            name: "Garden Sandwich",
            vegetarian: true,
            available: true,
            price: { amount: "12.00", currency: "USD" },
            version: "menu-v1",
          },
          {
            id: "steak-1",
            name: "Beef Steak",
            vegetarian: false,
            available: false,
            price: { amount: "28.00", currency: "USD" },
            version: "menu-v1",
          },
        ],
      reservations: state.reservations ?? new Map(),
      orders: state.orders ?? new Map(),
    };
  }

  execute<Input = unknown, Output = unknown>(
    context: ConnectorExecutionContext<Input>,
  ): Output | Promise<Output> {
    switch (context.capability.id) {
      case "menu.search":
        return this.#menuSearch(context.request.input) as Output;
      case "availability.check":
        return this.#availabilityCheck(context.request.input) as Output;
      case "reservation.create":
        return this.#reservationCreate(context.request.input) as Output;
      case "order.create":
        return this.#orderCreate(context.request.input) as Output;
      case "payment.request":
        return this.#paymentRequest(context.request.input) as Output;
      default:
        throw new BrivyaError(
          "CAPABILITY_UNAVAILABLE",
          `Mock restaurant connector does not implement ${context.capability.id}.`,
        );
    }
  }

  #menuSearch(input: unknown): unknown {
    const value = input as {
      query?: string;
      available_only?: boolean;
    };
    const query = value.query?.toLowerCase();
    const items = this.state.menu.filter((item) => {
      if (value.available_only && !item.available) return false;
      if (!query) return true;
      if (query === "vegetarian") return item.vegetarian;
      return item.name.toLowerCase().includes(query);
    });
    return { items };
  }

  #availabilityCheck(input: unknown): unknown {
    const value = input as { date: string; guests: number };
    return {
      date: value.date,
      guests: value.guests,
      slots: [
        {
          dateTime: `${value.date}T18:00:00+08:00`,
          timeZone: "Asia/Singapore",
          available: value.guests <= 6,
        },
        {
          dateTime: `${value.date}T19:30:00+08:00`,
          timeZone: "Asia/Singapore",
          available: value.guests <= 4,
        },
      ],
    };
  }

  #reservationCreate(input: unknown): unknown {
    const value = input as {
      guests: number;
      scheduledTime: { dateTime: string; timeZone: string };
    };
    const id = `res-${++this.#reservationSequence}`;
    const reservation = {
      reservationId: id,
      guests: value.guests,
      scheduledTime: value.scheduledTime,
      status: "confirmed",
    };
    this.state.reservations.set(id, reservation);
    return reservation;
  }

  #orderCreate(input: unknown): unknown {
    const value = input as {
      items: Array<{
        itemId: string;
        quantity: number;
        unitPrice: { amount: string; currency: string };
        version: string;
      }>;
    };

    let total = 0;
    let currency = "USD";

    for (const line of value.items) {
      const item = this.state.menu.find((candidate) => candidate.id === line.itemId);
      if (!item || !item.available) {
        throw new BrivyaError("CONFLICT", "Menu item is no longer available.", {
          details: { reason: "inventory_conflict", item_id: line.itemId },
        });
      }
      if (
        item.version !== line.version ||
        item.price.amount !== line.unitPrice.amount ||
        item.price.currency !== line.unitPrice.currency
      ) {
        throw new BrivyaError("CONFLICT", "Menu price snapshot is stale.", {
          details: { reason: "stale_price", item_id: line.itemId },
        });
      }
      currency = item.price.currency;
      total += Number(item.price.amount) * line.quantity;
    }

    const id = `order-${++this.#orderSequence}`;
    const order = {
      orderId: id,
      status: "created",
      total: { amount: total.toFixed(2), currency },
    };
    this.state.orders.set(id, order);
    return order;
  }

  #paymentRequest(input: unknown): unknown {
    const value = input as {
      orderId: string;
      amount: { amount: string; currency: string };
    };
    if (!this.state.orders.has(value.orderId)) {
      throw new BrivyaError("RESOURCE_NOT_FOUND", "Order not found.");
    }
    return {
      paymentId: `pay-${value.orderId}`,
      status: "authorized",
      amount: value.amount,
    };
  }
}
