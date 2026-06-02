import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { audiobooks } from "./audiobook.js";
import { relations } from "../index.js";

export const userLibrary = pgTable(
  "user_library",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    audiobookId: uuid("audiobook_id")
      .notNull()
      .references(() => audiobooks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_library_user_idx").on(table.userId),
    index("user_library_book_idx").on(table.audiobookId),
    unique("user_library_user_book_idx").on(table.userId, table.audiobookId),
  ],
).enableRLS();

export const userLibraryRelations = relations(userLibrary, ({ one }) => ({
  user: one(user, {
    fields: [userLibrary.userId],
    references: [user.id],
  }),
  audiobook: one(audiobooks, {
    fields: [userLibrary.audiobookId],
    references: [audiobooks.id],
  }),
}));
