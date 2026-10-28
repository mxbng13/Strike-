import { timestamp, uuid, numeric } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();
export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();
export const tsz = (name: string) => timestamp(name, { withTimezone: true });
export const money = (name: string) => numeric(name, { precision: 14, scale: 2, mode: "number" });
export const microMoney = (name: string) => numeric(name, { precision: 14, scale: 6, mode: "number" });
