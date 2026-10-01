export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type DecimalString = Brand<string, "DecimalString">;
export type CurrencyCode = Brand<string, "CurrencyCode">;
export type AbsoluteInstant = Brand<string, "AbsoluteInstant">;
export type IanaTimeZone = Brand<string, "IanaTimeZone">;
export type DateOnly = Brand<string, "DateOnly">;

export type DataClassification =
  | "public"
  | "internal"
  | "personal"
  | "sensitive"
  | "payment"
  | "credential";

export interface Money {
  amount: DecimalString;
  currency: CurrencyCode;
}

export interface ZonedBusinessTime {
  dateTime: AbsoluteInstant;
  timeZone: IanaTimeZone;
}

const DECIMAL_PATTERN = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function parseDecimalString(value: string): DecimalString {
  if (!DECIMAL_PATTERN.test(value)) {
    throw new TypeError(
      `Invalid DecimalString: ${value}. Use a plain decimal string without locale formatting or exponent notation.`,
    );
  }
  return value as DecimalString;
}

export function parseCurrencyCode(value: string): CurrencyCode {
  if (!CURRENCY_PATTERN.test(value)) {
    throw new TypeError(
      `Invalid currency code: ${value}. Expected an uppercase ISO 4217-style three-letter code.`,
    );
  }
  return value as CurrencyCode;
}

export function createMoney(amount: string, currency: string): Money {
  return {
    amount: parseDecimalString(amount),
    currency: parseCurrencyCode(currency),
  };
}

export function parseAbsoluteInstant(value: string): AbsoluteInstant {
  if (!RFC3339_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError(
      `Invalid absolute instant: ${value}. Expected RFC3339 with Z or an explicit numeric UTC offset.`,
    );
  }
  return value as AbsoluteInstant;
}

export function parseIanaTimeZone(value: string): IanaTimeZone {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
  } catch {
    throw new TypeError(
      `Invalid IANA time zone: ${value}. Expected a zone such as Asia/Singapore.`,
    );
  }
  return value as IanaTimeZone;
}

export function parseDateOnly(value: string): DateOnly {
  if (!DATE_ONLY_PATTERN.test(value)) {
    throw new TypeError(
      `Invalid date-only value: ${value}. Expected YYYY-MM-DD.`,
    );
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError(`Invalid calendar date: ${value}.`);
  }

  return value as DateOnly;
}

export interface ZonedBusinessTimeOptions {
  verifyOffset?: boolean;
}

export function createZonedBusinessTime(
  dateTime: string,
  timeZone: string,
  options: ZonedBusinessTimeOptions = {},
): ZonedBusinessTime {
  const instant = parseAbsoluteInstant(dateTime);
  const zone = parseIanaTimeZone(timeZone);

  if (options.verifyOffset !== false) {
    const date = new Date(instant);
    const declaredOffset = parseDeclaredOffsetMinutes(instant);
    const zoneOffset = getIanaOffsetMinutes(date, zone);

    if (declaredOffset !== zoneOffset) {
      throw new TypeError(
        `Offset/time-zone mismatch: ${dateTime} declares ${formatOffset(
          declaredOffset,
        )}, but ${timeZone} resolves to ${formatOffset(zoneOffset)} at that instant.`,
      );
    }
  }

  return { dateTime: instant, timeZone: zone };
}

function parseDeclaredOffsetMinutes(value: string): number {
  if (value.endsWith("Z")) {
    return 0;
  }

  const match = value.match(/([+-])(\d{2}):(\d{2})$/);
  if (!match) {
    throw new TypeError(`Missing RFC3339 UTC offset: ${value}.`);
  }

  const hours = Number(match[2]);
  const minutes = Number(match[3]);
  if (hours > 23 || minutes > 59) {
    throw new TypeError(`Invalid UTC offset: ${value}.`);
  }

  const total = hours * 60 + minutes;
  return match[1] === "+" ? total : -total;
}

function getIanaOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const values: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (
      part.type === "year" ||
      part.type === "month" ||
      part.type === "day" ||
      part.type === "hour" ||
      part.type === "minute" ||
      part.type === "second"
    ) {
      values[part.type] = Number(part.value);
    }
  }

  const localAsUtc = Date.UTC(
    values.year,
    values.month - 1,
    values.day,
    values.hour,
    values.minute,
    values.second,
  );

  return Math.round((localAsUtc - date.getTime()) / 60_000);
}

function formatOffset(minutes: number): string {
  if (minutes === 0) {
    return "Z";
  }
  const sign = minutes >= 0 ? "+" : "-";
  const absolute = Math.abs(minutes);
  const hours = Math.floor(absolute / 60)
    .toString()
    .padStart(2, "0");
  const mins = (absolute % 60).toString().padStart(2, "0");
  return `${sign}${hours}:${mins}`;
}
