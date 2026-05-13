// TODO: Use BullMQ with Redis instead of pg-boss for better performance and reliability.
import { DATABASE_URL } from "@audiobook/shared-libs/config/env.js";

import { PgBoss } from "pg-boss";

const connectionString = DATABASE_URL;

export const boss = new PgBoss(connectionString);

boss.on("error", (error) => console.error("pg-boss error:", error));
